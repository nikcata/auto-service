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
});

module.exports = db;
