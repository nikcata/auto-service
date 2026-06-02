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

    function ensureColumn(tableName, columnName, alterSql) {
        const checkSql = `
            SELECT COUNT(*) AS count
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_NAME = ?
        `;

        db.query(checkSql, [tableName, columnName], (columnErr, rows) => {
            if (columnErr) {
                console.error(`${tableName}.${columnName} check error:`, columnErr.message);
                return;
            }

            if (Number(rows[0]?.count || 0) > 0) return;

            db.query(alterSql, (migrationErr) => {
                if (migrationErr) {
                    console.error(`${tableName}.${columnName} migration error:`, migrationErr.message);
                }
            });
        });
    }

    db.query("ALTER TABLE users MODIFY password VARCHAR(255) NULL", (migrationErr) => {
        if (migrationErr) {
            console.error("User password migration error:", migrationErr.message);
        }
    });

    db.query("ALTER TABLE appointments MODIFY reason TEXT", (migrationErr) => {
        if (migrationErr) {
            console.error("Appointment reason migration error:", migrationErr.message);
        }
    });

    db.query("ALTER TABLE cars MODIFY vin VARCHAR(17)", (migrationErr) => {
        if (migrationErr) {
            console.error("Car VIN migration error:", migrationErr.message);
        }
    });

    ensureColumn("users", "role", "ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'mechanic' AFTER password");
    ensureColumn("customers", "deleted_at", "ALTER TABLE customers ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER phone");
    ensureColumn("cars", "deleted_at", "ALTER TABLE cars ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER mileage");
    ensureColumn("repairs", "appointment_id", "ALTER TABLE repairs ADD COLUMN appointment_id INT UNIQUE AFTER id");
    ensureColumn("repairs", "mechanic_name", "ALTER TABLE repairs ADD COLUMN mechanic_name VARCHAR(100) AFTER repair_date");
    ensureColumn("repairs", "hours_worked", "ALTER TABLE repairs ADD COLUMN hours_worked DECIMAL(5,2) AFTER description");
    ensureColumn("repairs", "price_per_hour", "ALTER TABLE repairs ADD COLUMN price_per_hour DECIMAL(10,2) AFTER hours_worked");
    ensureColumn("repairs", "completed_at", "ALTER TABLE repairs ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL AFTER status");
    ensureColumn("repairs", "archived_at", "ALTER TABLE repairs ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER completed_at");
    ensureColumn("invoices", "status", "ALTER TABLE invoices ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'issued' AFTER pdf_path");
});

module.exports = db;
