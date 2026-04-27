const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateUsername } = require('../utils/helpers');

const getDateFilter = (period = 'all', fromDate, toDate, alias = 't') => {
    const conditions = [];
    const params = [];
    const column = `${alias}.started_at`;

    if (fromDate) {
        conditions.push(`${column} >= ?`);
        params.push(`${fromDate} 00:00:00`);
    }

    if (toDate) {
        conditions.push(`${column} <= ?`);
        params.push(`${toDate} 23:59:59`);
    }

    if (!fromDate && !toDate) {
        if (period === 'today') {
            conditions.push(`DATE(${column}) = CURDATE()`);
        } else if (period === 'week') {
            conditions.push(`${column} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
        } else if (period === 'month') {
            conditions.push(`${column} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
        } else if (period === 'year') {
            conditions.push(`${column} >= DATE_SUB(NOW(), INTERVAL 1 YEAR)`);
        }
    }

    return {
        clause: conditions.length ? `AND ${conditions.join(' AND ')}` : '',
        params
    };
};

const getMonthFilter = (month, column = 'de.expense_date') => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return {
            clause: '',
            params: []
        };
    }

    return {
        clause: `AND DATE_FORMAT(${column}, '%Y-%m') = ?`,
        params: [month]
    };
};

const computeAverageKmPerLiter = (distance, liters) => {
    const distanceValue = Number(distance) || 0;
    const litersValue = Number(liters) || 0;
    if (!(litersValue > 0) || !(distanceValue > 0)) {
        return null;
    }

    return Number((distanceValue / litersValue).toFixed(2));
};

const hasOngoingTrip = async (connection, driverId) => {
    const [ongoing] = await connection.execute(
        'SELECT id FROM trips WHERE driver_id = ? AND status = "ongoing" LIMIT 1',
        [driverId]
    );

    return ongoing.length > 0;
};

const closeOpenAssignment = async (connection, carId, driverId) => {
    if (!carId || !driverId) {
        return;
    }

    const [carRows] = await connection.execute(
        'SELECT current_meter_reading FROM cars WHERE id = ?',
        [carId]
    );

    const endMeter = carRows[0]?.current_meter_reading || 0;

    await connection.execute(
        `UPDATE car_assignments
         SET unassigned_at = CURRENT_TIMESTAMP, end_meter_reading = ?
         WHERE car_id = ? AND driver_id = ? AND unassigned_at IS NULL`,
        [endMeter, carId, driverId]
    );
};

const assignCarWithIntegrity = async (connection, driverId, carId) => {
    const [driverRows] = await connection.execute(
        'SELECT id, assigned_car_id FROM drivers WHERE id = ?',
        [driverId]
    );

    if (driverRows.length === 0) {
        throw new Error('Driver not found');
    }

    const currentDriver = driverRows[0];
    const normalizedCarId = carId ? Number(carId) : null;

    if (await hasOngoingTrip(connection, driverId)) {
        throw new Error('Driver has ongoing trip. Complete it first.');
    }

    if (normalizedCarId && currentDriver.assigned_car_id === normalizedCarId) {
        return;
    }

    if (normalizedCarId) {
        const [carRows] = await connection.execute(
            'SELECT id, status, current_meter_reading FROM cars WHERE id = ?',
            [normalizedCarId]
        );

        if (carRows.length === 0) {
            throw new Error('Car not found');
        }

        if (carRows[0].status !== 'active') {
            throw new Error('Only active cars can be assigned');
        }

        const [existingDriverRows] = await connection.execute(
            'SELECT id, assigned_car_id FROM drivers WHERE assigned_car_id = ? AND id != ? LIMIT 1',
            [normalizedCarId, driverId]
        );

        if (existingDriverRows.length > 0) {
            const otherDriver = existingDriverRows[0];

            if (await hasOngoingTrip(connection, otherDriver.id)) {
                throw new Error('Selected cargo is assigned to a driver with an ongoing trip');
            }

            await closeOpenAssignment(connection, normalizedCarId, otherDriver.id);
            await connection.execute(
                'UPDATE drivers SET assigned_car_id = NULL WHERE id = ?',
                [otherDriver.id]
            );
        }
    }

    if (currentDriver.assigned_car_id) {
        await closeOpenAssignment(connection, currentDriver.assigned_car_id, driverId);
    }

    await connection.execute(
        'UPDATE drivers SET assigned_car_id = ? WHERE id = ?',
        [normalizedCarId, driverId]
    );

    if (normalizedCarId) {
        const [carRows] = await connection.execute(
            'SELECT current_meter_reading FROM cars WHERE id = ?',
            [normalizedCarId]
        );

        await connection.execute(
            'INSERT INTO car_assignments (car_id, driver_id, start_meter_reading) VALUES (?, ?, ?)',
            [normalizedCarId, driverId, carRows[0].current_meter_reading]
        );
    }
};

// ========== CAR MANAGEMENT ==========

