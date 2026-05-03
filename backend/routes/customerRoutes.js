const express = require("express");
const db = require("../db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/customers", verifyToken, (req, res) => {
    const sql = "SELECT * FROM customers ORDER BY created_at DESC";

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json(results);
    });
});

router.get("/customers/:id", verifyToken, (req, res) => {
    const sql = "SELECT * FROM customers WHERE id = ?";

    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (results.length === 0) return res.status(404).json({ error: "Customer not found" });

        res.json(results[0]);
    });
});

router.post("/customers", verifyToken, (req, res) => {
    const { full_name, phone, email, address } = req.body;

    if (!full_name) {
        return res.status(400).json({ error: "Full name is required" });
    }

    const sql = "INSERT INTO customers (full_name, phone, email, address) VALUES (?, ?, ?, ?)";

    db.query(sql, [full_name, phone, email, address], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json({
            message: "Customer added successfully!",
            customer_id: result.insertId
        });
    });
});

router.put("/customers/:id", verifyToken, (req, res) => {
    const { full_name, phone, email, address } = req.body;

    if (!full_name) {
        return res.status(400).json({ error: "Full name is required" });
    }

    const sql = `
        UPDATE customers
        SET full_name = ?, phone = ?, email = ?, address = ?
        WHERE id = ?
    `;

    db.query(sql, [full_name, phone, email, address, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Customer not found" });

        res.json({ message: "Customer updated successfully!" });
    });
});

router.delete("/customers/:id", verifyToken, (req, res) => {
    const sql = "DELETE FROM customers WHERE id = ?";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Customer not found" });

        res.json({ message: "Customer deleted successfully!" });
    });
});

module.exports = router;
