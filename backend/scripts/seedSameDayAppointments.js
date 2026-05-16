const db = require("../db");

const records = [
    {
        customer: "Александър Тодоров",
        phone: "0888991122",
        car: {
            brand: "Opel",
            model: "Insignia 2.0 CDTI",
            year: 2016,
            registration_number: "CB7070OP",
            vin: "W0LGT8EM1G1001122",
            engine: "2.0 CDTI",
            mileage: 208300
        },
        appointment_date: "2026-05-07 09:00:00",
        reason: "Трудно палене сутрин и проверка на подгревни свещи",
        status: "scheduled"
    },
    {
        customer: "Симеон Ангелов",
        phone: "0877554433",
        car: {
            brand: "Ford",
            model: "Mondeo 2.0 TDCi",
            year: 2018,
            registration_number: "CA5522FA",
            vin: "WF0EXXWPCEHJ44556",
            engine: "2.0 TDCi",
            mileage: 176900
        },
        appointment_date: "2026-05-07 11:30:00",
        reason: "Смяна на съединител и проверка на маховик",
        status: "scheduled"
    },
    {
        customer: "Радостин Петров",
        phone: "0899112233",
        car: {
            brand: "Skoda",
            model: "Octavia 1.9 TDI",
            year: 2012,
            registration_number: "CB1919SK",
            vin: "TMBHS61Z9C2123456",
            engine: "1.9 TDI",
            mileage: 312500
        },
        appointment_date: "2026-05-07 16:45:00",
        reason: "Проверка на турбо, пушек при ускорение и шум от ауспух",
        status: "scheduled"
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

async function findOrCreateCustomer(record) {
    const existing = await query("SELECT id FROM customers WHERE phone = ? LIMIT 1", [record.phone]);
    if (existing.length) return existing[0].id;

    const result = await query(
        "INSERT INTO customers (full_name, phone) VALUES (?, ?)",
        [record.customer, record.phone]
    );

    return result.insertId;
}

async function findOrCreateCar(customerId, car) {
    const existing = await query("SELECT id FROM cars WHERE registration_number = ? LIMIT 1", [car.registration_number]);
    if (existing.length) return existing[0].id;

    const result = await query(
        `INSERT INTO cars
            (customer_id, brand, model, year, registration_number, vin, engine, mileage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [customerId, car.brand, car.model, car.year, car.registration_number, car.vin, car.engine, car.mileage]
    );

    return result.insertId;
}

async function createAppointment(customerId, carId, record) {
    const existing = await query(
        "SELECT id FROM appointments WHERE car_id = ? AND appointment_date = ? LIMIT 1",
        [carId, record.appointment_date]
    );

    if (existing.length) return false;

    await query(
        `INSERT INTO appointments
            (customer_id, car_id, appointment_date, reason, status)
         VALUES (?, ?, ?, ?, ?)`,
        [customerId, carId, record.appointment_date, record.reason, record.status]
    );

    return true;
}

async function seed() {
    let added = 0;
    let skipped = 0;

    for (const record of records) {
        const customerId = await findOrCreateCustomer(record);
        const carId = await findOrCreateCar(customerId, record.car);
        const created = await createAppointment(customerId, carId, record);

        if (created) added += 1;
        else skipped += 1;
    }

    console.log(`Same-day appointments added: ${added}`);
    console.log(`Same-day appointments skipped: ${skipped}`);
}

seed()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(() => {
        db.end();
    });
