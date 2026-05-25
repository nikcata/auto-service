const express = require("express");
const db = require("../db");
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

function calculateLabor(hoursWorked, pricePerHour) {
    const hours = Math.round(Number(hoursWorked));
    const hourlyPrice = Number(pricePerHour || 40);

    if (!Number.isFinite(hours) || hours < 1) {
        return { error: "Трудът трябва да бъде поне 1 час" };
    }

    return {
        hours,
        hourlyPrice,
        laborPrice: hours * hourlyPrice
    };
}

function numberOrDefault(value, defaultValue) {
    if (value == null) return defaultValue;

    const normalizedValue = String(value).trim().replace(",", ".");
    if (normalizedValue === "") return defaultValue;

    return Number(normalizedValue);
}

function validatePartValues(quantity, unitPrice) {
    const partQuantity = numberOrDefault(quantity, 1);
    const partUnitPrice = numberOrDefault(unitPrice, 0);

    if (!Number.isInteger(partQuantity) || partQuantity < 1) {
        return { error: "Броят трябва да бъде цяло число поне 1" };
    }

    if (!Number.isFinite(partUnitPrice) || partUnitPrice < 0) {
        return { error: "Ед. цената трябва да бъде валидно число 0 или повече" };
    }

    const roundedUnitPrice = Math.round(partUnitPrice * 100) / 100;

    return {
        partQuantity,
        unitPrice: roundedUnitPrice,
        totalPrice: Math.round(partQuantity * roundedUnitPrice * 100) / 100
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
            customers.full_name AS customer_name,
            invoices.id AS invoice_id,
            invoices.status AS invoice_status
        FROM repairs
        JOIN cars ON repairs.car_id = cars.id
        JOIN customers ON cars.customer_id = customers.id
        LEFT JOIN invoices ON invoices.repair_id = repairs.id AND invoices.status <> 'cancelled'
        WHERE repairs.archived_at IS NULL
        ORDER BY
            CASE
                WHEN repairs.status = 'completed' THEN COALESCE(repairs.completed_at, CAST(repairs.repair_date AS DATETIME), repairs.created_at)
                ELSE COALESCE(CAST(repairs.repair_date AS DATETIME), repairs.created_at)
            END DESC,
            repairs.id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json(results);
    });
});

