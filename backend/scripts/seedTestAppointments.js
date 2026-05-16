const db = require("../db");

const records = [
    {
        customer: "Иван Димитров",
        phone: "0887456123",
        car: {
            brand: "Audi",
            model: "A4 2.0 TDI",
            year: 2017,
            registration_number: "CB7421KT",
            vin: "WAUZZZF47HA123456",
            engine: "2.0 TDI",
            mileage: 184500
        },
        appointment_date: "2026-05-18 09:30:00",
        reason: "Смяна на масло, филтри и проверка на ходова част",
        status: "scheduled"
    },
    {
        customer: "Мария Стоянова",
        phone: "0899321456",
        car: {
            brand: "Mercedes-Benz",
            model: "C220 CDI",
            year: 2015,
            registration_number: "CA2210MC",
            vin: "WDD2050041R654321",
            engine: "2.2 CDI",
            mileage: 231800
        },
        appointment_date: "2026-05-19 14:00:00",
        reason: "Свети check engine, загуба на мощност при ускорение",
        status: "scheduled"
    },
    {
        customer: "Петър Николов",
        phone: "0878123098",
        car: {
            brand: "Volkswagen",
            model: "Golf 7 1.6 TDI",
            year: 2016,
            registration_number: "CB9812PH",
            vin: "WVWZZZAUZGW987654",
            engine: "1.6 TDI",
            mileage: 196200
        },
        appointment_date: "2026-05-21 11:15:00",
        reason: "Шум при спиране и вибрация във волана",
        status: "scheduled"
    },
    {
        customer: "Даниел Георгиев",
        phone: "0886127788",
        car: {
            brand: "BMW",
            model: "X5 3.0d",
            year: 2014,
            registration_number: "CB3005DX",
            vin: "WBAKS410700D12345",
            engine: "3.0d",
            mileage: 254000
        },
        appointment_date: "2026-05-23 10:00:00",
        reason: "Теч на антифриз и прегряване в градски условия",
        status: "scheduled"
    },
    {
        customer: "Никол Костова",
        phone: "0897001122",
        car: {
            brand: "Toyota",
            model: "RAV4 Hybrid",
            year: 2019,
            registration_number: "CA4407HX",
            vin: "JTMRJREV30D112233",
            engine: "2.5 Hybrid",
            mileage: 112400
        },
        appointment_date: "2026-05-26 15:30:00",
        reason: "Профилактика преди пътуване и диагностика на климатик",
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

    if (existing.length) {
        return { skipped: true, id: existing[0].id };
    }

    const result = await query(
        `INSERT INTO appointments
            (customer_id, car_id, appointment_date, reason, status)
         VALUES (?, ?, ?, ?, ?)`,
        [customerId, carId, record.appointment_date, record.reason, record.status]
    );

    return { skipped: false, id: result.insertId };
}

async function seed() {
    let added = 0;
    let skipped = 0;

    for (const record of records) {
        const customerId = await findOrCreateCustomer(record);
        const carId = await findOrCreateCar(customerId, record.car);
        const appointment = await createAppointment(customerId, carId, record);

        if (appointment.skipped) skipped += 1;
        else added += 1;
    }

    console.log(`Appointments added: ${added}`);
    console.log(`Appointments skipped: ${skipped}`);
}

seed()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(() => {
        db.end();
    });
