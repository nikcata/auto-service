const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { SECRET_KEY, verifyToken, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();
const allowedRoles = new Set(["admin", "mechanic"]);

function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        role: user.role || "mechanic",
        created_at: user.created_at
    };
}

function createUser(req, res) {
    const { username, password, role } = req.body;
    const userRole = allowedRoles.has(role) ? role : "mechanic";

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    db.query("SELECT id FROM users WHERE username = ?", [username], async (selectErr, users) => {
        if (selectErr) {
            return res.status(500).json({ error: "Database error" });
        }

        if (users.length > 0) {
            return res.status(409).json({ error: "Username already exists" });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const sql = "INSERT INTO users (username, password, role) VALUES (?, ?, ?)";

            db.query(sql, [username, hashedPassword, userRole], (err, result) => {
                if (err) {
                    if (err.code === "ER_DUP_ENTRY") {
                        return res.status(409).json({ error: "Username already exists" });
                    }

                    return res.status(500).json({ error: "Database error" });
                }

                res.json({
                    message: "User created successfully!",
                    user_id: result.insertId
                });
            });
        } catch (error) {
            res.status(500).json({ error: "Error hashing password" });
        }
    });
}

router.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    const sql = "SELECT * FROM users WHERE username = ?";

    db.query(sql, [username], async (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Database error" });
        }

        if (results.length === 0) {
            return res.status(401).json({ message: "User not found" });
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Wrong password" });
        }

        const role = user.role || "admin";
        const token = jwt.sign(
            { id: user.id, username: user.username, role },
            SECRET_KEY,
            { expiresIn: "1h" }
        );

        res.json({
            message: "Login successful",
            token,
            user: publicUser({ ...user, role })
        });
    });
});

router.get("/users", verifyToken, requireAdmin, (req, res) => {
    const sql = `
        SELECT id, username, role, created_at
        FROM users
        ORDER BY
            CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
            username ASC
    `;

    db.query(sql, (err, users) => {
        if (err) return res.status(500).json({ error: "Database error" });

        res.json(users);
    });
});

router.post("/users", verifyToken, requireAdmin, createUser);
router.post("/register", verifyToken, requireAdmin, createUser);

router.delete("/users/:id", verifyToken, requireAdmin, (req, res) => {
    const userId = Number(req.params.id);

    if (userId === req.user.id) {
        return res.status(400).json({ error: "You cannot delete your own account" });
    }

    db.query("DELETE FROM users WHERE id = ?", [userId], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (result.affectedRows === 0) return res.status(404).json({ error: "User not found" });

        res.json({ message: "User deleted successfully!" });
    });
});

module.exports = router;
