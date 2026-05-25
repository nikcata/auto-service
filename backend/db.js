require("dotenv").config();

const mysql = require("mysql2");

if (!process.env.DB_PASSWORD) {
    throw new Error("Missing DB_PASSWORD in .env");
}

const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "auto_service_db",
    charset: "utf8mb4"
});

db.connect((err) => {
    if (err) {
        console.error("Database connection error:", err);
        return;
    }

    console.log("Connected to MySQL!");

    db.query("ALTER TABLE users MODIFY password VARCHAR(255) NULL", (migrationErr) => {
        if (migrationErr) {
            console.error("User password migration error:", migrationErr.message);
        }
    });

    db.query(`
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'repairs'
          AND COLUMN_NAME = 'completed_at'
    `, (columnErr, rows) => {
        if (columnErr) {
            console.error("Repair completed_at check error:", columnErr.message);
            return;
        }

        if (Number(rows[0]?.count || 0) > 0) return;

        db.query("ALTER TABLE repairs ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL AFTER status", (migrationErr) => {
            if (migrationErr) {
                console.error("Repair completed_at migration error:", migrationErr.message);
            }
        });
    });
});

module.exports = db;
