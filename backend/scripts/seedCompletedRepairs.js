const db = require("../db");

const repairs = [
    {
        registration_number: "CB3005DX",
        mechanic_name: "Николай Михайлов",
        description: "Голям ремонт: смяна на турбокомпресор, обслужване на охладителна система, спирачна профилактика и пълна диагностика след ремонта.",
        hours_worked: 16,
        price_per_hour: 40,
        parts: [
            ["Турбокомпресор", "Garrett", 1, 1450],
            ["Комплект гарнитури за турбо", "Elring", 1, 86],
            ["Водна помпа", "Pierburg", 1, 178],
            ["Термостат", "Mahle", 1, 74],
            ["Радиатор", "Nissens", 1, 260],
            ["Предни дискове комплект", "ATE", 1, 340],
            ["Предни накладки", "ATE", 1, 128],
            ["Моторно масло 5W30", "Motul", 8, 18],
            ["Маслен филтър", "MANN", 1, 24],
            ["Въздушен филтър", "MANN", 1, 32],
            ["Антифриз концентрат", "Febi", 4, 14],
            ["Диагностика и адаптация", "NMM", 1, 120]
        ]
    },
    {
        registration_number: "CA2210MC",
        mechanic_name: "Георги Иванов",
        description: "Отстранен проблем със загуба на мощност: диагностика на турбо пътища, смяна на датчик налягане и почистване на EGR.",
        hours_worked: 6.5,
        price_per_hour: 40,
        parts: [
            ["MAP датчик налягане", "Bosch", 1, 126],
            ["Комплект вакуум маркучи", "Gates", 1, 48],
            ["Гарнитура EGR", "Elring", 1, 22],
            ["Почистване EGR", "NMM", 1, 90],
            ["Диагностика", "NMM", 1, 60]
        ]
    },
    {
        registration_number: "CB9812PH",
        mechanic_name: "Петър Василев",
        description: "Ремонт на спирачна система: смяна на предни дискове и накладки, проверка на окачване и тестово каране.",
        hours_worked: 4,
        price_per_hour: 40,
        parts: [
            ["Предни спирачни дискове", "Brembo", 2, 86],
            ["Предни накладки", "Brembo", 1, 74],
            ["Спирачна течност DOT4", "ATE", 1, 22],
            ["Комплект водачи за апарат", "Febi", 1, 38]
        ]
    }
];

function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

async function getAppointment(registrationNumber) {
    const rows = await query(
        `SELECT appointments.id AS appointment_id, appointments.car_id, appointments.appointment_date
         FROM appointments
         JOIN cars ON appointments.car_id = cars.id
         WHERE cars.registration_number = ?
         ORDER BY appointments.appointment_date DESC
         LIMIT 1`,
        [registrationNumber]
    );

    return rows[0];
}

async function ensureAppointmentIdColumn() {
    const columns = await query(`
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'repairs'
          AND COLUMN_NAME = 'appointment_id'
    `);

    if (columns[0].count > 0) return;

    await query("ALTER TABLE repairs ADD COLUMN appointment_id INT UNIQUE AFTER id");
    console.log("appointment_id column added to repairs");
}

async function findOrCreateRepair(appointment, repair) {
    const rows = await query("SELECT id FROM repairs WHERE appointment_id = ? LIMIT 1", [appointment.appointment_id]);
    const laborPrice = Number(repair.hours_worked) * Number(repair.price_per_hour);

    if (rows.length) {
        await query(
            `UPDATE repairs
             SET car_id = ?, repair_date = DATE(?), mechanic_name = ?, description = ?,
                 hours_worked = ?, price_per_hour = ?, labor_price = ?, status = 'completed'
             WHERE id = ?`,
            [
                appointment.car_id,
                appointment.appointment_date,
                repair.mechanic_name,
                repair.description,
                repair.hours_worked,
                repair.price_per_hour,
                laborPrice,
                rows[0].id
            ]
        );

        return rows[0].id;
    }

    const result = await query(
        `INSERT INTO repairs
            (appointment_id, car_id, repair_date, mechanic_name, description, hours_worked, price_per_hour, labor_price, total_price, status)
         VALUES (?, ?, DATE(?), ?, ?, ?, ?, ?, 0, 'completed')`,
        [
            appointment.appointment_id,
            appointment.car_id,
            appointment.appointment_date,
            repair.mechanic_name,
            repair.description,
            repair.hours_worked,
            repair.price_per_hour,
            laborPrice
        ]
    );

    return result.insertId;
}

async function replaceParts(repairId, parts) {
    await query("DELETE FROM repair_parts WHERE repair_id = ?", [repairId]);

    for (const [partName, brand, quantity, unitPrice] of parts) {
        await query(
            `INSERT INTO repair_parts
                (repair_id, part_name, brand, quantity, unit_price, total_price)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [repairId, partName, brand, quantity, unitPrice, quantity * unitPrice]
        );
    }
}

async function updateTotals(repairId) {
    await query(
        `UPDATE repairs
         SET total_price = ROUND(labor_price + (
             SELECT IFNULL(SUM(total_price), 0)
             FROM repair_parts
             WHERE repair_id = ?
         ), 2)
         WHERE id = ?`,
        [repairId, repairId]
    );
}

async function seed() {
    await ensureAppointmentIdColumn();

    let completed = 0;

    for (const repair of repairs) {
        const appointment = await getAppointment(repair.registration_number);
        if (!appointment) {
            console.log(`Skipped ${repair.registration_number}: appointment not found`);
            continue;
        }

        const repairId = await findOrCreateRepair(appointment, repair);
        await replaceParts(repairId, repair.parts);
        await updateTotals(repairId);
        await query("UPDATE appointments SET status = 'completed' WHERE id = ?", [appointment.appointment_id]);

        completed += 1;
        console.log(`Completed repair #${repairId} for ${repair.registration_number}`);
    }

    console.log(`Completed repairs seeded: ${completed}`);
}

seed()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(() => {
        db.end();
    });
