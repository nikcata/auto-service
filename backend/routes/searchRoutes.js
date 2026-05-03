const express = require("express");
const db = require("../db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/search", verifyToken, (req, res) => {
    const query = (req.query.query || "").trim();

    if (!query) {
        return res.status(400).json({ error: "Search query is required" });
    }

    const searchValue = `%${query}%`;
    const sql = `
        SELECT
            cars.id AS car_id,
            cars.brand,
            cars.model,
            cars.registration_number,
            cars.vin,
            customers.id AS customer_id,
            customers.full_name AS customer_name,
            customers.phone AS customer_phone,
            COUNT(repairs.id) AS repairs_count,
            MAX(repairs.repair_date) AS last_repair_date
        FROM cars
        JOIN customers ON cars.customer_id = customers.id
        LEFT JOIN repairs ON repairs.car_id = cars.id
        WHERE
            cars.registration_number LIKE ?
            OR cars.vin LIKE ?
            OR cars.brand LIKE ?
            OR cars.model LIKE ?
            OR customers.full_name LIKE ?
            OR customers.phone LIKE ?
        GROUP BY cars.id, customers.id
        ORDER BY last_repair_date DESC, cars.created_at DESC
    `;

    db.query(
        sql,
        [searchValue, searchValue, searchValue, searchValue, searchValue, searchValue],
        (err, results) => {
            if (err) return res.status(500).json({ error: "Database error" });

            res.json(results);
        }
    );
});

module.exports = router;
