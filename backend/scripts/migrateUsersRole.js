const db = require("../db");

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

async function migrate() {
    const columns = await runQuery(`
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'role'
    `);

    if (columns[0].count === 0) {
        await runQuery("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'mechanic' AFTER service_name");
        console.log("role column added");
    } else {
        console.log("role column already exists");
    }

    const result = await runQuery(`
        UPDATE users
        SET role = 'admin'
        WHERE username IN ('admin', 'admin1')
           OR id = (SELECT first_id FROM (SELECT MIN(id) AS first_id FROM users) first_user)
    `);

    console.log(`admin users updated: ${result.affectedRows}`);
}

migrate()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(() => {
        db.end();
    });
