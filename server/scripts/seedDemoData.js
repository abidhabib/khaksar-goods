require('../node_modules/dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const mysql = require('../node_modules/mysql2/promise');

const DEMO_PASSWORD = '00110011';
const DEMO_NOTE = 'DEMO_SEED_V1';

const demoCars = [
    { car_number: 'ISB-2024', current_meter_reading: 18420, status: 'active' },
    { car_number: 'KHI-7788', current_meter_reading: 27640, status: 'active' }
];

const demoUsers = [
    { username: 'umar_demo', phone: '03005550001', license_number: 'ICT-445566', assign_car_number: 'ISB-2024' },
    { username: 'hamza_demo', phone: '03005550002', license_number: 'KHI-778899', assign_car_number: 'KHI-7788' }
];

const createPool = () => mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
});

const ensureCar = async (connection, car) => {
    const [existing] = await connection.execute(
        'SELECT id FROM cars WHERE car_number = ? LIMIT 1',
        [car.car_number]
    );

    if (existing.length > 0) {
        return existing[0].id;
    }

    const [result] = await connection.execute(
        'INSERT INTO cars (car_number, current_meter_reading, status) VALUES (?, ?, ?)',
        [car.car_number, car.current_meter_reading, car.status]
    );

    return result.insertId;
};

const ensureDriverUser = async (connection, user, passwordHash) => {
    const [existingUser] = await connection.execute(
        'SELECT id FROM users WHERE username = ? LIMIT 1',
        [user.username]
    );

    let userId = existingUser[0]?.id;

    if (!userId) {
        const [userResult] = await connection.execute(
            'INSERT INTO users (username, password_hash, role, phone, status) VALUES (?, ?, "driver", ?, "active")',
            [user.username, passwordHash, user.phone]
        );
        userId = userResult.insertId;
    }

    const [existingDriver] = await connection.execute(
        'SELECT id FROM drivers WHERE user_id = ? LIMIT 1',
        [userId]
    );

    if (existingDriver.length > 0) {
        await connection.execute(
            'UPDATE drivers SET license_number = ? WHERE id = ?',
            [user.license_number, existingDriver[0].id]
        );
        return existingDriver[0].id;
    }

    const [driverResult] = await connection.execute(
        'INSERT INTO drivers (user_id, license_number, assigned_car_id) VALUES (?, ?, NULL)',
        [userId, user.license_number]
    );

    return driverResult.insertId;
};

const ensureOpenAssignment = async (connection, driverId, carId) => {
    const [driverRows] = await connection.execute(
        'SELECT assigned_car_id FROM drivers WHERE id = ?',
        [driverId]
    );

    const currentCarId = driverRows[0]?.assigned_car_id || null;

    if (currentCarId && currentCarId !== carId) {
        await connection.execute(
            'UPDATE drivers SET assigned_car_id = NULL WHERE id = ?',
            [driverId]
        );
    }

    const [otherDriverRows] = await connection.execute(
        'SELECT id FROM drivers WHERE assigned_car_id = ? AND id != ?',
        [carId, driverId]
    );

    if (otherDriverRows.length > 0) {
        await connection.execute(
            'UPDATE drivers SET assigned_car_id = NULL WHERE assigned_car_id = ? AND id != ?',
            [carId, driverId]
        );
        await connection.execute(
            'UPDATE car_assignments SET unassigned_at = CURRENT_TIMESTAMP WHERE car_id = ? AND unassigned_at IS NULL',
            [carId]
        );
    }

    await connection.execute(
        'UPDATE drivers SET assigned_car_id = ? WHERE id = ?',
        [carId, driverId]
    );

    const [assignmentRows] = await connection.execute(
        'SELECT id FROM car_assignments WHERE car_id = ? AND driver_id = ? AND unassigned_at IS NULL LIMIT 1',
        [carId, driverId]
    );

    if (assignmentRows.length === 0) {
        const [carRows] = await connection.execute(
            'SELECT current_meter_reading FROM cars WHERE id = ?',
            [carId]
        );
        await connection.execute(
            'INSERT INTO car_assignments (car_id, driver_id, start_meter_reading, notes) VALUES (?, ?, ?, ?)',
            [carId, driverId, carRows[0]?.current_meter_reading || 0, DEMO_NOTE]
        );
    }
};

