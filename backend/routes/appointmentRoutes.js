const express = require("express");
const db = require("../db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

function validateFutureAppointment(appointmentDate) {
    const date = new Date(String(appointmentDate || "").replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
        return "Невалидна дата и час";
    }

    if (date <= new Date()) {
        return "Не може да се записва час със задна дата или минал час";
    }

    return null;
}

function validateAppointmentTimeStep(appointmentDate) {
    const date = new Date(String(appointmentDate || "").replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
        return "Невалидна дата и час";
    }

    if (date.getMinutes() % 30 !== 0 || date.getSeconds() !== 0) {
        return "Часът трябва да бъде на 30 минути, например 09:00, 09:30 или 10:00";
    }

    return null;
}

function ensureAvailableAppointmentSlot(appointmentDate, excludeAppointmentId, callback) {
    const sql = `
        SELECT id, appointment_date
        FROM appointments
        WHERE status = 'scheduled'
          AND ABS(TIMESTAMPDIFF(MINUTE, appointment_date, ?)) < 30
          AND (? IS NULL OR id <> ?)
        LIMIT 1
    `;

    db.query(sql, [appointmentDate, excludeAppointmentId || null, excludeAppointmentId || null], (err, appointments) => {
        if (err) return callback(err);

        if (appointments.length > 0) {
            return callback(null, "Вече има записан час в този 30-минутен интервал");
        }

        callback(null, null);
    });
}

router.get("/appointments", verifyToken, (req, res) => {
    const sql = `
        SELECT
            appointments.*,
            customers.full_name AS customer_name,
            customers.phone AS customer_phone,
            cars.brand,
            cars.model,
            cars.registration_number,
            EXISTS (
                SELECT 1
                FROM repairs
                WHERE repairs.appointment_id = appointments.id
            ) AS has_repair
        FROM appointments
        JOIN customers ON appointments.customer_id = customers.id
        JOIN cars ON appointments.car_id = cars.id
        ORDER BY appointments.appointment_date ASC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json(results);
    });
});

router.post("/appointments", verifyToken, (req, res) => {
    const { customer_id, car_id, appointment_date, reason, status } = req.body;

    if (!customer_id || !car_id || !appointment_date) {
        return res.status(400).json({ error: "Customer, car and appointment date are required" });
    }

    const dateError = validateFutureAppointment(appointment_date);
    if (dateError) {
        return res.status(400).json({ error: dateError });
    }

    const timeStepError = validateAppointmentTimeStep(appointment_date);
    if (timeStepError) {
        return res.status(400).json({ error: timeStepError });
    }

    const sql = `
        INSERT INTO appointments (customer_id, car_id, appointment_date, reason, status)
        VALUES (?, ?, ?, ?, ?)
    `;

    ensureAvailableAppointmentSlot(appointment_date, null, (slotErr, slotError) => {
        if (slotErr) return res.status(500).json({ error: "Database error" });
        if (slotError) return res.status(409).json({ error: slotError });

        db.query(sql, [customer_id, car_id, appointment_date, reason, status || "scheduled"], (err, result) => {
            if (err) return res.status(500).json({ error: "Database error" });

            res.json({
                message: "Appointment added successfully!",
                appointment_id: result.insertId
            });
        });
    });
});

router.put("/appointments/:id", verifyToken, (req, res) => {
    const { customer_id, car_id, appointment_date, reason, status } = req.body;

    if (!customer_id || !car_id || !appointment_date) {
        return res.status(400).json({ error: "Customer, car and appointment date are required" });
    }

    if ((status || "scheduled") === "scheduled") {
        const dateError = validateFutureAppointment(appointment_date);
        if (dateError) {
            return res.status(400).json({ error: dateError });
        }

        const timeStepError = validateAppointmentTimeStep(appointment_date);
        if (timeStepError) {
            return res.status(400).json({ error: timeStepError });
        }
    }

    const sql = `
        UPDATE appointments
        SET customer_id = ?, car_id = ?, appointment_date = ?, reason = ?, status = ?
        WHERE id = ?
    `;

    const updateAppointment = () => {
        db.query(sql, [customer_id, car_id, appointment_date, reason, status || "scheduled", req.params.id], (err, result) => {
            if (err) return res.status(500).json({ error: "Database error" });
            if (result.affectedRows === 0) return res.status(404).json({ error: "Appointment not found" });

            res.json({ message: "Appointment updated successfully!" });
        });
    };

    if ((status || "scheduled") !== "scheduled") {
        return updateAppointment();
    }

    ensureAvailableAppointmentSlot(appointment_date, req.params.id, (slotErr, slotError) => {
        if (slotErr) return res.status(500).json({ error: "Database error" });
        if (slotError) return res.status(409).json({ error: slotError });

        updateAppointment();
    });
});

router.patch("/appointments/:id/status", verifyToken, (req, res) => {
    const { status } = req.body;
    const allowedStatuses = ["scheduled", "completed", "cancelled"];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid appointment status" });
    }

    const sql = "UPDATE appointments SET status = ? WHERE id = ?";

    db.query(sql, [status, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Appointment not found" });

        res.json({ message: "Appointment status updated successfully!" });
    });
});

router.delete("/appointments/:id", verifyToken, (req, res) => {
    db.query("SELECT id FROM repairs WHERE appointment_id = ? LIMIT 1", [req.params.id], (repairErr, repairs) => {
        if (repairErr) return res.status(500).json({ error: "Database error" });
        if (repairs.length > 0) {
            return res.status(409).json({ error: "Не може да изтриеш час, към който вече има започнат ремонт" });
        }

        const sql = "DELETE FROM appointments WHERE id = ?";

        db.query(sql, [req.params.id], (err, result) => {
            if (err) return res.status(500).json({ error: "Database error" });
            if (result.affectedRows === 0) return res.status(404).json({ error: "Appointment not found" });

            res.json({ message: "Appointment deleted successfully!" });
        });
    });
});

module.exports = router;
