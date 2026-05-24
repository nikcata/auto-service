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

const PASSWORD_PATTERN = /^(?=.*[A-Za-zА-Яа-я])(?=.*\d).{4,8}$/;

function validatePassword(password) {
    return typeof password === "string" && PASSWORD_PATTERN.test(password);
}

function createUser(req, res) {
    const { username, role } = req.body;
    const cleanUsername = String(username || "").trim();
    const userRole = allowedRoles.has(role) ? role : "mechanic";

    if (!cleanUsername) {
        return res.status(400).json({ error: "Username is required" });
    }

    db.query("SELECT id FROM users WHERE username = ?", [cleanUsername], (selectErr, users) => {
        if (selectErr) {
            return res.status(500).json({ error: "Database error" });
        }

        if (users.length > 0) {
            return res.status(409).json({ error: "Username already exists" });
        }

        const sql = "INSERT INTO users (username, password, role) VALUES (?, NULL, ?)";

        db.query(sql, [cleanUsername, userRole], (err, result) => {
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
    });
}

router.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    const sql = "SELECT * FROM users WHERE BINARY username = ?";

    db.query(sql, [username], async (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Database error" });
        }

        if (results.length === 0) {
            return res.status(401).json({ message: "User not found" });
        }

        const user = results[0];

        if (!user.password) {
            return res.status(403).json({
                code: "PASSWORD_SETUP_REQUIRED",
                message: "Password setup required"
            });
        }

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
        SELECT id, username, role, created_at, password IS NOT NULL AS has_password
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
router.post("/password/reset", async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username) {
        return res.status(400).json({ error: "Username is required" });
    }

    if (!validatePassword(password)) {
        return res.status(400).json({ error: "Паролата трябва да е 4-8 символа и да съдържа поне една буква и една цифра" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.query("UPDATE users SET password = ? WHERE BINARY username = ?", [hashedPassword, username], (err, result) => {
            if (err) return res.status(500).json({ error: "Database error" });
            if (result.affectedRows === 0) return res.status(404).json({ error: "User not found" });

            res.json({ message: "Password updated successfully!" });
        });
    } catch (error) {
        res.status(500).json({ error: "Error hashing password" });
    }
});

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