const seedTripsForDriver = async (connection, driverId, carId, baseMeter, routeSeed) => {
    const [existingTrips] = await connection.execute(
        'SELECT COUNT(*) AS count FROM trips WHERE driver_id = ? AND notes = ?',
        [driverId, DEMO_NOTE]
    );

    if (existingTrips[0].count > 0) {
        return;
    }

    const routes = [
        ['Lahore', 'Islamabad'],
        ['Islamabad', 'Peshawar'],
        ['Karachi', 'Hyderabad'],
        ['Multan', 'Lahore']
    ];

    let meter = baseMeter;
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalDistance = 0;

    for (let index = 0; index < 4; index += 1) {
        const [from_location, to_location] = routes[(routeSeed + index) % routes.length];
        const startMeter = meter;
        const distance = 120 + (index * 35);
        const endMeter = startMeter + distance;
        const freightCharge = 18000 + (index * 2500);
        const startedAt = new Date();
        startedAt.setDate(startedAt.getDate() - (8 - index));
        startedAt.setHours(8 + index, 15, 0, 0);

        const endedAt = new Date(startedAt);
        endedAt.setHours(endedAt.getHours() + 6);

        const [tripResult] = await connection.execute(
            `INSERT INTO trips
             (driver_id, car_id, start_meter_reading, end_meter_reading, from_location, to_location, freight_charge, status, started_at, ended_at, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
            [driverId, carId, startMeter, endMeter, from_location, to_location, freightCharge, startedAt, endedAt, DEMO_NOTE]
        );

        const expenseRows = [
            ['diesel', 5500 + (index * 450)],
            ['toll', 900 + (index * 120)],
            ['food', 700 + (index * 80)],
            ['other', 350 + (index * 60)]
        ];

        for (const [category, amount] of expenseRows) {
            await connection.execute(
                'INSERT INTO expenses (trip_id, category, amount, notes) VALUES (?, ?, ?, ?)',
                [tripResult.insertId, category, amount, DEMO_NOTE]
            );
            totalExpenses += amount;
        }

        totalRevenue += freightCharge;
        totalDistance += distance;
        meter = endMeter;
    }

    const [ongoingTrips] = await connection.execute(
        'SELECT COUNT(*) AS count FROM trips WHERE driver_id = ? AND status = "ongoing"',
        [driverId]
    );

    if (ongoingTrips[0].count === 0) {
        const startedAt = new Date();
        startedAt.setHours(9, 0, 0, 0);

        await connection.execute(
            `INSERT INTO trips
             (driver_id, car_id, start_meter_reading, from_location, to_location, freight_charge, status, started_at, notes)
             VALUES (?, ?, ?, ?, ?, ?, 'ongoing', ?, ?)`,
            [driverId, carId, meter, 'Demo City A', 'Demo City B', 24500, startedAt, DEMO_NOTE]
        );
    }

    await connection.execute(
        'UPDATE cars SET current_meter_reading = ?, total_revenue = total_revenue + ?, total_expenses = total_expenses + ?, total_distance_km = total_distance_km + ? WHERE id = ?',
        [meter, totalRevenue, totalExpenses, totalDistance, carId]
    );
};

const main = async () => {
    const pool = createPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

        const carIds = {};
        for (const car of demoCars) {
            carIds[car.car_number] = await ensureCar(connection, car);
        }

        const [existingCars] = await connection.execute(
            'SELECT id, car_number, current_meter_reading FROM cars WHERE status = "active" ORDER BY id'
        );

        const seededDrivers = [];
        for (const user of demoUsers) {
            const driverId = await ensureDriverUser(connection, user, passwordHash);
            await ensureOpenAssignment(connection, driverId, carIds[user.assign_car_number]);
            seededDrivers.push({ driverId, carId: carIds[user.assign_car_number] });
        }

        const [unassignedDrivers] = await connection.execute(
            'SELECT id FROM drivers WHERE assigned_car_id IS NULL ORDER BY id LIMIT 1'
        );

        if (unassignedDrivers.length > 0 && existingCars.length > 0) {
            const fallbackCar = existingCars.find((car) => !seededDrivers.some((item) => item.carId === car.id));
            if (fallbackCar) {
                await ensureOpenAssignment(connection, unassignedDrivers[0].id, fallbackCar.id);
                seededDrivers.push({ driverId: unassignedDrivers[0].id, carId: fallbackCar.id });
            }
        }

        for (let index = 0; index < seededDrivers.length; index += 1) {
            const item = seededDrivers[index];
            const [carRows] = await connection.execute(
                'SELECT current_meter_reading FROM cars WHERE id = ?',
                [item.carId]
            );
            await seedTripsForDriver(connection, item.driverId, item.carId, carRows[0]?.current_meter_reading || 0, index);
        }

        await connection.commit();
        console.log('Demo data seeded successfully.');
        console.log(`Drivers can use password: ${DEMO_PASSWORD}`);
    } catch (error) {
        await connection.rollback();
        console.error('Failed to seed demo data:', error);
        process.exitCode = 1;
    } finally {
        connection.release();
        await pool.end();
    }
};

main();