// Get all cars with assigned driver info
const getAllCars = async (req, res) => {
    try {
        const [cars] = await pool.execute(`
            SELECT c.*, 
                   d.id as driver_id, 
                   u.username as assigned_driver,
                   u.phone as driver_phone,
                   (
                       SELECT COALESCE(SUM(t4.end_meter_reading - t4.start_meter_reading), 0)
                       FROM trips t4
                       WHERE t4.car_id = c.id AND t4.status = 'completed'
                   ) as total_distance_for_average,
                   (
                       SELECT COALESCE(SUM(e4.liters), 0)
                       FROM trips t5
                       JOIN expenses e4 ON e4.trip_id = t5.id AND e4.category = 'diesel'
                       WHERE t5.car_id = c.id AND t5.status = 'completed'
                   ) as total_diesel_liters,
                   ca.start_meter_reading as assigned_at_meter,
                   ot.from_location as ongoing_from_location,
                   ot.to_location as ongoing_to_location,
                   lt.from_location as last_from_location,
                   lt.to_location as last_to_location,
                   CASE
                       WHEN ot.id IS NOT NULL THEN 'ongoing'
                       WHEN lt.id IS NOT NULL THEN 'completed'
                       ELSE NULL
                   END as trip_status
            FROM cars c
            LEFT JOIN drivers d ON c.id = d.assigned_car_id
            LEFT JOIN users u ON d.user_id = u.id
            LEFT JOIN car_assignments ca ON c.id = ca.car_id 
                AND ca.unassigned_at IS NULL 
                AND d.id = ca.driver_id
            LEFT JOIN trips ot ON ot.id = (
                SELECT t1.id
                FROM trips t1
                WHERE t1.car_id = c.id AND t1.status = 'ongoing'
                ORDER BY t1.started_at DESC
                LIMIT 1
            )
            LEFT JOIN trips lt ON lt.id = (
                SELECT t2.id
                FROM trips t2
                WHERE t2.car_id = c.id AND t2.status = 'completed'
                ORDER BY t2.ended_at DESC, t2.started_at DESC
                LIMIT 1
            )
            ORDER BY c.created_at DESC
        `);
        res.json({
            success: true,
            cars: cars.map((car) => ({
                ...car,
                overall_average_km_per_liter: computeAverageKmPerLiter(
                    car.total_distance_for_average,
                    car.total_diesel_liters
                )
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Add new car
const addCar = async (req, res) => {
    try {
        const { car_number, current_meter_reading = 0 } = req.body;

        // Check if car number exists
        const [existing] = await pool.execute(
            'SELECT id FROM cars WHERE car_number = ?',
            [car_number]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: 'Car number already exists' });
        }

        const [result] = await pool.execute(
            'INSERT INTO cars (car_number, current_meter_reading) VALUES (?, ?)',
            [car_number, current_meter_reading]
        );

        res.status(201).json({
            success: true,
            message: 'Car added successfully',
            car: {
                id: result.insertId,
                car_number,
                current_meter_reading
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update car
const updateCar = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const { id } = req.params;
        const { car_number, status, current_meter_reading } = req.body;

        await connection.beginTransaction();

        const [existing] = await connection.execute(
            'SELECT id FROM cars WHERE car_number = ? AND id != ?',
            [car_number, id]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: 'Car number already exists' });
        }

        await connection.execute(
            'UPDATE cars SET car_number = ?, status = ?, current_meter_reading = ? WHERE id = ?',
            [car_number, status, current_meter_reading, id]
        );

        if (status !== 'active') {
            const [assignedDrivers] = await connection.execute(
                'SELECT id FROM drivers WHERE assigned_car_id = ?',
                [id]
            );

            for (const driver of assignedDrivers) {
                await closeOpenAssignment(connection, Number(id), driver.id);
                await connection.execute(
                    'UPDATE drivers SET assigned_car_id = NULL WHERE id = ?',
                    [driver.id]
                );
            }
        }

        await connection.commit();

        res.json({ success: true, message: 'Car updated successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

// Delete car (soft delete by retiring)
const deleteCar = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if car has ongoing trips
        const [ongoing] = await pool.execute(
            'SELECT id FROM trips WHERE car_id = ? AND status = "ongoing"',
            [id]
        );

        if (ongoing.length > 0) {
            return res.status(400).json({ message: 'Cannot delete cargo with ongoing trips' });
        }

        await pool.execute(
            'UPDATE cars SET status = "retired" WHERE id = ?',
            [id]
        );

        // Unassign driver if any
        await pool.execute(
            'UPDATE drivers SET assigned_car_id = NULL WHERE assigned_car_id = ?',
            [id]
        );

        res.json({ success: true, message: 'Car retired successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Get car detailed history
const getCarHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { period = 'all', from_date, to_date } = req.query;
        const tripDateFilter = getDateFilter(period, from_date, to_date, 't');

        const [car] = await pool.execute(
            `SELECT c.*, d.id as current_driver_id, u.username as current_driver_name, u.phone as current_driver_phone,
                    (
                        SELECT COALESCE(SUM(t6.end_meter_reading - t6.start_meter_reading), 0)
                        FROM trips t6
                        WHERE t6.car_id = c.id AND t6.status = 'completed'
                    ) as total_distance_for_average,
                    (
                        SELECT COALESCE(SUM(e6.liters), 0)
                        FROM trips t7
                        JOIN expenses e6 ON e6.trip_id = t7.id AND e6.category = 'diesel'
                        WHERE t7.car_id = c.id AND t7.status = 'completed'
                    ) as total_diesel_liters
             FROM cars c
             LEFT JOIN drivers d ON d.assigned_car_id = c.id
             LEFT JOIN users u ON u.id = d.user_id
             WHERE c.id = ?`,
            [id]
        );

        if (car.length === 0) {
            return res.status(404).json({ message: 'Car not found' });
        }

        // Assignment history
        const [assignments] = await pool.execute(`
            SELECT ca.*, u.username as driver_name
            FROM car_assignments ca
            JOIN drivers d ON ca.driver_id = d.id
            JOIN users u ON d.user_id = u.id
            WHERE ca.car_id = ?
            ORDER BY ca.assigned_at DESC
        `, [id]);

        // All trips
        const [trips] = await pool.execute(`
            SELECT t.*, u.username as driver_name,
                   COALESCE((SELECT SUM(amount) FROM expenses WHERE trip_id = t.id), 0) as total_expenses,
                   (t.freight_charge - COALESCE((SELECT SUM(amount) FROM expenses WHERE trip_id = t.id), 0)) as net_income
            FROM trips t
            JOIN drivers d ON t.driver_id = d.id
            JOIN users u ON d.user_id = u.id
            WHERE t.car_id = ? ${tripDateFilter.clause}
            ORDER BY t.started_at DESC
        `, [id, ...tripDateFilter.params]);
        const tripsWithExpenses = await attachExpensesToTrips(trips);

        // Financial summary by driver
        const [driverStats] = await pool.execute(`
            SELECT 
                u.username as driver_name,
                COUNT(trip_summary.id) as total_trips,
                COALESCE(SUM(trip_summary.freight_charge), 0) as total_revenue,
                COALESCE(SUM(trip_summary.total_expenses), 0) as total_expenses,
                COALESCE(SUM(trip_summary.distance), 0) as total_distance
            FROM (
                SELECT 
                    t.id,
                    t.driver_id,
                    t.freight_charge,
                    COALESCE(SUM(e.amount), 0) as total_expenses,
                    COALESCE(t.end_meter_reading - t.start_meter_reading, 0) as distance
                FROM trips t
                LEFT JOIN expenses e ON t.id = e.trip_id
                WHERE t.car_id = ? AND t.status = 'completed' ${tripDateFilter.clause}
                GROUP BY t.id, t.driver_id, t.freight_charge, t.end_meter_reading, t.start_meter_reading
            ) trip_summary
            JOIN drivers d ON trip_summary.driver_id = d.id
            JOIN users u ON d.user_id = u.id
            GROUP BY trip_summary.driver_id, u.username
        `, [id, ...tripDateFilter.params]);

        const [summaryRows] = await pool.execute(`
            SELECT
                COUNT(trip_summary.id) as total_trips,
                COALESCE(SUM(trip_summary.freight_charge), 0) as total_revenue,
                COALESCE(SUM(trip_summary.total_expenses), 0) as total_expenses,
                COALESCE(SUM(trip_summary.distance), 0) as total_distance,
                COALESCE(SUM(trip_summary.total_diesel_liters), 0) as total_diesel_liters
            FROM (
                SELECT
                    t.id,
                    t.freight_charge,
                    COALESCE(SUM(e.amount), 0) as total_expenses,
                    COALESCE(SUM(CASE WHEN e.category = 'diesel' THEN COALESCE(e.liters, 0) ELSE 0 END), 0) as total_diesel_liters,
                    COALESCE(t.end_meter_reading - t.start_meter_reading, 0) as distance
                FROM trips t
                LEFT JOIN expenses e ON e.trip_id = t.id
                WHERE t.car_id = ? ${tripDateFilter.clause}
                GROUP BY t.id, t.freight_charge, t.end_meter_reading, t.start_meter_reading
            ) trip_summary
        `, [id, ...tripDateFilter.params]);

        res.json({
            success: true,
            car: {
                ...car[0],
                overall_average_km_per_liter: computeAverageKmPerLiter(
                    car[0].total_distance_for_average,
                    car[0].total_diesel_liters
                )
            },
            assignments,
            trips: tripsWithExpenses,
            driverStats,
            summary: {
                ...summaryRows[0],
                total_expenses: Number(summaryRows[0].total_expenses) || 0,
                total_revenue: Number(summaryRows[0].total_revenue) || 0,
                total_distance: Number(summaryRows[0].total_distance) || 0,
                total_diesel_liters: Number(summaryRows[0].total_diesel_liters) || 0,
                overall_average_km_per_liter: computeAverageKmPerLiter(
                    summaryRows[0].total_distance,
                    summaryRows[0].total_diesel_liters
                ),
                net_income: (Number(summaryRows[0].total_revenue) || 0) - (Number(summaryRows[0].total_expenses) || 0)
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ========== DRIVER MANAGEMENT ==========

// Get all drivers
const getAllDrivers = async (req, res) => {
    try {
        const [drivers] = await pool.execute(`
            SELECT d.*, u.username, u.phone, u.status, u.created_at,
                   c.id as car_id, c.car_number, c.current_meter_reading as car_current_meter,
                   ot.from_location as ongoing_from_location,
                   ot.to_location as ongoing_to_location,
                   lt.from_location as last_from_location,
                   lt.to_location as last_to_location,
                   CASE
                       WHEN ot.id IS NOT NULL THEN 'ongoing'
                       WHEN lt.id IS NOT NULL THEN 'completed'
                       ELSE NULL
                   END as trip_status
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            LEFT JOIN cars c ON d.assigned_car_id = c.id
            LEFT JOIN trips ot ON ot.id = (
                SELECT t1.id
                FROM trips t1
                WHERE t1.driver_id = d.id AND t1.status = 'ongoing'
                ORDER BY t1.started_at DESC
                LIMIT 1
            )
            LEFT JOIN trips lt ON lt.id = (
                SELECT t2.id
                FROM trips t2
                WHERE t2.driver_id = d.id AND t2.status = 'completed'
                ORDER BY t2.ended_at DESC, t2.started_at DESC
                LIMIT 1
            )
            ORDER BY u.created_at DESC
        `);
        res.json({ success: true, drivers });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Add new driver (creates user + driver profile)
const addDriver = async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { name, phone, password, license_number, car_id } = req.body;
        
        // Generate username
        const username = generateUsername(name, phone);
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // Create user
        const [userResult] = await connection.execute(
            'INSERT INTO users (username, password_hash, role, phone) VALUES (?, ?, "driver", ?)',
            [username, password_hash, phone]
        );

        const user_id = userResult.insertId;

        // Create driver profile
        const [driverResult] = await connection.execute(
            'INSERT INTO drivers (user_id, license_number, assigned_car_id) VALUES (?, ?, NULL)',
            [user_id, license_number]
        );

        if (car_id) {
            await assignCarWithIntegrity(connection, driverResult.insertId, car_id);
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Driver created successfully',
            driver: {
                id: driverResult.insertId,
                user_id,
                username,
                phone,
                assigned_car_id: car_id
            }
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

// Assign/Reassign car to driver
const assignCarToDriver = async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { driver_id, car_id } = req.body;
        await assignCarWithIntegrity(connection, Number(driver_id), car_id);

        await connection.commit();

        res.json({ success: true, message: 'Car assigned successfully' });
    } catch (error) {
        await connection.rollback();
        if (error.message === 'Driver not found' ||
            error.message === 'Car not found' ||
            error.message === 'Only active cars can be assigned' ||
            error.message === 'Driver has ongoing trip. Complete it first.' ||
            error.message === 'Selected cargo is assigned to a driver with an ongoing trip') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

// Update driver
const updateDriver = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const { id } = req.params;
        const { phone, status, password, license_number, car_id } = req.body;

        await connection.beginTransaction();

        const [driver] = await connection.execute(
            'SELECT user_id FROM drivers WHERE id = ?',
            [id]
        );

        if (driver.length === 0) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        const user_id = driver[0].user_id;

        // Update phone and status
        await connection.execute(
            'UPDATE users SET phone = ?, status = ? WHERE id = ?',
            [phone, status, user_id]
        );

        await connection.execute(
            'UPDATE drivers SET license_number = ? WHERE id = ?',
            [license_number, id]
        );

        // Update password if provided
        if (password) {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            await connection.execute(
                'UPDATE users SET password_hash = ? WHERE id = ?',
                [hash, user_id]
            );
        }

        if (car_id !== undefined) {
            await assignCarWithIntegrity(connection, Number(id), car_id);
        }

        await connection.commit();

        res.json({ success: true, message: 'Driver updated successfully' });
    } catch (error) {
        await connection.rollback();
        if (error.message === 'Driver not found' ||
            error.message === 'Car not found' ||
            error.message === 'Only active cars can be assigned' ||
            error.message === 'Driver has ongoing trip. Complete it first.' ||
            error.message === 'Selected cargo is assigned to a driver with an ongoing trip') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

// Get driver detailed report
const getDriverReport = async (req, res) => {
    try {
        const { id } = req.params;
        const { period = 'all', from_date, to_date } = req.query;
        const dateFilter = getDateFilter(period, from_date, to_date, 't');

        const [driver] = await pool.execute(`
            SELECT d.*, u.username, u.phone, u.status, u.created_at,
                   c.car_number, c.current_meter_reading,
                   (
                       SELECT COALESCE(SUM(t2.end_meter_reading - t2.start_meter_reading), 0)
                       FROM trips t2
                       WHERE t2.car_id = c.id AND t2.status = 'completed'
                   ) as car_total_distance,
                   (
                       SELECT COALESCE(SUM(e2.liters), 0)
                       FROM trips t3
                       JOIN expenses e2 ON e2.trip_id = t3.id AND e2.category = 'diesel'
                       WHERE t3.car_id = c.id AND t3.status = 'completed'
                   ) as car_total_diesel_liters
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            LEFT JOIN cars c ON d.assigned_car_id = c.id
            WHERE d.id = ?
        `, [id]);

        if (driver.length === 0) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        // Current trip status
        const [currentTrip] = await pool.execute(`
            SELECT t.*, c.car_number,
                   (SELECT SUM(amount) FROM expenses WHERE trip_id = t.id) as current_expenses
            FROM trips t
            JOIN cars c ON t.car_id = c.id
            WHERE t.driver_id = ? AND t.status = 'ongoing'
            LIMIT 1
        `, [id]);

        // Trip history with expenses
        const [trips] = await pool.execute(`
            SELECT t.*, c.car_number,
                   COALESCE(SUM(e.amount), 0) as total_expenses,
                   (t.freight_charge - COALESCE(SUM(e.amount), 0)) as net_profit
            FROM trips t
            JOIN cars c ON t.car_id = c.id
            LEFT JOIN expenses e ON t.id = e.trip_id
            WHERE t.driver_id = ? ${dateFilter.clause}
            GROUP BY t.id, c.car_number
            ORDER BY t.started_at DESC
        `, [id, ...dateFilter.params]);
        const tripsWithExpenses = await attachExpensesToTrips(trips);
        const currentTripWithExpenses = currentTrip[0]
            ? (await attachExpensesToTrips([{
                ...currentTrip[0],
                total_expenses: currentTrip[0].current_expenses || 0
            }]))[0]
            : null;

        // Summary statistics
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(trip_summary.id) as total_trips,
                SUM(CASE WHEN trip_summary.status = 'ongoing' THEN 1 ELSE 0 END) as ongoing_trips,
                SUM(CASE WHEN trip_summary.status = 'completed' THEN 1 ELSE 0 END) as completed_trips,
                COALESCE(SUM(trip_summary.freight_charge), 0) as total_revenue,
                COALESCE(SUM(trip_summary.total_expenses), 0) as total_expenses,
                COALESCE(SUM(trip_summary.freight_charge), 0) - COALESCE(SUM(trip_summary.total_expenses), 0) as net_profit,
                COALESCE(SUM(trip_summary.distance), 0) as total_distance,
                COALESCE(SUM(trip_summary.total_diesel_liters), 0) as total_diesel_liters
            FROM (
                SELECT
                    t.id,
                    t.status,
                    t.freight_charge,
                    COALESCE(SUM(e.amount), 0) as total_expenses,
                    COALESCE(SUM(CASE WHEN e.category = 'diesel' THEN COALESCE(e.liters, 0) ELSE 0 END), 0) as total_diesel_liters,
                    COALESCE(t.end_meter_reading - t.start_meter_reading, 0) as distance
                FROM trips t
                LEFT JOIN expenses e ON t.id = e.trip_id
                WHERE t.driver_id = ? ${dateFilter.clause}
                GROUP BY t.id, t.status, t.freight_charge, t.end_meter_reading, t.start_meter_reading
            ) trip_summary
        `, [id, ...dateFilter.params]);

        const driverPayload = driver[0];
        driverPayload.overall_average_km_per_liter = computeAverageKmPerLiter(
            driverPayload.car_total_distance,
            driverPayload.car_total_diesel_liters
        );
        stats[0].overall_average_km_per_liter = computeAverageKmPerLiter(
            stats[0].total_distance,
            stats[0].total_diesel_liters
        );

        res.json({
            success: true,
            driver: driverPayload,
            currentTrip: currentTripWithExpenses,
            trips: tripsWithExpenses,
            stats: stats[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

const getDriversExpenseReport = async (req, res) => {
    try {
        const { driver_id, month } = req.query;
        const filters = [];
        const params = [];
        const monthFilter = getMonthFilter(month);

        if (driver_id) {
            filters.push('de.driver_id = ?');
            params.push(driver_id);
        }

        if (monthFilter.clause) {
            filters.push(monthFilter.clause.replace(/^AND /, ''));
            params.push(...monthFilter.params);
        }

        const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

        const [rows] = await pool.execute(
            `SELECT
                de.id,
                de.driver_id,
                de.category,
                de.amount,
                de.expense_date,
                de.created_at,
                u.username AS driver_name,
                u.phone AS driver_phone,
                c.car_number
             FROM driver_daily_expense_entries de
             JOIN drivers d ON de.driver_id = d.id
             JOIN users u ON d.user_id = u.id
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             ${whereClause}
             ORDER BY de.created_at DESC, de.id DESC`,
            params
        );

        const [driverTotals] = await pool.execute(
            `SELECT
                de.driver_id,
                u.username AS driver_name,
                u.phone AS driver_phone,
                c.car_number,
                COUNT(*) AS total_entries,
                COUNT(DISTINCT de.expense_date) AS total_days,
                COALESCE(SUM(de.amount), 0) AS total_amount
             FROM driver_daily_expense_entries de
             JOIN drivers d ON de.driver_id = d.id
             JOIN users u ON d.user_id = u.id
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             ${whereClause}
             GROUP BY de.driver_id, u.username, u.phone, c.car_number
             ORDER BY total_amount DESC, u.username ASC`,
            params
        );

        const [[summary]] = await pool.execute(
            `SELECT
                COUNT(*) AS total_entries,
                COUNT(DISTINCT de.driver_id) AS total_drivers,
                COALESCE(SUM(de.amount), 0) AS total_amount
             FROM driver_daily_expense_entries de
             ${whereClause}`,
            params
        );

        res.json({
            success: true,
            summary,
            rows,
            driverTotals
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ========== DASHBOARD & REPORTS ==========

const getPeriodConfig = (period = 'week') => {
    const config = {
        week: {
            currentDays: 7,
            previousDays: 7,
            bucket: 'day'
        },
        month: {
            currentDays: 30,
            previousDays: 30,
            bucket: 'day'
        },
        year: {
            currentDays: 365,
            previousDays: 365,
            bucket: 'month'
        }
    };

    return config[period] || config.week;
};

const buildPeriodRange = (days) => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);

    const start = new Date(end);
    start.setDate(start.getDate() - days);

    return { start, end };
};

const formatBucketLabel = (date, bucket) => {
    return date.toLocaleDateString('en-US', {
        weekday: bucket === 'day' ? 'short' : undefined,
        month: bucket === 'month' ? 'short' : undefined
    });
};

const buildTrendSeries = (rows, { start, end, bucket }) => {
    const trendMap = new Map(
        rows.map((item) => [
            item.bucket_key,
            {
                label: item.label,
                revenue: Number(item.revenue) || 0,
                expenses: Number(item.expenses) || 0,
                trips: Number(item.trips) || 0
            }
        ])
    );

    const trend = [];
    const cursor = new Date(start);

    while (cursor < end) {
        const bucketDate = new Date(cursor);
        const key = bucket === 'month'
            ? `${bucketDate.getFullYear()}-${String(bucketDate.getMonth() + 1).padStart(2, '0')}`
            : bucketDate.toISOString().slice(0, 10);

        trend.push(
            trendMap.get(key) || {
                label: formatBucketLabel(bucketDate, bucket),
                revenue: 0,
                expenses: 0,
                trips: 0
            }
        );

        if (bucket === 'month') {
            cursor.setMonth(cursor.getMonth() + 1, 1);
        } else {
            cursor.setDate(cursor.getDate() + 1);
        }
    }

    return trend;
};

const calculateChange = (current, previous) => {
    const currentValue = Number(current) || 0;
    const previousValue = Number(previous) || 0;

    if (previousValue === 0) {
        if (currentValue === 0) {
            return 0;
        }
        return 100;
    }

    return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
};

const attachExpensesToTrips = async (trips) => {
    if (!trips.length) {
        return trips;
    }

    const tripIds = trips.map((trip) => trip.id);
    const placeholders = tripIds.map(() => '?').join(', ');

    const [expenseRows] = await pool.execute(
        `SELECT id, trip_id, category, amount, liters, location, receipt_image, notes, created_at
         FROM expenses
         WHERE trip_id IN (${placeholders})
         ORDER BY created_at ASC`,
        tripIds
    );

    const expenseMap = expenseRows.reduce((map, expense) => {
        const key = expense.trip_id;
        if (!map.has(key)) {
            map.set(key, []);
        }
        map.get(key).push({
            ...expense,
            amount: Number(expense.amount) || 0
        });
        return map;
    }, new Map());

    return trips.map((trip) => {
        const expenses = expenseMap.get(trip.id) || [];
        const totalDieselLiters = expenses
            .filter((expense) => expense.category === 'diesel')
            .reduce((sum, expense) => sum + (Number(expense.liters) || 0), 0);
        const distanceKm = Number(trip.end_meter_reading) && Number(trip.start_meter_reading)
            ? Math.max((Number(trip.end_meter_reading) || 0) - (Number(trip.start_meter_reading) || 0), 0)
            : Number(trip.distance_km) || 0;

        return {
        ...trip,
        freight_charge: Number(trip.freight_charge) || 0,
        total_expenses: Number(trip.total_expenses) || 0,
        total_diesel_liters: totalDieselLiters,
        trip_average_km_per_liter: computeAverageKmPerLiter(distanceKm, totalDieselLiters),
        net_profit: trip.net_profit !== undefined ? Number(trip.net_profit) || 0 : undefined,
        net_income: trip.net_income !== undefined ? Number(trip.net_income) || 0 : undefined,
        expenses
        };
    });
};

const getDashboardStats = async (req, res) => {
    try {
        const dashboardTripSummaryQuery = `
            SELECT
                t.id,
                t.car_id,
                t.started_at,
                t.freight_charge,
                COALESCE(SUM(e.amount), 0) as total_expenses
            FROM trips t
            LEFT JOIN expenses e ON t.id = e.trip_id
            WHERE t.status = 'completed'
            GROUP BY t.id, t.car_id, t.started_at, t.freight_charge
        `;

        // Overall statistics
        const [[overall]] = await pool.execute(`
            SELECT 
                (SELECT COUNT(*) FROM cars WHERE status = 'active') as active_cars,
                (SELECT COUNT(*) FROM drivers d JOIN users u ON d.user_id = u.id WHERE u.status = 'active') as active_drivers,
                (SELECT COUNT(*) FROM trips WHERE status = 'ongoing') as ongoing_trips,
                (SELECT COUNT(*) FROM trips WHERE DATE(started_at) = CURDATE()) as today_trips
        `);

        // Today's financials
        const [[today]] = await pool.execute(`
            SELECT 
                COALESCE(SUM(trip_summary.freight_charge), 0) as today_revenue,
                COALESCE(SUM(trip_summary.total_expenses), 0) as today_expenses
            FROM (${dashboardTripSummaryQuery}) trip_summary
            WHERE DATE(trip_summary.started_at) = CURDATE()
        `);

        // Recent trips
        const [recentTrips] = await pool.execute(`
            SELECT t.*, u.username as driver_name, c.car_number
            FROM trips t
            JOIN drivers d ON t.driver_id = d.id
            JOIN users u ON d.user_id = u.id
            JOIN cars c ON t.car_id = c.id
            ORDER BY t.started_at DESC
            LIMIT 10
        `);

        // Car performance (top 5 by revenue this month)
        const [carPerformance] = await pool.execute(`
            SELECT 
                c.car_number,
                COUNT(trip_summary.id) as trip_count,
                COALESCE(SUM(trip_summary.freight_charge), 0) as revenue,
                COALESCE(SUM(trip_summary.total_expenses), 0) as expenses
            FROM cars c
            LEFT JOIN (${dashboardTripSummaryQuery}) trip_summary ON c.id = trip_summary.car_id
                AND trip_summary.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            WHERE c.status = 'active'
            GROUP BY c.id
            ORDER BY revenue DESC
            LIMIT 5
        `);

        const [revenueTrend] = await pool.execute(`
            SELECT
                DATE(trip_summary.started_at) as date,
                DATE_FORMAT(DATE(trip_summary.started_at), '%a') as name,
                COALESCE(SUM(trip_summary.freight_charge), 0) as revenue,
                COALESCE(SUM(trip_summary.total_expenses), 0) as expenses
            FROM (${dashboardTripSummaryQuery}) trip_summary
            WHERE trip_summary.started_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE(trip_summary.started_at), DATE_FORMAT(DATE(trip_summary.started_at), '%a')
            ORDER BY DATE(trip_summary.started_at) ASC
        `);

        const trendMap = new Map(
            revenueTrend.map((item) => [
                new Date(item.date).toISOString().slice(0, 10),
                {
                    name: item.name,
                    revenue: Number(item.revenue) || 0,
                    expenses: Number(item.expenses) || 0
                }
            ])
        );

        const revenueChart = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() - (6 - index));

            const key = date.toISOString().slice(0, 10);
            return trendMap.get(key) || {
                name: date.toLocaleDateString('en-US', { weekday: 'short' }),
                revenue: 0,
                expenses: 0
            };
        });

        res.json({
            success: true,
            stats: {
                ...overall,
                ...today,
                net_today: today.today_revenue - today.today_expenses
            },
            recentTrips,
            carPerformance,
            revenueChart
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

const getReportsData = async (req, res) => {
    try {
        const { period = 'week' } = req.query;
        const { currentDays, previousDays, bucket } = getPeriodConfig(period);

        const currentRange = buildPeriodRange(currentDays);
        const previousEnd = new Date(currentRange.start);
        const previousStart = new Date(previousEnd);
        previousStart.setDate(previousStart.getDate() - previousDays);
        const previousRange = { start: previousStart, end: previousEnd };

        const tripSummaryQuery = `
            SELECT
                t.id,
                t.started_at,
                t.freight_charge,
                COALESCE(SUM(e.amount), 0) as total_expenses
            FROM trips t
            LEFT JOIN expenses e ON e.trip_id = t.id
            WHERE t.status = 'completed' AND t.started_at >= ? AND t.started_at < ?
            GROUP BY t.id, t.started_at, t.freight_charge
        `;

        const [summaryRows] = await pool.execute(`
            SELECT
                COUNT(*) as total_trips,
                COALESCE(SUM(freight_charge), 0) as total_revenue,
                COALESCE(SUM(total_expenses), 0) as total_expenses
            FROM (${tripSummaryQuery}) trip_summary
        `, [currentRange.start, currentRange.end]);

        const [previousSummaryRows] = await pool.execute(`
            SELECT
                COUNT(*) as total_trips,
                COALESCE(SUM(freight_charge), 0) as total_revenue,
                COALESCE(SUM(total_expenses), 0) as total_expenses
            FROM (${tripSummaryQuery}) trip_summary
        `, [previousRange.start, previousRange.end]);

        const summary = summaryRows[0];
        const previousSummary = previousSummaryRows[0];
        const totalRevenue = Number(summary.total_revenue) || 0;
        const totalExpenses = Number(summary.total_expenses) || 0;
        const totalTrips = Number(summary.total_trips) || 0;
        const netProfit = totalRevenue - totalExpenses;
        const previousNetProfit =
            (Number(previousSummary.total_revenue) || 0) - (Number(previousSummary.total_expenses) || 0);

        const bucketSelect = bucket === 'month'
            ? `DATE_FORMAT(started_at, '%Y-%m') as bucket_key, DATE_FORMAT(started_at, '%b') as label`
            : `DATE(started_at) as bucket_key, DATE_FORMAT(started_at, '%a') as label`;

        const [trendRows] = await pool.execute(`
            SELECT
                ${bucketSelect},
                COUNT(*) as trips,
                COALESCE(SUM(freight_charge), 0) as revenue,
                COALESCE(SUM(total_expenses), 0) as expenses
            FROM (${tripSummaryQuery}) trip_summary
            GROUP BY bucket_key, label
            ORDER BY bucket_key ASC
        `, [currentRange.start, currentRange.end]);

        const [expenseBreakdown] = await pool.execute(`
            SELECT
                e.category,
                COALESCE(SUM(e.amount), 0) as amount
            FROM expenses e
            JOIN trips t ON t.id = e.trip_id
            WHERE t.status = 'completed' AND t.started_at >= ? AND t.started_at < ?
            GROUP BY e.category
            ORDER BY amount DESC
        `, [currentRange.start, currentRange.end]);

        const totalExpenseAmount = expenseBreakdown.reduce(
            (sum, item) => sum + (Number(item.amount) || 0),
            0
        );

        const formattedExpenseBreakdown = expenseBreakdown.map((item) => ({
            category: item.category,
            amount: Number(item.amount) || 0,
            percentage: totalExpenseAmount
                ? Number((((Number(item.amount) || 0) / totalExpenseAmount) * 100).toFixed(1))
                : 0
        }));

        const [recentTrips] = await pool.execute(`
            SELECT
                t.id,
                t.from_location as source,
                t.to_location as destination,
                t.started_at,
                t.ended_at as completed_at,
                t.freight_charge,
                u.username as driver_name,
                c.car_number,
                COALESCE(SUM(e.amount), 0) as total_expenses
            FROM trips t
            JOIN drivers d ON d.id = t.driver_id
            JOIN users u ON u.id = d.user_id
            JOIN cars c ON c.id = t.car_id
            LEFT JOIN expenses e ON e.trip_id = t.id
            WHERE t.status = 'completed' AND t.started_at >= ? AND t.started_at < ?
            GROUP BY t.id, t.from_location, t.to_location, t.started_at, t.ended_at, t.freight_charge, u.username, c.car_number
            ORDER BY t.started_at DESC
            LIMIT 10
        `, [currentRange.start, currentRange.end]);

        res.json({
            success: true,
            period,
            summary: {
                totalRevenue,
                totalExpenses,
                netProfit,
                totalTrips
            },
            comparison: {
                revenueChange: calculateChange(totalRevenue, previousSummary.total_revenue),
                expensesChange: calculateChange(totalExpenses, previousSummary.total_expenses),
                netProfitChange: calculateChange(netProfit, previousNetProfit),
                tripsChange: calculateChange(totalTrips, previousSummary.total_trips)
            },
            trend: buildTrendSeries(trendRows, {
                start: currentRange.start,
                end: currentRange.end,
                bucket
            }),
            expenseBreakdown: formattedExpenseBreakdown,
            recentTrips: recentTrips.map((trip) => ({
                ...trip,
                freight_charge: Number(trip.freight_charge) || 0,
                total_expenses: Number(trip.total_expenses) || 0,
                net_profit: (Number(trip.freight_charge) || 0) - (Number(trip.total_expenses) || 0)
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    // Cars
    getAllCars,
    addCar,
    updateCar,
    deleteCar,
    getCarHistory,
    
    // Drivers
    getAllDrivers,
    addDriver,
    assignCarToDriver,
    updateDriver,
    getDriverReport,
    getDriversExpenseReport,
    
    // Dashboard
    getDashboardStats,
    getReportsData
};
