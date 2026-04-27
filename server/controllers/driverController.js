const pool = require('../config/database');
const { ensureDriverDailyExpenseEntriesTable } = require('../config/schema');
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

const toOptionalDecimal = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }

    return parsed;
};

const getUploadedFilePath = (req, ...fieldNames) => {
    const normalizedFieldNames = fieldNames.filter(Boolean);

    if (req?.files) {
        if (Array.isArray(req.files)) {
            const match = req.files.find((file) => normalizedFieldNames.includes(file?.fieldname));
            if (match?.path) {
                return match.path;
            }
        } else {
            for (const fieldName of normalizedFieldNames) {
                const match = req.files?.[fieldName]?.[0];
                if (match?.path) {
                    return match.path;
                }
            }
        }
    }

    if (req?.file?.path && normalizedFieldNames.includes(req.file.fieldname)) {
        return req.file.path;
    }

    return null;
};

const TRIP_EXPENSE_CATEGORIES = new Set([
    'diesel',
    'toll',
    'food',
    'police',
    'chalaan',
    'reward',
    'tyre_puncture',
    'bilty_commission'
]);

const DAILY_EXPENSE_CATEGORY_MAP = {
    cargo_service: 'cargo_service',
    mobile: 'mobile',
    moboil_change: 'moboil_change',
    mechanic: 'mechanic',
    medical: 'medical',
    food: 'food',
    cargo_security_guard: 'cargo_security_guard'
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

const computeAverageKmPerLiter = (distance, liters) => {
    const distanceValue = Number(distance) || 0;
    const litersValue = Number(liters) || 0;
    if (!(litersValue > 0) || !(distanceValue > 0)) {
        return null;
    }

    return Number((distanceValue / litersValue).toFixed(2));
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
                   c.id as car_id, c.car_number, c.current_meter_reading,
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
                COALESCE(SUM(t.end_meter_reading - t.start_meter_reading), 0) as total_distance,
                COALESCE(SUM(exp.total_diesel_liters), 0) as total_diesel_liters
            FROM trips t
            LEFT JOIN (
                SELECT
                    trip_id,
                    SUM(amount) as total_expenses,
                    SUM(CASE WHEN category = 'diesel' THEN COALESCE(liters, 0) ELSE 0 END) as total_diesel_liters
                FROM expenses
                GROUP BY trip_id
            ) exp ON t.id = exp.trip_id
            WHERE t.driver_id = ? AND t.status = 'completed'
        `, [driver_id]);

        const profilePayload = profile[0];
        profilePayload.overall_average_km_per_liter = computeAverageKmPerLiter(
            profilePayload.car_total_distance,
            profilePayload.car_total_diesel_liters
        );
        lifetimeStats.overall_average_km_per_liter = computeAverageKmPerLiter(
            lifetimeStats.total_distance,
            lifetimeStats.total_diesel_liters
        );

        res.json({
            success: true,
            profile: profilePayload,
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
            start_coordinates,
            bilty_commission_amount = 0,
            load_name,
            load_weight
        } = req.body;
        const meter_image = getUploadedFilePath(req, 'meter_image', 'start_meter_image');
        const bilty_slip_image = getUploadedFilePath(req, 'bilty_slip_image', 'bilty_image');
        const load_photo = getUploadedFilePath(req, 'load_photo', 'loadPhoto', 'load_image');
        const meterReadingValue = toNumberOrDefault(meter_reading, NaN);
        const freightValue = toNumberOrDefault(freight_charge, NaN);
        const biltyCommissionValue = toExpenseNumber(bilty_commission_amount);
        const startLiveLocation = toNullableString(start_live_location);
        const startCoordinates = toNullableString(start_coordinates);
        const resolvedToLocation = toNullableString(to_location) || 'Pending end location';
        const loadName = toNullableString(load_name);
        const loadWeight = toNullableString(load_weight);

        const missingFields = [];
        if (!from_location) missingFields.push('from_location');
        if (!Number.isFinite(meterReadingValue)) missingFields.push('meter_reading');
        if (!Number.isFinite(freightValue)) missingFields.push('freight_charge');
        if (!loadName) missingFields.push('load_name');
        if (!loadWeight) missingFields.push('load_weight');
        if (!meter_image) missingFields.push('meter_image');
        if (!bilty_slip_image) missingFields.push('bilty_slip_image');
        if (!load_photo) missingFields.push('load_photo');

        if (missingFields.length) {
            return res.status(400).json({
                message: `Invalid trip start payload: missing ${missingFields.join(', ')}`
            });
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

        // Create trip
        const [tripResult] = await connection.execute(
            `INSERT INTO trips 
             (driver_id, car_id, start_meter_reading, from_location, start_live_location, start_coordinates, to_location,
              freight_charge, start_meter_image, bilty_slip_image, bilty_commission_amount, load_name, load_weight, load_photo, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ongoing')`,
            [
                driver_id,
                car_id,
                meterReadingValue,
                from_location,
                startLiveLocation,
                startCoordinates,
                resolvedToLocation,
                freightValue,
                meter_image,
                bilty_slip_image,
                biltyCommissionValue,
                loadName,
                loadWeight,
                load_photo
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
                start_coordinates: startCoordinates,
                freight_charge: freightValue,
                start_meter_reading: meterReadingValue,
                start_meter_image: meter_image,
                bilty_slip_image,
                bilty_commission_amount: biltyCommissionValue,
                load_name: loadName,
                load_weight: loadWeight,
                load_photo,
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
            police_cost = 0,
            chalaan_cost = 0,
            reward_cost = 0,
            tyre_puncture_cost = 0,
            end_location,
            end_live_location,
            end_coordinates
        } = req.body;
        const meter_image = req.files?.meter_image?.[0]?.path || req.file?.path || null;
        const meterReadingValue = toNumberOrDefault(meter_reading, NaN);
        const dieselValue = toExpenseNumber(diesel_cost);
        const tollValue = toExpenseNumber(toll_cost);
        const foodValue = toExpenseNumber(food_cost);
        const policeValue = toExpenseNumber(police_cost);
        const chalaanValue = toExpenseNumber(chalaan_cost);
        const rewardValue = toExpenseNumber(reward_cost);
        const tyrePunctureValue = toExpenseNumber(tyre_puncture_cost);
        const endLocation = toNullableString(end_location);
        const endLiveLocation = toNullableString(end_live_location);
        const endCoordinates = toNullableString(end_coordinates);

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

        const distance_km = meterReadingValue - trip[0].start_meter_reading;

        // Update trip
        await connection.execute(
            `UPDATE trips 
             SET end_meter_reading = ?, 
                 end_meter_image = ?,
                 to_location = COALESCE(?, to_location),
                 end_location = ?,
                 end_live_location = ?,
                 end_coordinates = ?,
                 status = 'completed',
                 ended_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [meterReadingValue, meter_image, endLocation, endLocation, endLiveLocation, endCoordinates, trip_id]
        );

        // Backward compatibility for any unsaved totals still sent by older clients
        const expenses = [
            { category: 'diesel', amount: dieselValue },
            { category: 'toll', amount: tollValue },
            { category: 'food', amount: foodValue },
            { category: 'police', amount: policeValue },
            { category: 'chalaan', amount: chalaanValue },
            { category: 'reward', amount: rewardValue },
            { category: 'tyre_puncture', amount: tyrePunctureValue }
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

const addTripExpense = async (req, res) => {
    try {
        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const { trip_id } = req.params;
        const { category, amount, liters, location, coordinates } = req.body;
        const receiptImage = getUploadedFilePath(req, 'receipt_image');
        const normalizedCategory = toNullableString(category);
        const amountValue = toExpenseNumber(amount);
        const litersValue = toOptionalDecimal(liters);
        const locationValue = toNullableString(location);
        const coordinatesValue = toNullableString(coordinates);

        if (!normalizedCategory || !TRIP_EXPENSE_CATEGORIES.has(normalizedCategory)) {
            return res.status(400).json({ message: 'Invalid expense category' });
        }

        if (!(amountValue > 0)) {
            return res.status(400).json({ message: 'Expense amount must be greater than zero' });
        }

        if (normalizedCategory === 'diesel') {
            if (litersValue === null) {
                return res.status(400).json({ message: 'Liters are required for diesel expense' });
            }

            if (!locationValue) {
                return res.status(400).json({ message: 'Location is required for diesel expense' });
            }

            if (!receiptImage) {
                return res.status(400).json({ message: 'Meter photo is required for diesel expense' });
            }
        }

        const [trip] = await pool.execute(
            'SELECT id FROM trips WHERE id = ? AND driver_id = ? AND status = "ongoing" LIMIT 1',
            [trip_id, driver_id]
        );

        if (!trip.length) {
            return res.status(404).json({ message: 'Ongoing trip not found' });
        }

        const [result] = await pool.execute(
            'INSERT INTO expenses (trip_id, category, amount, liters, location, coordinates, receipt_image) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [trip_id, normalizedCategory, amountValue, litersValue, locationValue, coordinatesValue, receiptImage]
        );

        const [[savedExpense]] = await pool.execute(
            'SELECT id, trip_id, category, amount, liters, location, coordinates, receipt_image, created_at FROM expenses WHERE id = ? LIMIT 1',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Expense saved successfully',
            expense: savedExpense
        });
    } catch (error) {
        console.error('Add trip expense error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
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
                   COALESCE(exp.total_diesel_liters, 0) as total_diesel_liters,
                   COALESCE(exp.diesel_expense, 0) as diesel_expense,
                   COALESCE(exp.toll_expense, 0) as toll_expense,
                   COALESCE(exp.food_expense, 0) as food_expense,
                   COALESCE(exp.police_expense, 0) as police_expense,
                   COALESCE(exp.chalaan_expense, 0) as chalaan_expense,
                   COALESCE(exp.reward_expense, 0) as reward_expense,
                   COALESCE(exp.tyre_puncture_expense, 0) as tyre_puncture_expense,
                   COALESCE(exp.bilty_commission_expense, 0) as bilty_commission_expense,
                   (t.freight_charge - COALESCE(exp.total_expenses, 0)) as net_profit,
                   (t.end_meter_reading - t.start_meter_reading) as distance_km
            FROM trips t
            JOIN cars c ON t.car_id = c.id
            LEFT JOIN (
                SELECT
                    trip_id,
                    SUM(amount) as total_expenses,
                    SUM(CASE WHEN category = 'diesel' THEN COALESCE(liters, 0) ELSE 0 END) as total_diesel_liters,
                    SUM(CASE WHEN category = 'diesel' THEN amount ELSE 0 END) as diesel_expense,
                    SUM(CASE WHEN category = 'toll' THEN amount ELSE 0 END) as toll_expense,
                    SUM(CASE WHEN category = 'food' THEN amount ELSE 0 END) as food_expense,
                    SUM(CASE WHEN category = 'police' THEN amount ELSE 0 END) as police_expense,
                    SUM(CASE WHEN category = 'chalaan' THEN amount ELSE 0 END) as chalaan_expense,
                    SUM(CASE WHEN category = 'reward' THEN amount ELSE 0 END) as reward_expense,
                    SUM(CASE WHEN category = 'tyre_puncture' THEN amount ELSE 0 END) as tyre_puncture_expense,
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
            trips: trips.map((trip) => {
                const distanceKm = Number(trip.distance_km) || 0;
                const totalDieselLiters = Number(trip.total_diesel_liters) || 0;
                return {
                    ...trip,
                    total_diesel_liters: totalDieselLiters,
                    trip_average_km_per_liter: computeAverageKmPerLiter(distanceKm, totalDieselLiters)
                };
            }),
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
            'SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at DESC, id DESC',
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
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverDailyExpenseEntriesTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const monthFilter = buildMonthFilter(req.query.month, 'expense_date');

        const [entries] = await pool.execute(
            `SELECT id, driver_id, category, amount, expense_date, created_at
             FROM driver_daily_expense_entries
             WHERE driver_id = ? ${monthFilter.clause}
             ORDER BY created_at DESC, id DESC`,
            [driver_id, ...monthFilter.params]
        );

        const [categoryTotals] = await pool.execute(
            `SELECT
                expense_date,
                category,
                COALESCE(SUM(amount), 0) AS total_amount
             FROM driver_daily_expense_entries
             WHERE driver_id = ? ${monthFilter.clause}
             GROUP BY expense_date, category
             ORDER BY expense_date DESC`,
            [driver_id, ...monthFilter.params]
        );

        const expensesByDate = {};
        for (const row of categoryTotals) {
            const dateKey = row.expense_date instanceof Date
                ? row.expense_date.toISOString().slice(0, 10)
                : String(row.expense_date).slice(0, 10);

            if (!expensesByDate[dateKey]) {
                expensesByDate[dateKey] = {
                    expense_date: dateKey,
                    cargo_service_cost: 0,
                    mobile_cost: 0,
                    moboil_change_cost: 0,
                    mechanic_cost: 0,
                    medical_cost: 0,
                    food_cost: 0,
                    cargo_security_guard_fee: 0,
                    total_amount: 0
                };
            }

            const amountValue = Number(row.total_amount) || 0;
            switch (row.category) {
                case 'cargo_service':
                    expensesByDate[dateKey].cargo_service_cost += amountValue;
                    break;
                case 'mobile':
                    expensesByDate[dateKey].mobile_cost += amountValue;
                    break;
                case 'moboil_change':
                    expensesByDate[dateKey].moboil_change_cost += amountValue;
                    break;
                case 'mechanic':
                    expensesByDate[dateKey].mechanic_cost += amountValue;
                    break;
                case 'medical':
                    expensesByDate[dateKey].medical_cost += amountValue;
                    break;
                case 'food':
                    expensesByDate[dateKey].food_cost += amountValue;
                    break;
                case 'cargo_security_guard':
                    expensesByDate[dateKey].cargo_security_guard_fee += amountValue;
                    break;
                default:
                    break;
            }

            expensesByDate[dateKey].total_amount += amountValue;
        }

        const [[summary]] = await pool.execute(
            `SELECT
                COUNT(*) AS total_entries,
                COUNT(DISTINCT expense_date) AS total_days,
                COALESCE(SUM(amount), 0) AS total_amount
             FROM driver_daily_expense_entries
             WHERE driver_id = ? ${monthFilter.clause}`,
            [driver_id, ...monthFilter.params]
        );

        res.json({
            success: true,
            expenses: Object.values(expensesByDate),
            entries,
            summary
        });
    } catch (error) {
        console.error('Daily expenses error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const saveDailyExpense = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverDailyExpenseEntriesTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const {
            category,
            amount,
            cargo_service_cost = 0,
            mobile_cost = 0,
            moboil_change_cost = 0,
            mechanic_cost = 0,
            medical_cost = 0,
            food_cost = 0,
            cargo_security_guard_fee = 0
        } = req.body;

        const normalizedCategory = toNullableString(category);
        if (normalizedCategory && amount !== undefined) {
            const amountValue = toExpenseNumber(amount);

            if (!DAILY_EXPENSE_CATEGORY_MAP[normalizedCategory]) {
                return res.status(400).json({ message: 'Invalid daily expense category' });
            }

            if (!(amountValue > 0)) {
                return res.status(400).json({ message: 'Expense amount must be greater than zero' });
            }

            const [result] = await pool.execute(
                `INSERT INTO driver_daily_expense_entries
                 (driver_id, category, amount, expense_date)
                 VALUES (?, ?, ?, CURDATE())`,
                [driver_id, normalizedCategory, amountValue]
            );

            const [[entry]] = await pool.execute(
                `SELECT id, driver_id, category, amount, expense_date, created_at
                 FROM driver_daily_expense_entries
                 WHERE id = ? LIMIT 1`,
                [result.insertId]
            );

            return res.json({
                success: true,
                message: 'Daily expense saved successfully',
                entry
            });
        } else {
            const values = [
                toExpenseNumber(cargo_service_cost),
                toExpenseNumber(mobile_cost),
                toExpenseNumber(moboil_change_cost),
                toExpenseNumber(mechanic_cost),
                toExpenseNumber(medical_cost),
                toExpenseNumber(food_cost),
                toExpenseNumber(cargo_security_guard_fee)
            ];

            const rows = [
                ['cargo_service', values[0]],
                ['mobile', values[1]],
                ['moboil_change', values[2]],
                ['mechanic', values[3]],
                ['medical', values[4]],
                ['food', values[5]],
                ['cargo_security_guard', values[6]]
            ].filter(([, amountValue]) => amountValue > 0);

            for (const [categoryName, amountValue] of rows) {
                await pool.execute(
                    `INSERT INTO driver_daily_expense_entries
                     (driver_id, category, amount, expense_date)
                     VALUES (?, ?, ?, CURDATE())`,
                    [driver_id, categoryName, amountValue]
                );
            }
        }

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
    addTripExpense,
    getTripHistory,
    getTripDetails,
    getDailyExpenses,
    saveDailyExpense
};
