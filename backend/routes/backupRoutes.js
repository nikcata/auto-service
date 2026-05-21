const express = require("express");
const mysql = require("mysql2");
const dbConnection = require("../db");
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();
const db = dbConnection.promise();

function backupFileName() {
    const stamp = new Date()
        .toISOString()
        .replace("T", "_")
        .replace(/\..+/, "")
        .replaceAll(":", "-");

    return `auto_service_backup_${stamp}.sql`;
}

function sqlComment(text) {
    return `-- ${String(text).replaceAll("\n", " ")}\n`;
}

router.get("/backup/database", verifyToken, requireAdmin, async (req, res) => {
    try {
        const [databaseRows] = await db.query("SELECT DATABASE() AS database_name");
        const databaseName = databaseRows[0]?.database_name || process.env.DB_NAME || "auto_service_db";
        const [tables] = await db.query(`
            SELECT table_name AS table_name
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);

        const lines = [
            sqlComment("Auto Service database backup"),
            sqlComment(`Created at ${new Date().toISOString()}`),
            `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
            `USE ${mysql.escapeId(databaseName)};`,
            "SET FOREIGN_KEY_CHECKS=0;",
            ""
        ];

        tables.forEach((table) => {
            lines.push(`DROP TABLE IF EXISTS ${mysql.escapeId(table.table_name)};`);
        });

        lines.push("");

        for (const table of tables) {
            const tableName = table.table_name;
            const [createRows] = await db.query(`SHOW CREATE TABLE ${mysql.escapeId(tableName)}`);
            const createStatement = createRows[0]?.["Create Table"];

            if (createStatement) {
                lines.push(`${createStatement};`, "");
            }
        }

        for (const table of tables) {
            const tableName = table.table_name;
            const [rows] = await db.query(`SELECT * FROM ${mysql.escapeId(tableName)}`);

            if (!rows.length) {
                lines.push(sqlComment(`No rows for ${tableName}`), "");
                continue;
            }

            lines.push(sqlComment(`Data for ${tableName}`));

            rows.forEach((row) => {
                const columns = Object.keys(row).map((column) => mysql.escapeId(column)).join(", ");
                const values = Object.values(row).map((value) => mysql.escape(value)).join(", ");
                lines.push(`INSERT INTO ${mysql.escapeId(tableName)} (${columns}) VALUES (${values});`);
            });

            lines.push("");
        }

        lines.push("SET FOREIGN_KEY_CHECKS=1;", "");

        res.setHeader("Content-Type", "application/sql; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${backupFileName()}"`);
        res.send(lines.join("\n"));
    } catch (error) {
        res.status(500).json({ error: "Database backup failed" });
    }
});

module.exports = router;
