const express = require("express");
const db = require("../db");
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

function calculateLabor(hoursWorked, pricePerHour) {
    const hours = Math.max(0, Math.round(Number(hoursWorked || 0)));
    const hourlyPrice = Number(pricePerHour || 40);

    return {
        hours,
        hourlyPrice,
        laborPrice: hours * hourlyPrice
    };
}

function updateRepairTotal(repairId, callback) {
    const updateSql = `
        UPDATE repairs
        SET total_price = ROUND(labor_price + (
            SELECT IFNULL(SUM(total_price), 0)
            FROM repair_parts
            WHERE repair_id = ?
        ), 2)
        WHERE id = ?
    `;

    db.query(updateSql, [repairId, repairId], callback);
}

router.get("/repairs", verifyToken, (req, res) => {
    const sql = `
        SELECT
            repairs.*,
            cars.brand,
            cars.model,
            cars.registration_number,
            customers.full_name AS customer_name
        FROM repairs
        JOIN cars ON repairs.car_id = cars.id
        JOIN customers ON cars.customer_id = customers.id
        ORDER BY repairs.repair_date DESC, repairs.created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json(results);
    });
});

router.get("/repairs/:id", verifyToken, (req, res) => {
    const repairSql = `
        SELECT
            repairs.*,
            cars.brand,
            cars.model,
            cars.registration_number,
            cars.vin,
            customers.full_name AS customer_name,
            customers.phone AS customer_phone
        FROM repairs
        JOIN cars ON repairs.car_id = cars.id
        JOIN customers ON cars.customer_id = customers.id
        WHERE repairs.id = ?
    `;

    db.query(repairSql, [req.params.id], (err, repairs) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (repairs.length === 0) return res.status(404).json({ error: "Repair not found" });

        db.query("SELECT * FROM repair_parts WHERE repair_id = ?", [req.params.id], (partsErr, parts) => {
            if (partsErr) return res.status(500).json({ error: "Database error" });

            res.json({
                ...repairs[0],
                parts
            });
        });
    });
});

router.get("/cars/:carId/repairs", verifyToken, (req, res) => {
    const sql = `
        SELECT repairs.*
        FROM repairs
        WHERE car_id = ?
        ORDER BY repair_date DESC, created_at DESC
    `;

    db.query(sql, [req.params.carId], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json(results);
    });
});

router.post("/appointments/:id/start-repair", verifyToken, (req, res) => {
    const appointmentSql = `
        SELECT appointments.*, cars.customer_id
        FROM appointments
        JOIN cars ON appointments.car_id = cars.id
        WHERE appointments.id = ?
    `;

    db.query(appointmentSql, [req.params.id], (appointmentErr, appointments) => {
        if (appointmentErr) return res.status(500).json({ error: "Database error" });
        if (appointments.length === 0) return res.status(404).json({ error: "Appointment not found" });

        const appointment = appointments[0];
        if (appointment.status === "cancelled") {
            return res.status(400).json({ error: "Cancelled appointments cannot be started as repairs" });
        }

        db.query("SELECT id FROM repairs WHERE appointment_id = ?", [appointment.id], (repairErr, repairs) => {
            if (repairErr) return res.status(500).json({ error: "Database error" });
            if (repairs.length > 0) {
                return res.status(409).json({ error: "Repair already exists for this appointment" });
            }

            const sql = `
                INSERT INTO repairs
                (appointment_id, car_id, repair_date, mechanic_name, description, labor_price, total_price, status, hours_worked, price_per_hour)
                VALUES (?, ?, DATE(?), ?, ?, 0, 0, 'open', 0, 40)
            `;

            db.query(sql, [
                appointment.id,
                appointment.car_id,
                appointment.appointment_date,
                req.user?.username || "mechanic",
                appointment.reason || ""
            ], (insertErr, result) => {
                if (insertErr) {
                    if (insertErr.code === "ER_DUP_ENTRY") {
                        return res.status(409).json({ error: "Repair already exists for this appointment" });
                    }

                    return res.status(500).json({ error: "Database error" });
                }

                res.json({
                    message: "Repair started from appointment",
                    repair_id: result.insertId
                });
            });
        });
    });
});

router.put("/repairs/:id", verifyToken, (req, res) => {
    const { car_id, repair_date, mechanic_name, description, hours_worked, price_per_hour, status } = req.body;

    if (!car_id || !repair_date || !mechanic_name) {
        return res.status(400).json({ error: "Car, repair date and mechanic name are required" });
    }

    const { hours, hourlyPrice, laborPrice } = calculateLabor(hours_worked, price_per_hour);

    const sql = `
        UPDATE repairs
        SET car_id = ?, repair_date = ?, mechanic_name = ?, description = ?, labor_price = ?, status = ?, hours_worked = ?, price_per_hour = ?
        WHERE id = ?
    `;

    db.query(sql, [car_id, repair_date, mechanic_name, description, laborPrice, status || "open", hours, hourlyPrice, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Repair not found" });

        updateRepairTotal(req.params.id, (updateErr) => {
            if (updateErr) return res.status(500).json({ error: "Update error" });

            res.json({ message: "Repair updated successfully!" });
        });
    });
});

router.patch("/repairs/:id/status", verifyToken, (req, res) => {
    const { status } = req.body;
    const allowedStatuses = ["open", "completed"];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid repair status" });
    }

    db.query("UPDATE repairs SET status = ? WHERE id = ?", [status, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Repair not found" });

        if (status !== "completed") {
            return res.json({ message: "Repair status updated successfully!" });
        }

        db.query("SELECT appointment_id FROM repairs WHERE id = ?", [req.params.id], (selectErr, repairs) => {
            if (selectErr) return res.status(500).json({ error: "Database error" });
            const appointmentId = repairs[0]?.appointment_id;

            if (!appointmentId) {
                return res.json({ message: "Repair status updated successfully!" });
            }

            db.query("UPDATE appointments SET status = 'completed' WHERE id = ?", [appointmentId], (updateErr) => {
                if (updateErr) return res.status(500).json({ error: "Database error" });

                res.json({ message: "Repair status updated successfully!" });
            });
        });
    });
});

router.delete("/repairs/:id", verifyToken, requireAdmin, (req, res) => {
    const sql = "DELETE FROM repairs WHERE id = ?";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Repair not found" });

        res.json({ message: "Repair deleted successfully!" });
    });
});

router.post("/repair-parts", verifyToken, (req, res) => {
    const { repair_id, part_name, brand, quantity, unit_price } = req.body;

    if (!repair_id || !part_name) {
        return res.status(400).json({ error: "Repair and part name are required" });
    }

    const partQuantity = Number(quantity || 1);
    const unitPrice = Number(unit_price || 0);
    const total_price = partQuantity * unitPrice;

    const sql = `
        INSERT INTO repair_parts
        (repair_id, part_name, brand, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query("SELECT id FROM repairs WHERE id = ?", [repair_id], (repairErr, repairs) => {
        if (repairErr) return res.status(500).json({ error: "Database error" });
        if (repairs.length === 0) return res.status(404).json({ error: "Repair not found" });

        db.query(sql, [repair_id, part_name, brand, partQuantity, unitPrice, total_price], (err, result) => {
            if (err) return res.status(500).json({ error: "Database error" });

            updateRepairTotal(repair_id, (err2) => {
                if (err2) return res.status(500).json({ error: "Update error" });

                res.json({
                    message: "Part added!",
                    part_id: result.insertId,
                    part_total: total_price
                });
            });
        });
    });
});

router.put("/repair-parts/:id", verifyToken, (req, res) => {
    const { part_name, brand, quantity, unit_price } = req.body;

    if (!part_name) {
        return res.status(400).json({ error: "Part name is required" });
    }

    const partQuantity = Number(quantity || 1);
    const unitPrice = Number(unit_price || 0);
    const total_price = partQuantity * unitPrice;

    db.query("SELECT repair_id FROM repair_parts WHERE id = ?", [req.params.id], (selectErr, rows) => {
        if (selectErr) return res.status(500).json({ error: "Database error" });
        if (rows.length === 0) return res.status(404).json({ error: "Part not found" });

        const repairId = rows[0].repair_id;
        const sql = `
            UPDATE repair_parts
            SET part_name = ?, brand = ?, quantity = ?, unit_price = ?, total_price = ?
            WHERE id = ?
        `;

        db.query(sql, [part_name, brand, partQuantity, unitPrice, total_price, req.params.id], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: "Database error" });

            updateRepairTotal(repairId, (totalErr) => {
                if (totalErr) return res.status(500).json({ error: "Update error" });

                res.json({ message: "Part updated successfully!" });
            });
        });
    });
});

router.delete("/repair-parts/:id", verifyToken, (req, res) => {
    db.query("SELECT repair_id FROM repair_parts WHERE id = ?", [req.params.id], (selectErr, rows) => {
        if (selectErr) return res.status(500).json({ error: "Database error" });
        if (rows.length === 0) return res.status(404).json({ error: "Part not found" });

        const repairId = rows[0].repair_id;

        db.query("DELETE FROM repair_parts WHERE id = ?", [req.params.id], (deleteErr) => {
            if (deleteErr) return res.status(500).json({ error: "Database error" });

            updateRepairTotal(repairId, (updateErr) => {
                if (updateErr) return res.status(500).json({ error: "Update error" });

                res.json({ message: "Part deleted successfully!" });
            });
        });
    });
});

module.exports = router;
