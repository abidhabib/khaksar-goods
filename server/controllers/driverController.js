const pool = require('../config/database');
const { validateMeterReading } = require('../utils/helpers');

const getAuthenticatedDriverId = (req) => {
    const driverId = req?.user?.driver_id;
    return driverId !== undefined && driverId !== null ? Number(driverId) : null;
};

const resolveDriverId = async (req) => {
    const fromToken = getAuthenticatedDriverId(req);
    if (fromToken) {
        return fromToken;
    }

    const userId = req?.user?.id;
    if (!userId) {
        return null;
    }

    const [rows] = await pool.execute('SELECT id FROM drivers WHERE user_id = ? LIMIT 1', [userId]);
    return rows.length ? Number(rows[0].id) : null;
};

const toNumberOrDefault = (value, defaultValue = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
};

const toPositiveInteger = (value, defaultValue) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return defaultValue;
    }

    return parsed;
};

// Get driver's dashboard data
const getDashboard = async (req, res) => {
    try {
        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        // Driver profile with car
        const [profile] = await pool.execute(`
            SELECT d.*, u.username, u.phone,
                   c.id as car_id, c.car_number, c.current_meter_reading
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            LEFT JOIN cars c ON d.assigned_car_id = c.id
            WHERE d.id = ?
        `, [driver_id]);

        if (profile.length === 0) {
            return res.status(404).json({ message: 'Driver profile not found' });
        }

        // Check for ongoing trip
        const [ongoingTrip] = await pool.execute(`
            SELECT t.*, c.car_number,
                   (SELECT SUM(amount) FROM expenses WHERE trip_id = t.id) as current_expenses
            FROM trips t
            JOIN cars c ON t.car_id = c.id
            WHERE t.driver_id = ? AND t.status = 'ongoing'
            LIMIT 1
        `, [driver_id]);

        // Today's summary
        const [[todayStats]] = await pool.execute(`
            SELECT 
                COUNT(*) as trips_today,
                COALESCE(SUM(t.freight_charge), 0) as revenue_today,
                COALESCE(SUM(exp.total_expenses), 0) as expenses_today
            FROM trips t
            LEFT JOIN (
                SELECT trip_id, SUM(amount) as total_expenses
                FROM expenses
                GROUP BY trip_id
            ) exp ON t.id = exp.trip_id
            WHERE t.driver_id = ? 
                AND DATE(t.started_at) = CURDATE()
                AND t.status = 'completed'
        `, [driver_id]);

        // Recent completed trips (last 5)
        const [recentTrips] = await pool.execute(`
            SELECT t.*,
                   COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.trip_id = t.id), 0) as total_expenses,
                   (t.freight_charge - COALESCE((SELECT SUM(e2.amount) FROM expenses e2 WHERE e2.trip_id = t.id), 0)) as net_profit
            FROM trips t
            WHERE t.driver_id = ? AND t.status = 'completed'
            ORDER BY t.ended_at DESC
            LIMIT 5
        `, [driver_id]);

        // Lifetime stats
        const [[lifetimeStats]] = await pool.execute(`
            SELECT 
                COUNT(*) as total_trips,
                COALESCE(SUM(t.freight_charge), 0) as total_revenue,
                COALESCE(SUM(exp.total_expenses), 0) as total_expenses,
                COALESCE(SUM(t.freight_charge), 0) - COALESCE(SUM(exp.total_expenses), 0) as net_earnings,
                COALESCE(SUM(t.end_meter_reading - t.start_meter_reading), 0) as total_distance
            FROM trips t
            LEFT JOIN (
                SELECT trip_id, SUM(amount) as total_expenses
                FROM expenses
                GROUP BY trip_id
            ) exp ON t.id = exp.trip_id
            WHERE t.driver_id = ? AND t.status = 'completed'
        `, [driver_id]);

        res.json({
            success: true,
            profile: profile[0],
            ongoingTrip: ongoingTrip[0] || null,
            todayStats,
            recentTrips,
            lifetimeStats
        });
    } catch (error) {
        console.error('Driver dashboard error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Start new trip
const startTrip = async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const { from_location, to_location, freight_charge, meter_reading } = req.body;
        const meter_image = req.file?.path || null; // Cloudinary URL
        const meterReadingValue = toNumberOrDefault(meter_reading, NaN);
        const freightValue = toNumberOrDefault(freight_charge, NaN);

        if (!from_location || !to_location || !Number.isFinite(meterReadingValue) || !Number.isFinite(freightValue)) {
            return res.status(400).json({ message: 'Invalid trip start payload' });
        }

        // Check if driver has ongoing trip
        const [ongoing] = await connection.execute(
            'SELECT id FROM trips WHERE driver_id = ? AND status = "ongoing"',
            [driver_id]
        );

        if (ongoing.length > 0) {
            return res.status(400).json({ 
                message: 'You have an ongoing trip. End it before starting new one.' 
            });
        }

        // Get driver's assigned car
        const [driver] = await connection.execute(
            'SELECT assigned_car_id FROM drivers WHERE id = ?',
            [driver_id]
        );

        if (!driver[0]?.assigned_car_id) {
            return res.status(400).json({ message: 'No cargo assigned to you' });
        }

        const car_id = driver[0].assigned_car_id;

        // Get car's current meter
        const [car] = await connection.execute(
            'SELECT current_meter_reading FROM cars WHERE id = ?',
            [car_id]
        );

        if (car.length === 0) {
            return res.status(400).json({ message: 'Assigned cargo not found' });
        }

        // Validate meter reading
        const validation = validateMeterReading(meterReadingValue, car[0].current_meter_reading);
        if (!validation.valid) {
            return res.status(400).json({ message: validation.message });
        }

        // Create trip
        const [tripResult] = await connection.execute(
            `INSERT INTO trips 
             (driver_id, car_id, start_meter_reading, from_location, to_location, 
              freight_charge, start_meter_image, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'ongoing')`,
            [driver_id, car_id, meterReadingValue, from_location, to_location, freightValue, meter_image]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Trip started successfully',
            trip: {
                id: tripResult.insertId,
                car_id,
                from_location,
                to_location,
                freight_charge: freightValue,
                start_meter_reading: meterReadingValue,
                status: 'ongoing'
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('Start trip error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

// End trip with expenses
const endTrip = async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }
        const { trip_id } = req.params;
        const { 
            meter_reading, 
            diesel_cost = 0, 
            toll_cost = 0, 
            food_cost = 0, 
            other_cost = 0,
            notes 
        } = req.body;
        const meter_image = req.file?.path || null; // Cloudinary URL
        const safeNotes = notes ?? null;
        const meterReadingValue = toNumberOrDefault(meter_reading, NaN);
        const dieselValue = toNumberOrDefault(diesel_cost, 0);
        const tollValue = toNumberOrDefault(toll_cost, 0);
        const foodValue = toNumberOrDefault(food_cost, 0);
        const otherValue = toNumberOrDefault(other_cost, 0);

        if (!Number.isFinite(meterReadingValue)) {
            return res.status(400).json({ message: 'Invalid end meter reading' });
        }

        // Verify trip exists and belongs to driver
        const [trip] = await connection.execute(
            `SELECT t.*, c.current_meter_reading as car_current_meter
             FROM trips t
             JOIN cars c ON t.car_id = c.id
             WHERE t.id = ? AND t.driver_id = ? AND t.status = 'ongoing'`,
            [trip_id, driver_id]
        );

        if (trip.length === 0) {
            return res.status(404).json({ message: 'Trip not found or already completed' });
        }

        // Validate meter reading
        const validation = validateMeterReading(meterReadingValue, trip[0].start_meter_reading);
        if (!validation.valid) {
            return res.status(400).json({ message: validation.message });
        }

        const distance_km = meterReadingValue - trip[0].start_meter_reading;

        // Update trip
        await connection.execute(
            `UPDATE trips 
             SET end_meter_reading = ?, 
                 end_meter_image = ?,
                 status = 'completed',
                 ended_at = CURRENT_TIMESTAMP,
                 notes = ?
             WHERE id = ?`,
            [meterReadingValue, meter_image, safeNotes, trip_id]
        );

        // Add expenses
        const expenses = [
            { category: 'diesel', amount: dieselValue },
            { category: 'toll', amount: tollValue },
            { category: 'food', amount: foodValue },
            { category: 'other', amount: otherValue }
        ];

        for (const exp of expenses) {
            if (parseFloat(exp.amount) > 0) {
                await connection.execute(
                    'INSERT INTO expenses (trip_id, category, amount) VALUES (?, ?, ?)',
                    [trip_id, exp.category, exp.amount]
                );
            }
        }

        // Update car's current meter and totals
        const totalExpenses = dieselValue + tollValue + foodValue + otherValue;
        
        await connection.execute(
            `UPDATE cars 
             SET current_meter_reading = ?,
                 total_revenue = total_revenue + ?,
                 total_expenses = total_expenses + ?,
                 total_distance_km = total_distance_km + ?
             WHERE id = ?`,
            [meterReadingValue, trip[0].freight_charge, totalExpenses, distance_km, trip[0].car_id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: 'Trip completed successfully',
            summary: {
                trip_id,
                distance_km,
                freight_charge: trip[0].freight_charge,
                total_expenses: totalExpenses,
                net_profit: trip[0].freight_charge - totalExpenses
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('End trip error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

// Get trip history (for driver)
const getTripHistory = async (req, res) => {
    try {
        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }
        const page = toPositiveInteger(req.query.page, 1);
        const limit = Math.min(toPositiveInteger(req.query.limit, 20), 100);
        const offset = (page - 1) * limit;

        const [trips] = await pool.query(`
            SELECT t.*, c.car_number,
                   COALESCE(exp.total_expenses, 0) as total_expenses,
                   COALESCE(exp.diesel_expense, 0) as diesel_expense,
                   COALESCE(exp.toll_expense, 0) as toll_expense,
                   COALESCE(exp.food_expense, 0) as food_expense,
                   COALESCE(exp.other_expense, 0) as other_expense,
                   (t.freight_charge - COALESCE(exp.total_expenses, 0)) as net_profit,
                   (t.end_meter_reading - t.start_meter_reading) as distance_km
            FROM trips t
            JOIN cars c ON t.car_id = c.id
            LEFT JOIN (
                SELECT
                    trip_id,
                    SUM(amount) as total_expenses,
                    SUM(CASE WHEN category = 'diesel' THEN amount ELSE 0 END) as diesel_expense,
                    SUM(CASE WHEN category = 'toll' THEN amount ELSE 0 END) as toll_expense,
                    SUM(CASE WHEN category = 'food' THEN amount ELSE 0 END) as food_expense,
                    SUM(CASE WHEN category = 'other' THEN amount ELSE 0 END) as other_expense
                FROM expenses
                GROUP BY trip_id
            ) exp ON exp.trip_id = t.id
            WHERE t.driver_id = ?
            ORDER BY t.started_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `, [driver_id]);

        const [[count]] = await pool.execute(
            'SELECT COUNT(*) as total FROM trips WHERE driver_id = ?',
            [driver_id]
        );

        res.json({
            success: true,
            trips,
            pagination: {
                page,
                limit,
                total: count.total,
                pages: Math.ceil(count.total / limit)
            }
        });
    } catch (error) {
        console.error('Trip history error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get specific trip details with expenses
const getTripDetails = async (req, res) => {
    try {
        const { trip_id } = req.params;
        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const [trip] = await pool.execute(`
            SELECT t.*, c.car_number
            FROM trips t
            JOIN cars c ON t.car_id = c.id
            WHERE t.id = ? AND t.driver_id = ?
        `, [trip_id, driver_id]);

        if (trip.length === 0) {
            return res.status(404).json({ message: 'Trip not found' });
        }

        const [expenses] = await pool.execute(
            'SELECT * FROM expenses WHERE trip_id = ?',
            [trip_id]
        );

        res.json({
            success: true,
            trip: trip[0],
            expenses
        });
    } catch (error) {
        console.error('Trip details error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getDashboard,
    startTrip,
    endTrip,
    getTripHistory,
    getTripDetails
};
