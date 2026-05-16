const express = require("express");
const db = require("../db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

function normalizeVin(vin) {
    const value = String(vin || "").trim().toUpperCase();
    return value || null;
}

function validateVin(vin) {
    if (!vin) return null;

    if (vin.length !== 17) {
        return "VIN must be exactly 17 characters";
    }

    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
        return "VIN can contain only numbers and letters without I, O and Q";
    }

    return null;
}

router.get("/cars", verifyToken, (req, res) => {
    const sql = `
        SELECT cars.*, customers.full_name AS customer_name
        FROM cars
        JOIN customers ON cars.customer_id = customers.id
        ORDER BY cars.created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json(results);
    });
});

router.get("/cars/:id", verifyToken, (req, res) => {
    const sql = `
        SELECT cars.*, customers.full_name AS customer_name, customers.phone AS customer_phone
        FROM cars
        JOIN customers ON cars.customer_id = customers.id
        WHERE cars.id = ?
    `;

    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (results.length === 0) return res.status(404).json({ error: "Car not found" });

        res.json(results[0]);
    });
});

router.post("/cars", verifyToken, (req, res) => {
    const { customer_id, brand, model, year, registration_number, vin, engine, mileage } = req.body;
    const normalizedVin = normalizeVin(vin);
    const vinError = validateVin(normalizedVin);

    if (!customer_id || !brand || !model) {
        return res.status(400).json({ error: "Customer, brand and model are required" });
    }

    if (vinError) {
        return res.status(400).json({ error: vinError });
    }

    const sql = `
        INSERT INTO cars 
        (customer_id, brand, model, year, registration_number, vin, engine, mileage)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [customer_id, brand, model, year, registration_number, normalizedVin, engine, mileage], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json({
            message: "Car added successfully!",
            car_id: result.insertId
        });
    });
});

router.put("/cars/:id", verifyToken, (req, res) => {
    const { customer_id, brand, model, year, registration_number, vin, engine, mileage } = req.body;
    const normalizedVin = normalizeVin(vin);
    const vinError = validateVin(normalizedVin);

    if (!customer_id || !brand || !model) {
        return res.status(400).json({ error: "Customer, brand and model are required" });
    }

    if (vinError) {
        return res.status(400).json({ error: vinError });
    }

    const sql = `
        UPDATE cars
        SET customer_id = ?, brand = ?, model = ?, year = ?, registration_number = ?, vin = ?, engine = ?, mileage = ?
        WHERE id = ?
    `;

    db.query(
        sql,
        [customer_id, brand, model, year, registration_number, normalizedVin, engine, mileage, req.params.id],
        (err, result) => {
            if (err) return res.status(500).json({ error: "Database error" });
            if (result.affectedRows === 0) return res.status(404).json({ error: "Car not found" });

            res.json({ message: "Car updated successfully!" });
        }
    );
});

router.delete("/cars/:id", verifyToken, (req, res) => {
    const sql = "DELETE FROM cars WHERE id = ?";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Car not found" });

        res.json({ message: "Car deleted successfully!" });
    });
});

module.exports = router;
