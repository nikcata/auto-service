const express = require("express");
const db = require("../db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/appointments", verifyToken, (req, res) => {
    const sql = `
        SELECT
            appointments.*,
            customers.full_name AS customer_name,
            customers.phone AS customer_phone,
            cars.brand,
            cars.model,
            cars.registration_number
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

    const sql = `
        INSERT INTO appointments (customer_id, car_id, appointment_date, reason, status)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [customer_id, car_id, appointment_date, reason, status || "scheduled"], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json({
            message: "Appointment added successfully!",
            appointment_id: result.insertId
        });
    });
});

router.put("/appointments/:id", verifyToken, (req, res) => {
    const { customer_id, car_id, appointment_date, reason, status } = req.body;

    if (!customer_id || !car_id || !appointment_date) {
        return res.status(400).json({ error: "Customer, car and appointment date are required" });
    }

    const sql = `
        UPDATE appointments
        SET customer_id = ?, car_id = ?, appointment_date = ?, reason = ?, status = ?
        WHERE id = ?
    `;

    db.query(sql, [customer_id, car_id, appointment_date, reason, status || "scheduled", req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Appointment not found" });

        res.json({ message: "Appointment updated successfully!" });
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
    const sql = "DELETE FROM appointments WHERE id = ?";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Appointment not found" });

        res.json({ message: "Appointment deleted successfully!" });
    });
});

module.exports = router;