router.get("/repairs/archive", verifyToken, requireAdmin, (req, res) => {
    const sql = `
        SELECT
            repairs.*,
            cars.brand,
            cars.model,
            cars.registration_number,
            customers.full_name AS customer_name,
            invoices.id AS invoice_id,
            invoices.status AS invoice_status
        FROM repairs
        JOIN cars ON repairs.car_id = cars.id
        JOIN customers ON cars.customer_id = customers.id
        LEFT JOIN invoices ON invoices.repair_id = repairs.id AND invoices.status <> 'cancelled'
        WHERE repairs.archived_at IS NOT NULL
        ORDER BY repairs.archived_at DESC, repairs.repair_date DESC
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
        LEFT JOIN invoices ON invoices.repair_id = repairs.id AND invoices.status <> 'cancelled'
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
        WHERE car_id = ? AND archived_at IS NULL
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
                return res.status(409).json({ error: "Този записан час вече има започнат или завършен ремонт" });
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

    const labor = calculateLabor(hours_worked, price_per_hour);

    if (labor.error) {
        return res.status(400).json({ error: labor.error });
    }

    const { hours, hourlyPrice, laborPrice } = labor;

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

    const sql = `
        UPDATE repairs
        SET status = ?,
            completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE id = ?
    `;

    db.query(sql, [status, status, req.params.id], (err, result) => {
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

router.patch("/repairs/:id/restore", verifyToken, requireAdmin, (req, res) => {
    const sql = "UPDATE repairs SET archived_at = NULL, status = 'completed' WHERE id = ? AND archived_at IS NOT NULL";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Archived repair not found" });

        res.json({ message: "Repair restored successfully!" });
    });
});

router.delete("/repairs/:id", verifyToken, (req, res) => {
    db.query("SELECT status, archived_at FROM repairs WHERE id = ?", [req.params.id], (selectErr, repairs) => {
        if (selectErr) return res.status(500).json({ error: "Database error" });
        if (repairs.length === 0) return res.status(404).json({ error: "Repair not found" });

        const repair = repairs[0];

        if (repair.status === "completed") {
            if (req.user?.role !== "admin") {
                return res.status(403).json({ error: "Само админ може да архивира завършен ремонт" });
            }

            if (repair.archived_at) {
                return res.json({ message: "Repair already archived" });
            }

            db.query("UPDATE repairs SET archived_at = NOW() WHERE id = ?", [req.params.id], (archiveErr, result) => {
                if (archiveErr) return res.status(500).json({ error: "Database error" });
                if (result.affectedRows === 0) return res.status(404).json({ error: "Repair not found" });

                res.json({ message: "Repair archived successfully!" });
            });
            return;
        }

        db.query("DELETE FROM repair_parts WHERE repair_id = ?", [req.params.id], (partsDeleteErr) => {
            if (partsDeleteErr) return res.status(500).json({ error: "Database error" });

            db.query("DELETE FROM repairs WHERE id = ?", [req.params.id], (err, result) => {
                if (err) return res.status(500).json({ error: "Database error" });
                if (result.affectedRows === 0) return res.status(404).json({ error: "Repair not found" });

                res.json({ message: "Repair and parts deleted successfully!" });
            });
        });
    });
});

router.post("/repair-parts", verifyToken, (req, res) => {
    const { repair_id, part_name, brand, quantity, unit_price } = req.body;
    const normalizedPartName = String(part_name || "").trim();
    const normalizedBrand = String(brand || "").trim() || null;

    if (!repair_id || !normalizedPartName) {
        return res.status(400).json({ error: "Repair and part name are required" });
    }

    const partValues = validatePartValues(quantity, unit_price);
    if (partValues.error) {
        return res.status(400).json({ error: partValues.error });
    }

    const { partQuantity, unitPrice, totalPrice } = partValues;

    const sql = `
        INSERT INTO repair_parts
        (repair_id, part_name, brand, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query("SELECT id FROM repairs WHERE id = ?", [repair_id], (repairErr, repairs) => {
        if (repairErr) return res.status(500).json({ error: "Database error" });
        if (repairs.length === 0) return res.status(404).json({ error: "Repair not found" });

        db.query(sql, [repair_id, normalizedPartName, normalizedBrand, partQuantity, unitPrice, totalPrice], (err, result) => {
            if (err) return res.status(500).json({ error: "Database error" });

            updateRepairTotal(repair_id, (err2) => {
                if (err2) return res.status(500).json({ error: "Update error" });

                res.json({
                    message: "Part added!",
                    part_id: result.insertId,
                    part_total: totalPrice
                });
            });
        });
    });
});

router.put("/repair-parts/:id", verifyToken, (req, res) => {
    const { part_name, brand, quantity, unit_price } = req.body;
    const normalizedPartName = String(part_name || "").trim();
    const normalizedBrand = String(brand || "").trim() || null;

    if (!normalizedPartName) {
        return res.status(400).json({ error: "Part name is required" });
    }

    const partValues = validatePartValues(quantity, unit_price);
    if (partValues.error) {
        return res.status(400).json({ error: partValues.error });
    }

    const { partQuantity, unitPrice, totalPrice } = partValues;

    db.query("SELECT repair_id FROM repair_parts WHERE id = ?", [req.params.id], (selectErr, rows) => {
        if (selectErr) return res.status(500).json({ error: "Database error" });
        if (rows.length === 0) return res.status(404).json({ error: "Part not found" });

        const repairId = rows[0].repair_id;
        const sql = `
            UPDATE repair_parts
            SET part_name = ?, brand = ?, quantity = ?, unit_price = ?, total_price = ?
            WHERE id = ?
        `;

        db.query(sql, [normalizedPartName, normalizedBrand, partQuantity, unitPrice, totalPrice, req.params.id], (updateErr) => {
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
