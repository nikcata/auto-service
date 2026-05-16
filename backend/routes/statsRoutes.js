const express = require("express");
const db = require("../db");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

const incomePeriods = {
    week: "repair_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)",
    month: "repair_date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)",
    three_months: "repair_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)",
    year: "repair_date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)"
};

router.get("/stats", verifyToken, (req, res) => {
    const stats = {};
    const incomePeriod = incomePeriods[req.query.income_period] ? req.query.income_period : "month";

    db.query("SELECT COUNT(*) AS total_customers FROM customers", (err, r1) => {
        if (err) return res.status(500).json({ error: "DB error" });

        stats.total_customers = r1[0].total_customers;

        db.query("SELECT COUNT(*) AS total_repairs FROM repairs WHERE status = 'completed'", (err, r2) => {
            if (err) return res.status(500).json({ error: "DB error" });

            stats.total_repairs = r2[0].total_repairs;
            stats.income_period = incomePeriod;

            if (req.user?.role !== "admin") {
                stats.total_income = null;
                return res.json(stats);
            }

            db.query(`SELECT SUM(total_price) AS total_income FROM repairs WHERE status = 'completed' AND ${incomePeriods[incomePeriod]}`, (err, r3) => {
                if (err) return res.status(500).json({ error: "DB error" });

                stats.total_income = r3[0].total_income || 0;

                res.json(stats);
            });
        });
    });
});

module.exports = router;
