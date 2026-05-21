const express = require("express");
const db = require("../db");
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

const NAME_PATTERN = /^[A-Za-zА-Яа-яЁёЀ-ӿ]+(?:[\s'-][A-Za-zА-Яа-яЁёЀ-ӿ]+)*$/u;
const PHONE_PATTERN = /^(?:\+359|0)[\s-]*\(?[7-9]\d{2}\)?[\s-]*\d{3}[\s-]*\d{3}$/;

function validateCustomer(fullName, phone) {
    if (!fullName || !phone) {
        return "Име и телефон са задължителни";
    }

    if (fullName.length < 2 || !NAME_PATTERN.test(fullName)) {
        return "Името може да съдържа само букви, интервал, тире или апостроф";
    }

    if (!PHONE_PATTERN.test(phone)) {
        return "Телефонът трябва да е валиден български номер, например 0888123456 или +359 888 123 456";
    }

    return null;
}

function ensureSoftDeleteColumn() {
    db.query("SHOW COLUMNS FROM customers LIKE 'deleted_at'", (err, columns) => {
        if (err || columns.length > 0) return;

        db.query("ALTER TABLE customers ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL", (alterErr) => {
            if (alterErr) console.error("Customer archive migration error:", alterErr);
        });
    });
}

ensureSoftDeleteColumn();

router.get("/customers", verifyToken, (req, res) => {
    const sql = "SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY created_at DESC";

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
    const { full_name, phone } = req.body;
    const normalizedName = String(full_name || "").trim();
    const normalizedPhone = String(phone || "").trim();

    const validationError = validateCustomer(normalizedName, normalizedPhone);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const sql = "INSERT INTO customers (full_name, phone) VALUES (?, ?)";

    db.query(sql, [normalizedName, normalizedPhone], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json({
            message: "Customer added successfully!",
            customer_id: result.insertId
        });
    });
});

router.put("/customers/:id", verifyToken, requireAdmin, (req, res) => {
    const { full_name, phone } = req.body;
    const normalizedName = String(full_name || "").trim();
    const normalizedPhone = String(phone || "").trim();

    const validationError = validateCustomer(normalizedName, normalizedPhone);

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const sql = `
        UPDATE customers
        SET full_name = ?, phone = ?
        WHERE id = ?
    `;

    db.query(sql, [normalizedName, normalizedPhone, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Customer not found" });

        res.json({ message: "Customer updated successfully!" });
    });
});

router.delete("/customers/:id", verifyToken, requireAdmin, (req, res) => {
    const sql = "UPDATE customers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Customer not found" });

        res.json({ message: "Customer archived successfully!" });
    });
});

module.exports = router;
