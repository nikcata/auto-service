const express = require("express");
const db = require("../db");
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

const VEHICLE_TEXT_PATTERN = /^[A-Za-zА-Яа-яЁёЀ-ӿ0-9][A-Za-zА-Яа-яЁёЀ-ӿ0-9\s.'/-]*$/u;
const REGISTRATION_PATTERN = /^[A-ZА-Я0-9][A-ZА-Я0-9\s-]{1,18}[A-ZА-Я0-9]$/u;
const ENGINE_PATTERN = /^[A-Za-zА-Яа-яЁёЀ-ӿ0-9][A-Za-zА-Яа-яЁёЀ-ӿ0-9\s.,'/-]*$/u;
const MIN_CAR_YEAR = 1900;
const MAX_CAR_YEAR = new Date().getFullYear() + 1;
const MAX_MILEAGE = 2000000;

function normalizeRegistrationNumber(registrationNumber) {
    return String(registrationNumber || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function validateCar({ brand, model, registrationNumber, year, mileage, engine }) {
    if (!brand || !model || !registrationNumber) {
        return "Клиент, марка, модел и рег. номер са задължителни";
    }

    if (!VEHICLE_TEXT_PATTERN.test(brand)) {
        return "Марката съдържа невалидни символи";
    }

    if (!VEHICLE_TEXT_PATTERN.test(model)) {
        return "Моделът съдържа невалидни символи";
    }

    if (!REGISTRATION_PATTERN.test(registrationNumber)) {
        return "Рег. номерът може да съдържа само букви, цифри, интервал и тире";
    }

    if (engine && !ENGINE_PATTERN.test(engine)) {
        return "Двигателят съдържа невалидни символи";
    }

    if (year != null) {
        const numericYear = Number(year);
        if (!Number.isInteger(numericYear) || numericYear < MIN_CAR_YEAR || numericYear > MAX_CAR_YEAR) {
            return "Годината трябва да е между " + MIN_CAR_YEAR + " и " + MAX_CAR_YEAR;
        }
    }

    if (mileage != null) {
        const numericMileage = Number(mileage);
        if (!Number.isInteger(numericMileage) || numericMileage < 0 || numericMileage > MAX_MILEAGE) {
            return "Километрите трябва да са число между 0 и " + MAX_MILEAGE;
        }
    }

    return null;
}

function normalizeVin(vin) {
    const value = String(vin || "").trim().toUpperCase();
    return value || null;
}

function validateVin(vin) {
    if (!vin) return null;

    if (vin.length !== 17) {
        return "VIN must be exactly 17 characters";
    }

    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
        return "VIN can contain only numbers and letters without I, O and Q";
    }

    return null;
}

function ensureSoftDeleteColumn() {
    db.query("SHOW COLUMNS FROM cars LIKE 'deleted_at'", (err, columns) => {
        if (err || columns.length > 0) return;

        db.query("ALTER TABLE cars ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL", (alterErr) => {
            if (alterErr) console.error("Car archive migration error:", alterErr);
        });
    });
}

ensureSoftDeleteColumn();

router.get("/cars", verifyToken, (req, res) => {
    const sql = `
        SELECT cars.*, customers.full_name AS customer_name
        FROM cars
        JOIN customers ON cars.customer_id = customers.id
        WHERE customers.deleted_at IS NULL
          AND cars.deleted_at IS NULL
        ORDER BY cars.created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Car save error:", err);
            return res.status(500).json({ error: "Database error" });
        }

        res.json(results);
    });
});

router.get("/cars/:id", verifyToken, (req, res) => {
    const sql = `
        SELECT cars.*, customers.full_name AS customer_name, customers.phone AS customer_phone
        FROM cars
        JOIN customers ON cars.customer_id = customers.id
        WHERE cars.id = ?
    `;

    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error("Car save error:", err);
            return res.status(500).json({ error: "Database error" });
        }
        if (results.length === 0) return res.status(404).json({ error: "Car not found" });

        res.json(results[0]);
    });
});

router.post("/cars", verifyToken, (req, res) => {
    const { customer_id, brand, model, year, registration_number, vin, engine, mileage } = req.body;
    const normalizedBrand = String(brand || "").trim();
    const normalizedModel = String(model || "").trim();
    const normalizedRegistrationNumber = normalizeRegistrationNumber(registration_number);
    const normalizedYear = year === "" || year == null ? null : Number(year);
    const normalizedMileage = mileage === "" || mileage == null ? null : Number(mileage);
    const normalizedEngine = String(engine || "").trim() || null;
    const normalizedVin = normalizeVin(vin);
    const carError = validateCar({
        brand: normalizedBrand,
        model: normalizedModel,
        registrationNumber: normalizedRegistrationNumber,
        year: normalizedYear,
        mileage: normalizedMileage,
        engine: normalizedEngine
    });
    const vinError = validateVin(normalizedVin);

    if (!customer_id || carError) {
        return res.status(400).json({ error: carError || "Клиентът е задължителен" });
    }

    if (vinError) {
        return res.status(400).json({ error: vinError });
    }

    const sql = `
        INSERT INTO cars 
        (customer_id, brand, model, year, registration_number, vin, engine, mileage)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [customer_id, normalizedBrand, normalizedModel, normalizedYear, normalizedRegistrationNumber, normalizedVin, normalizedEngine, normalizedMileage], (err, result) => {
        if (err) {
            console.error("Car save error:", err);
            return res.status(500).json({ error: "Database error" });
        }

        res.json({
            message: "Car added successfully!",
            car_id: result.insertId
        });
    });
});

router.put("/cars/:id", verifyToken, requireAdmin, (req, res) => {
    const { customer_id, brand, model, year, registration_number, vin, engine, mileage } = req.body;
    const normalizedBrand = String(brand || "").trim();
    const normalizedModel = String(model || "").trim();
    const normalizedRegistrationNumber = normalizeRegistrationNumber(registration_number);
    const normalizedYear = year === "" || year == null ? null : Number(year);
    const normalizedMileage = mileage === "" || mileage == null ? null : Number(mileage);
    const normalizedEngine = String(engine || "").trim() || null;
    const normalizedVin = normalizeVin(vin);
    const carError = validateCar({
        brand: normalizedBrand,
        model: normalizedModel,
        registrationNumber: normalizedRegistrationNumber,
        year: normalizedYear,
        mileage: normalizedMileage,
        engine: normalizedEngine
    });
    const vinError = validateVin(normalizedVin);

    if (!customer_id || carError) {
        return res.status(400).json({ error: carError || "Клиентът е задължителен" });
    }

    if (vinError) {
        return res.status(400).json({ error: vinError });
    }

    const sql = `
        UPDATE cars
        SET customer_id = ?, brand = ?, model = ?, year = ?, registration_number = ?, vin = ?, engine = ?, mileage = ?
        WHERE id = ?
    `;

    db.query(
        sql,
        [customer_id, normalizedBrand, normalizedModel, normalizedYear, normalizedRegistrationNumber, normalizedVin, normalizedEngine, normalizedMileage, req.params.id],
        (err, result) => {
            if (err) {
                console.error("Car save error:", err);
                return res.status(500).json({ error: "Database error" });
            }
            if (result.affectedRows === 0) return res.status(404).json({ error: "Car not found" });

            res.json({ message: "Car updated successfully!" });
        }
    );
});

router.delete("/cars/:id", verifyToken, requireAdmin, (req, res) => {
    const sql = "UPDATE cars SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL";

    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error("Car archive error:", err);
            return res.status(500).json({ error: "Database error" });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: "Car not found" });

        res.json({ message: "Car archived successfully!" });
    });
});

module.exports = router;
