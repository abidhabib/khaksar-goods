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

const toNullableString = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const normalized = String(value).trim();
    return normalized ? normalized : null;
};

const toExpenseNumber = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }

    return parsed;
};

const buildMonthFilter = (monthValue, column = 'expense_date') => {
    if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
        return {
            clause: '',
            params: []
        };
    }

    return {
        clause: `AND DATE_FORMAT(${column}, '%Y-%m') = ?`,
        params: [monthValue]
    };
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

        const {
            from_location,
            to_location,
            freight_charge,
            meter_reading,
            start_live_location,
            bilty_commission_amount = 0
        } = req.body;
        const meter_image = req.files?.meter_image?.[0]?.path || req.file?.path || null;
        const bilty_slip_image = req.files?.bilty_slip_image?.[0]?.path || null;
        const meterReadingValue = toNumberOrDefault(meter_reading, NaN);
        const freightValue = toNumberOrDefault(freight_charge, NaN);
        const biltyCommissionValue = toExpenseNumber(bilty_commission_amount);
        const startLiveLocation = toNullableString(start_live_location);

        if (
            !from_location ||
            !to_location ||
            !Number.isFinite(meterReadingValue) ||
            !Number.isFinite(freightValue) ||
            !meter_image ||
            !bilty_slip_image
        ) {
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
             (driver_id, car_id, start_meter_reading, from_location, start_live_location, to_location,
              freight_charge, start_meter_image, bilty_slip_image, bilty_commission_amount, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ongoing')`,
            [
                driver_id,
                car_id,
                meterReadingValue,
                from_location,
                startLiveLocation,
                to_location,
                freightValue,
                meter_image,
                bilty_slip_image,
                biltyCommissionValue
            ]
        );

        if (biltyCommissionValue > 0) {
            await connection.execute(
                'INSERT INTO expenses (trip_id, category, amount) VALUES (?, ?, ?)',
                [tripResult.insertId, 'bilty_commission', biltyCommissionValue]
            );
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Trip started successfully',
            trip: {
                id: tripResult.insertId,
                car_id,
                from_location,
                to_location,
                start_live_location: startLiveLocation,
                freight_charge: freightValue,
                start_meter_reading: meterReadingValue,
                start_meter_image: meter_image,
                bilty_slip_image,
                bilty_commission_amount: biltyCommissionValue,
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
            police_cost = 0,
            chalaan_cost = 0,
            reward_cost = 0,
            end_location,
            end_live_location,
            notes 
        } = req.body;
        const meter_image = req.files?.meter_image?.[0]?.path || req.file?.path || null;
        const safeNotes = toNullableString(notes);
        const meterReadingValue = toNumberOrDefault(meter_reading, NaN);
        const dieselValue = toExpenseNumber(diesel_cost);
        const tollValue = toExpenseNumber(toll_cost);
        const foodValue = toExpenseNumber(food_cost);
        const otherValue = toExpenseNumber(other_cost);
        const policeValue = toExpenseNumber(police_cost);
        const chalaanValue = toExpenseNumber(chalaan_cost);
        const rewardValue = toExpenseNumber(reward_cost);
        const endLocation = toNullableString(end_location);
        const endLiveLocation = toNullableString(end_live_location);

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
                 end_location = ?,
                 end_live_location = ?,
                 status = 'completed',
                 ended_at = CURRENT_TIMESTAMP,
                 notes = ?
             WHERE id = ?`,
            [meterReadingValue, meter_image, endLocation, endLiveLocation, safeNotes, trip_id]
        );

        // Add expenses
        const expenses = [
            { category: 'diesel', amount: dieselValue },
            { category: 'toll', amount: tollValue },
            { category: 'food', amount: foodValue },
            { category: 'other', amount: otherValue },
            { category: 'police', amount: policeValue },
            { category: 'chalaan', amount: chalaanValue },
            { category: 'reward', amount: rewardValue }
        ];

        for (const exp of expenses) {
            if (parseFloat(exp.amount) > 0) {
                await connection.execute(
                    'INSERT INTO expenses (trip_id, category, amount) VALUES (?, ?, ?)',
                    [trip_id, exp.category, exp.amount]
                );
            }
        }

        const [[tripExpenseTotals]] = await connection.execute(
            'SELECT COALESCE(SUM(amount), 0) AS total_expenses FROM expenses WHERE trip_id = ?',
            [trip_id]
        );
        const totalExpenses = Number(tripExpenseTotals?.total_expenses) || 0;
        
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
                   COALESCE(exp.police_expense, 0) as police_expense,
                   COALESCE(exp.chalaan_expense, 0) as chalaan_expense,
                   COALESCE(exp.reward_expense, 0) as reward_expense,
                   COALESCE(exp.bilty_commission_expense, 0) as bilty_commission_expense,
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
                    SUM(CASE WHEN category = 'other' THEN amount ELSE 0 END) as other_expense,
                    SUM(CASE WHEN category = 'police' THEN amount ELSE 0 END) as police_expense,
                    SUM(CASE WHEN category = 'chalaan' THEN amount ELSE 0 END) as chalaan_expense,
                    SUM(CASE WHEN category = 'reward' THEN amount ELSE 0 END) as reward_expense,
                    SUM(CASE WHEN category = 'bilty_commission' THEN amount ELSE 0 END) as bilty_commission_expense
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

const getDailyExpenses = async (req, res) => {
    try {
        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const monthFilter = buildMonthFilter(req.query.month, 'expense_date');

        const [expenses] = await pool.execute(
            `SELECT *,
                    (cargo_service_cost + mobile_cost + moboil_change_cost + mechanic_cost +
                     food_cost + cargo_security_guard_fee + other_cost) AS total_amount
             FROM driver_daily_expenses
             WHERE driver_id = ? ${monthFilter.clause}
             ORDER BY expense_date DESC, created_at DESC`,
            [driver_id, ...monthFilter.params]
        );

        const [[summary]] = await pool.execute(
            `SELECT
                COUNT(*) AS total_days,
                COALESCE(SUM(cargo_service_cost + mobile_cost + moboil_change_cost + mechanic_cost +
                    food_cost + cargo_security_guard_fee + other_cost), 0) AS total_amount
             FROM driver_daily_expenses
             WHERE driver_id = ? ${monthFilter.clause}`,
            [driver_id, ...monthFilter.params]
        );

        res.json({
            success: true,
            expenses,
            summary
        });
    } catch (error) {
        console.error('Daily expenses error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const saveDailyExpense = async (req, res) => {
    try {
        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const {
            expense_date,
            cargo_service_cost = 0,
            mobile_cost = 0,
            moboil_change_cost = 0,
            mechanic_cost = 0,
            food_cost = 0,
            cargo_security_guard_fee = 0,
            other_cost = 0,
            notes
        } = req.body;

        if (!expense_date || !/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
            return res.status(400).json({ message: 'Valid expense date is required' });
        }

        const values = [
            toExpenseNumber(cargo_service_cost),
            toExpenseNumber(mobile_cost),
            toExpenseNumber(moboil_change_cost),
            toExpenseNumber(mechanic_cost),
            toExpenseNumber(food_cost),
            toExpenseNumber(cargo_security_guard_fee),
            toExpenseNumber(other_cost)
        ];

        await pool.execute(
            `INSERT INTO driver_daily_expenses
             (driver_id, expense_date, cargo_service_cost, mobile_cost, moboil_change_cost,
              mechanic_cost, food_cost, cargo_security_guard_fee, other_cost, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                cargo_service_cost = VALUES(cargo_service_cost),
                mobile_cost = VALUES(mobile_cost),
                moboil_change_cost = VALUES(moboil_change_cost),
                mechanic_cost = VALUES(mechanic_cost),
                food_cost = VALUES(food_cost),
                cargo_security_guard_fee = VALUES(cargo_security_guard_fee),
                other_cost = VALUES(other_cost),
                notes = VALUES(notes)`,
            [
                driver_id,
                expense_date,
                ...values,
                toNullableString(notes)
            ]
        );

        res.json({
            success: true,
            message: 'Daily expense saved successfully'
        });
    } catch (error) {
        console.error('Save daily expense error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getDashboard,
    startTrip,
    endTrip,
    getTripHistory,
    getTripDetails,
    getDailyExpenses,
    saveDailyExpense
};
