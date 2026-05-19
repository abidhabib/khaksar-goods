const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const {
    ensureDriverDailyExpenseEntriesTable,
    ensureDriverDailyExpenseEntryColumns,
    ensureDriverPaymentSubmissionsTable,
    ensureDriverLeaveRequestsTable,
    ensureFreightRateCardsTable
} = require('../config/schema');
const {
    roundCurrency,
    syncDriverSalaryForDriver,
    syncHelperSalaryForHelper,
    syncAllDriverSalary,
    syncAllHelperSalary,
    validateReceiveMethodPayload
} = require('../services/accountService');
const {
    attachBetweenTripDailyExpenses
} = require('../utils/helpers');
const {
    getFreightRates,
    calculateFreightEstimate,
    calculateFreightEstimateFromRates,
    parsePositiveNumber,
    roundTo
} = require('../services/freightRateService');

const PAYMENT_SUBMISSION_STATUSES = new Set(['pending', 'approved', 'rejected']);
const LEAVE_REQUEST_ACTIONS = new Set(['approve', 'reject']);
const ACCOUNT_REVIEW_STATUSES = new Set(['approved', 'rejected']);
const PAYMENT_METHODS = new Set(['cash', 'account']);
const DRIVER_BALANCE_TYPES = new Set(['available', 'commission']);
const TRIP_EXPENSE_CATEGORIES = new Set([
    'diesel',
    'toll',
    'food',
    'police',
    'chalaan',
    'mandi_kaat',
    'reward',
    'tyre_puncture',
    'bilty_commission'
]);
const DAILY_EXPENSE_CATEGORIES = new Set([
    'cargo_service',
    'mobile',
    'moboil_change',
    'vehicle_maintenance',
    'mechanic',
    'medical',
    'food',
    'cargo_security_guard',
    'other'
]);

const toNullableString = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const normalized = String(value).trim();
    return normalized ? normalized : null;
};

const toNonNegativeAmount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? roundCurrency(parsed) : 0;
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

const syncCarCurrentMeterFromTrips = async (connection, carId) => {
    if (!carId) {
        return;
    }

    const [[ongoingTrip]] = await connection.execute(
        'SELECT id FROM trips WHERE car_id = ? AND status = "ongoing" LIMIT 1',
        [carId]
    );

    if (ongoingTrip?.id) {
        return;
    }

    const [[latestCompletedTrip]] = await connection.execute(
        `SELECT end_meter_reading
         FROM trips
         WHERE car_id = ? AND status = 'completed' AND end_meter_reading IS NOT NULL
         ORDER BY COALESCE(ended_at, started_at) DESC, id DESC
         LIMIT 1`,
        [carId]
    );

    if (latestCompletedTrip?.end_meter_reading !== undefined && latestCompletedTrip?.end_meter_reading !== null) {
        await connection.execute(
            'UPDATE cars SET current_meter_reading = ? WHERE id = ?',
            [latestCompletedTrip.end_meter_reading, carId]
        );
    }
};

const fetchTripWithExpensesById = async (tripId) => {
    const [tripRows] = await pool.execute(
        `SELECT
            t.*,
            u.username as driver_name,
            u.phone as driver_phone,
            d.license_number,
            c.car_number,
            COALESCE(exp.total_expenses, 0) as total_expenses,
            (COALESCE(t.freight_charge, 0) - COALESCE(exp.total_expenses, 0)) as net_profit,
            (COALESCE(t.end_meter_reading, 0) - COALESCE(t.start_meter_reading, 0)) as distance_km
         FROM trips t
         JOIN drivers d ON t.driver_id = d.id
         JOIN users u ON d.user_id = u.id
         JOIN cars c ON t.car_id = c.id
         LEFT JOIN (
             SELECT trip_id, SUM(amount) as total_expenses
             FROM expenses
             GROUP BY trip_id
         ) exp ON exp.trip_id = t.id
         WHERE t.id = ?
         LIMIT 1`,
        [tripId]
    );

    if (!tripRows.length) {
        return null;
    }

    const [trip] = await attachExpensesToTrips(tripRows);
    return trip;
};

const syncDriverHelperAssignment = async (connection, driverId, helperId) => {
    const normalizedHelperId = helperId ? Number(helperId) : null;

    if (!normalizedHelperId) {
        await connection.execute('UPDATE drivers SET helper_id = NULL WHERE id = ?', [driverId]);
        return;
    }

    const [helperRows] = await connection.execute(
        'SELECT id, status FROM helpers WHERE id = ? LIMIT 1',
        [normalizedHelperId]
    );

    if (!helperRows.length) {
        throw new Error('Helper not found');
    }

    if (helperRows[0].status !== 'active') {
        throw new Error('Only active helpers can be assigned');
    }

    await connection.execute(
        'UPDATE drivers SET helper_id = NULL WHERE helper_id = ? AND id != ?',
        [normalizedHelperId, driverId]
    );
    await connection.execute('UPDATE drivers SET helper_id = ? WHERE id = ?', [normalizedHelperId, driverId]);
};

const createDriverAccountTransaction = async (connection, {
    driverId,
    balanceType,
    transactionType,
    direction,
    amount,
    sourceType,
    sourceId,
    notes
}) => {
    await connection.execute(
        `INSERT INTO driver_account_transactions
            (driver_id, balance_type, transaction_type, direction, amount, source_type, source_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [driverId, balanceType, transactionType, direction, amount, sourceType || null, sourceId || null, notes || null]
    );
};

const createHelperAccountTransaction = async (connection, {
    helperId,
    driverId,
    transactionType,
    direction,
    amount,
    sourceType,
    sourceId,
    notes
}) => {
    await connection.execute(
        `INSERT INTO helper_account_transactions
            (helper_id, driver_id, transaction_type, direction, amount, source_type, source_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [helperId, driverId || null, transactionType, direction, amount, sourceType || null, sourceId || null, notes || null]
    );
};

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

const getTimestampFilter = ({ month, fromDate, toDate }, column = 'ps.submitted_at') => {
    const conditions = [];
    const params = [];

    if (month && /^\d{4}-\d{2}$/.test(month)) {
        conditions.push(`DATE_FORMAT(${column}, '%Y-%m') = ?`);
        params.push(month);
    }

    if (fromDate) {
        conditions.push(`${column} >= ?`);
        params.push(`${fromDate} 00:00:00`);
    }

    if (toDate) {
        conditions.push(`${column} <= ?`);
        params.push(`${toDate} 23:59:59`);
    }

    return {
        clause: conditions.length ? `AND ${conditions.join(' AND ')}` : '',
        params
    };
};

const extractNumericWeightTon = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const parsed = Number.parseFloat(String(value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const extractTripDistanceKm = (trip) => {
    const distanceFromField = Number(trip?.distance_km);
    if (Number.isFinite(distanceFromField) && distanceFromField > 0) {
        return distanceFromField;
    }

    const startMeter = Number(trip?.start_meter_reading);
    const endMeter = Number(trip?.end_meter_reading);
    const distanceFromMeters = endMeter - startMeter;
    return Number.isFinite(distanceFromMeters) && distanceFromMeters > 0 ? distanceFromMeters : null;
};

const withFreightVariance = (trip, rates) => {
    const weightTon = extractNumericWeightTon(trip?.load_weight);
    const distanceKm = extractTripDistanceKm(trip);
    const actualFreight = Number(trip?.freight_charge);

    if (!weightTon || !distanceKm || !Number.isFinite(actualFreight) || actualFreight <= 0 || !rates.length) {
        return {
            ...trip,
            expected_freight_charge: null,
            freight_variance_amount: null,
            freight_variance_percentage: null,
            freight_variance_direction: null,
            expected_rate_per_km: null
        };
    }

    try {
        const estimate = calculateFreightEstimateFromRates({ weightTon, distanceKm, rates });
        const varianceAmount = roundTo(actualFreight - estimate.total_freight_charge);
        const variancePercentage = estimate.total_freight_charge > 0
            ? roundTo((varianceAmount / estimate.total_freight_charge) * 100)
            : null;

        return {
            ...trip,
            expected_freight_charge: estimate.total_freight_charge,
            expected_rate_per_km: estimate.applied_rate_per_km,
            freight_variance_amount: varianceAmount,
            freight_variance_percentage: variancePercentage,
            freight_variance_direction: varianceAmount > 0 ? 'up' : varianceAmount < 0 ? 'down' : 'equal'
        };
    } catch (error) {
        return {
            ...trip,
            expected_freight_charge: null,
            freight_variance_amount: null,
            freight_variance_percentage: null,
            freight_variance_direction: null,
            expected_rate_per_km: null
        };
    }
};

const computeAverageKmPerLiter = (distance, liters) => {
    const distanceValue = Number(distance) || 0;
    const litersValue = Number(liters) || 0;
    if (!(litersValue > 0) || !(distanceValue > 0)) {
        return null;
    }

    return Number((distanceValue / litersValue).toFixed(2));
};

const applyTripNetIncomeFormula = (trip) => {
    const freightCharge = Number(trip?.freight_charge) || 0;
    const tripExpensesTotal = Number(
        trip?.trip_expenses_total ?? trip?.current_expenses ?? trip?.total_expenses
    ) || 0;
    const betweenTripExpensesTotal = Number(trip?.between_trip_expenses_total) || 0;
    const biltyCommissionAmount = Number(trip?.bilty_commission_amount) || 0;
    const totalExpenses = tripExpensesTotal + betweenTripExpensesTotal + biltyCommissionAmount;
    const netIncome = freightCharge - totalExpenses;

    return {
        ...trip,
        freight_charge: freightCharge,
        trip_expenses_total: tripExpensesTotal,
        between_trip_expenses_total: betweenTripExpensesTotal,
        bilty_commission_amount: biltyCommissionAmount,
        total_expenses: totalExpenses,
        net_profit: netIncome,
        net_income: netIncome
    };
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
                   dll.area as last_location_area,
                   dll.city as last_location_city,
                   dll.province as last_location_province,
                   dll.address_label as last_location_label,
                   dll.latitude as last_location_latitude,
                   dll.longitude as last_location_longitude,
                   dll.created_at as last_location_at,
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
            LEFT JOIN driver_location_logs dll ON dll.id = (
                SELECT l1.id
                FROM driver_location_logs l1
                WHERE l1.driver_id = d.id
                ORDER BY l1.created_at DESC, l1.id DESC
                LIMIT 1
            )
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
        const freightRates = await getFreightRates().catch(() => []);
        const tripsWithVariance = tripsWithExpenses
            .map((trip) => withFreightVariance(trip, freightRates))
            .map(applyTripNetIncomeFormula);

        const completedTrips = tripsWithVariance.filter((trip) => trip.status === 'completed');
        const driverStatsMap = new Map();
        for (const trip of completedTrips) {
            const key = Number(trip.driver_id);
            if (!driverStatsMap.has(key)) {
                driverStatsMap.set(key, {
                    driver_name: trip.driver_name || 'Unknown',
                    total_trips: 0,
                    total_revenue: 0,
                    total_expenses: 0,
                    total_distance: 0
                });
            }

            const statsEntry = driverStatsMap.get(key);
            statsEntry.total_trips += 1;
            statsEntry.total_revenue += Number(trip.freight_charge) || 0;
            statsEntry.total_expenses += Number(trip.total_expenses) || 0;
            statsEntry.total_distance += Number(trip.end_meter_reading - trip.start_meter_reading) || 0;
        }

        const driverStats = Array.from(driverStatsMap.values());
        const summaryTotals = tripsWithVariance.reduce((acc, trip) => {
            acc.total_trips += 1;
            acc.total_revenue += Number(trip.freight_charge) || 0;
            acc.total_expenses += Number(trip.total_expenses) || 0;
            acc.total_distance += Number(trip.end_meter_reading - trip.start_meter_reading) || 0;
            acc.total_diesel_liters += Number(trip.total_diesel_liters) || 0;
            return acc;
        }, {
            total_trips: 0,
            total_revenue: 0,
            total_expenses: 0,
            total_distance: 0,
            total_diesel_liters: 0
        });

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
            trips: tripsWithVariance,
            driverStats,
            summary: {
                ...summaryTotals,
                overall_average_km_per_liter: computeAverageKmPerLiter(
                    summaryTotals.total_distance,
                    summaryTotals.total_diesel_liters
                ),
                net_income: summaryTotals.total_revenue - summaryTotals.total_expenses
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getTripReport = async (req, res) => {
    try {
        const { id } = req.params;

        const [tripRows] = await pool.execute(`
            SELECT
                t.*,
                u.username as driver_name,
                u.phone as driver_phone,
                d.license_number,
                c.car_number,
                COALESCE(exp.total_expenses, 0) as total_expenses,
                (COALESCE(t.freight_charge, 0) - COALESCE(exp.total_expenses, 0)) as net_profit,
                (COALESCE(t.end_meter_reading, 0) - COALESCE(t.start_meter_reading, 0)) as distance_km
            FROM trips t
            JOIN drivers d ON t.driver_id = d.id
            JOIN users u ON d.user_id = u.id
            JOIN cars c ON t.car_id = c.id
            LEFT JOIN (
                SELECT trip_id, SUM(amount) as total_expenses
                FROM expenses
                GROUP BY trip_id
            ) exp ON exp.trip_id = t.id
            WHERE t.id = ?
            LIMIT 1
        `, [id]);

        if (!tripRows.length) {
            return res.status(404).json({ message: 'Trip not found' });
        }

        const [tripWithExpenses] = await attachExpensesToTrips(tripRows);
        const freightRates = await getFreightRates().catch(() => []);
        const tripWithVariance = applyTripNetIncomeFormula(withFreightVariance(tripWithExpenses, freightRates));

        res.json({
            success: true,
            trip: tripWithVariance,
            expenses: tripWithVariance.expenses || []
        });
    } catch (error) {
        console.error('Trip report error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ========== DRIVER MANAGEMENT ==========

// Get all drivers
const getAllDrivers = async (req, res) => {
    try {
        const connection = await pool.getConnection();
        try {
            await syncAllDriverSalary(connection);
            await syncAllHelperSalary(connection);
        } finally {
            connection.release();
        }

        const [drivers] = await pool.execute(`
            SELECT d.*,
                   COALESCE(d.full_name, u.username) AS full_name,
                   u.username, u.phone, u.status, u.created_at,
                   c.id as car_id, c.car_number, c.current_meter_reading as car_current_meter,
                   h.helper_name, h.phone_number as helper_phone_number, h.salary_amount as helper_salary_amount,
                   (
                       COALESCE((
                           SELECT SUM(CASE WHEN t3.status = 'completed' THEN t3.freight_charge ELSE 0 END)
                           FROM trips t3
                           WHERE t3.driver_id = d.id
                       ), 0)
                       -
                       COALESCE((
                           SELECT SUM(CASE WHEN r.status = 'approved' THEN r.amount ELSE 0 END)
                           FROM driver_cashout_requests r
                           WHERE r.driver_id = d.id
                       ), 0)
                   ) AS company_amount,
                   dll.area as last_location_area,
                   dll.city as last_location_city,
                   dll.province as last_location_province,
                   dll.address_label as last_location_label,
                   dll.latitude as last_location_latitude,
                   dll.longitude as last_location_longitude,
                   dll.created_at as last_location_at,
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
            LEFT JOIN helpers h ON d.helper_id = h.id
            LEFT JOIN driver_location_logs dll ON dll.id = (
                SELECT l1.id
                FROM driver_location_logs l1
                WHERE l1.driver_id = d.id
                ORDER BY l1.created_at DESC, l1.id DESC
                LIMIT 1
            )
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
        
        const {
            name,
            username,
            phone,
            password,
            license_number,
            car_id,
            helper_id,
            salary_amount,
            commission_percentage,
            available_balance,
            commission_balance,
            joined_date
        } = req.body;

        const fullName = toNullableString(name);
        const normalizedUsername = toNullableString(username);
        const helperId = helper_id ? Number(helper_id) : null;
        const salaryAmount = toNonNegativeAmount(salary_amount);
        const commissionPercentage = toNonNegativeAmount(commission_percentage);
        const availableBalance = toNonNegativeAmount(available_balance);
        const commissionBalance = toNonNegativeAmount(commission_balance);
        const joinedDate = toNullableString(joined_date);

        if (!fullName || !normalizedUsername || !password) {
            return res.status(400).json({ message: 'Driver name, username, and password are required' });
        }

        const [existingUsers] = await connection.execute(
            'SELECT id FROM users WHERE username = ? LIMIT 1',
            [normalizedUsername]
        );

        if (existingUsers.length) {
            return res.status(400).json({ message: 'Username already exists' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const [userResult] = await connection.execute(
            'INSERT INTO users (username, password_hash, role, phone, status) VALUES (?, ?, "driver", ?, "active")',
            [normalizedUsername, password_hash, toNullableString(phone)]
        );

        const user_id = userResult.insertId;

        const [driverResult] = await connection.execute(
            `INSERT INTO drivers
                (user_id, full_name, license_number, salary_amount, commission_percentage, assigned_car_id, helper_id, available_balance, commission_balance, next_salary_credit_date, joined_date)
             VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, DATE_ADD(CURDATE(), INTERVAL 1 DAY), ?)`,
            [user_id, fullName, toNullableString(license_number), salaryAmount, commissionPercentage, availableBalance, commissionBalance, joinedDate]
        );

        if (car_id) {
            await assignCarWithIntegrity(connection, driverResult.insertId, car_id);
        }

        if (helperId) {
            await syncDriverHelperAssignment(connection, driverResult.insertId, helperId);
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Driver created successfully',
            driver: {
                id: driverResult.insertId,
                user_id,
                full_name: fullName,
                username: normalizedUsername,
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

const assignCarToDriver = async (req, res) => {
    const connection = await pool.getConnection();

    console.log('==============================');
    console.log('ASSIGN CAR PROCESS STARTED');
    console.log('Request Body:', req.body);

    try {
        await connection.beginTransaction();

        console.log('Transaction started');

        const { driver_id, car_id } = req.body;

        const driverId = Number(driver_id);
        const carId = Number(car_id);

        console.log('Parsed Driver ID:', driverId);
        console.log('Parsed Car ID:', carId);

        // Assign car with integrity checks
        console.log('Calling assignCarWithIntegrity...');

        await assignCarWithIntegrity(connection, driverId, carId);

        console.log('assignCarWithIntegrity completed successfully');

        // Fetch car meter reading
        console.log('Fetching current meter reading from cars table...');

        const [carRows] = await connection.execute(
            `SELECT current_meter_reading 
             FROM cars 
             WHERE id = ?`,
            [carId]
        );

        console.log('Car Query Result:', carRows);

        if (carRows.length === 0) {
            console.error('Car not found after assignment check');
            throw new Error('Car not found');
        }

        const currentMeterReading = carRows[0].current_meter_reading || 0;

        console.log('Current Meter Reading:', currentMeterReading);

        // Check existing moboil entry
        console.log('Checking existing moboil entry...');

        const [existingMoboil] = await connection.execute(
            `SELECT id 
             FROM driver_daily_expense_entries
             WHERE driver_id = ?
               AND category = 'moboil_change'
               AND meter_reading = ?
             LIMIT 1`,
            [driverId, currentMeterReading]
        );

        console.log('Existing Moboil Result:', existingMoboil);

        // Insert initial moboil entry
        if (existingMoboil.length === 0) {

            console.log('No existing moboil entry found');
            console.log('Creating initial moboil entry...');

            const [moboilInsert] = await connection.execute(
                `INSERT INTO driver_daily_expense_entries
                (
                    driver_id,
                    category,
                    amount,
                    meter_reading,
                    note,
                    expense_date
                )
                VALUES (?, 'moboil_change', 0, ?, ?, CURDATE())`,
                [
                    driverId,
                    currentMeterReading,
                    'Initial moboil entry on car assignment'
                ]
            );

            console.log('Moboil Entry Created Successfully');
            console.log('Inserted ID:', moboilInsert.insertId);

        } else {

            console.log('Moboil entry already exists');
            console.log('Skipping insert');

        }

        console.log('Committing transaction...');

        await connection.commit();

        console.log('Transaction committed successfully');
        console.log('ASSIGN CAR PROCESS COMPLETED');
        console.log('==============================');

        res.json({
            success: true,
            message: 'Car assigned successfully'
        });

    } catch (error) {

        console.error('==============================');
        console.error('ASSIGN CAR PROCESS FAILED');
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);

        console.log('Rolling back transaction...');

        await connection.rollback();

        console.log('Transaction rolled back');
        console.error('==============================');

        if (
            error.message === 'Driver not found' ||
            error.message === 'Car not found' ||
            error.message === 'Only active cars can be assigned' ||
            error.message === 'Driver has ongoing trip. Complete it first.' ||
            error.message === 'Selected cargo is assigned to a driver with an ongoing trip'
        ) {
            return res.status(400).json({
                message: error.message
            });
        }

        res.status(500).json({
            message: 'Server error',
            error: error.message
        });

    } finally {

        console.log('Releasing database connection...');
        connection.release();
        console.log('Database connection released');

    }
};
// Update driver
const updateDriver = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const { id } = req.params;
        const {
            full_name,
            username,
            phone,
            status,
            password,
            license_number,
            car_id,
            helper_id,
            salary_amount,
            commission_percentage,
            available_balance,
            commission_balance,
            joined_date
        } = req.body;

        await connection.beginTransaction();

        const [driver] = await connection.execute(
            'SELECT user_id FROM drivers WHERE id = ?',
            [id]
        );

        if (driver.length === 0) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        const user_id = driver[0].user_id;

        if (username) {
            const [existingRows] = await connection.execute(
                'SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1',
                [username, user_id]
            );

            if (existingRows.length) {
                return res.status(400).json({ message: 'Username already exists' });
            }
        }

        await connection.execute(
            'UPDATE users SET username = COALESCE(?, username), phone = ?, status = ? WHERE id = ?',
            [toNullableString(username), toNullableString(phone), status, user_id]
        );

        await connection.execute(
            `UPDATE drivers
             SET full_name = COALESCE(?, full_name),
                 license_number = ?,
                 salary_amount = ?,
                 commission_percentage = ?,
                 available_balance = ?,
                 commission_balance = ?,
                 joined_date = ?
             WHERE id = ?`,
            [
                toNullableString(full_name),
                toNullableString(license_number),
                toNonNegativeAmount(salary_amount),
                toNonNegativeAmount(commission_percentage),
                toNonNegativeAmount(available_balance),
                toNonNegativeAmount(commission_balance),
                toNullableString(joined_date),
                id
            ]
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

        if (helper_id !== undefined) {
            await syncDriverHelperAssignment(connection, Number(id), helper_id);
        }

        await syncDriverSalaryForDriver(connection, Number(id));
        const [updatedDriverRows] = await connection.execute('SELECT helper_id FROM drivers WHERE id = ? LIMIT 1', [id]);
        if (updatedDriverRows[0]?.helper_id) {
            await syncHelperSalaryForHelper(connection, updatedDriverRows[0].helper_id);
        }

        await connection.commit();

        res.json({ success: true, message: 'Driver updated successfully' });
    } catch (error) {
        await connection.rollback();
        if (error.message === 'Driver not found' ||
            error.message === 'Car not found' ||
            error.message === 'Helper not found' ||
            error.message === 'Only active helpers can be assigned' ||
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

const getHelpers = async (req, res) => {
    try {
        const connection = await pool.getConnection();
        try {
            await syncAllHelperSalary(connection);
        } finally {
            connection.release();
        }

        const [helpers] = await pool.execute(`
            SELECT h.*,
                   d.id AS driver_id,
                   d.full_name AS driver_full_name,
                   u.username AS driver_username,
                   c.car_number
            FROM helpers h
            LEFT JOIN drivers d ON d.helper_id = h.id
            LEFT JOIN users u ON d.user_id = u.id
            LEFT JOIN cars c ON d.assigned_car_id = c.id
            ORDER BY h.created_at DESC, h.id DESC
        `);

        res.json({ success: true, helpers });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const addHelper = async (req, res) => {
    try {
        const helperName = toNullableString(req.body?.helper_name);
        const phoneNumber = toNullableString(req.body?.phone_number);
        const salaryAmount = toNonNegativeAmount(req.body?.salary_amount);

        if (!helperName) {
            return res.status(400).json({ message: 'Helper name is required' });
        }

        const [result] = await pool.execute(
            `INSERT INTO helpers
                (helper_name, phone_number, salary_amount, available_balance, next_salary_credit_date, status)
             VALUES (?, ?, ?, 0.00, DATE_ADD(CURDATE(), INTERVAL 1 MONTH), 'active')`,
            [helperName, phoneNumber, salaryAmount]
        );

        const [rows] = await pool.execute('SELECT * FROM helpers WHERE id = ? LIMIT 1', [result.insertId]);
        res.status(201).json({ success: true, helper: rows[0], message: 'Helper created successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateHelper = async (req, res) => {
    try {
        const helperId = Number(req.params.id);
        const helperName = toNullableString(req.body?.helper_name);
        const phoneNumber = toNullableString(req.body?.phone_number);
        const salaryAmount = toNonNegativeAmount(req.body?.salary_amount);
        const status = toNullableString(req.body?.status) || 'active';

        await pool.execute(
            `UPDATE helpers
             SET helper_name = COALESCE(?, helper_name),
                 phone_number = ?,
                 salary_amount = ?,
                 status = ?
             WHERE id = ?`,
            [helperName, phoneNumber, salaryAmount, status, helperId]
        );

        const connection = await pool.getConnection();
        try {
            await syncHelperSalaryForHelper(connection, helperId);
        } finally {
            connection.release();
        }

        const [rows] = await pool.execute('SELECT * FROM helpers WHERE id = ? LIMIT 1', [helperId]);
        if (!rows.length) {
            return res.status(404).json({ message: 'Helper not found' });
        }

        res.json({ success: true, helper: rows[0], message: 'Helper updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getDriverCommissionRequests = async (req, res) => {
    try {
        const { status = '', driver_id = '' } = req.query;
        const filters = [];
        const params = [];

        if (status && PAYMENT_SUBMISSION_STATUSES.has(status)) {
            filters.push('cr.status = ?');
            params.push(status);
        }

        if (driver_id) {
            filters.push('cr.driver_id = ?');
            params.push(driver_id);
        }

        const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const [requests] = await pool.execute(
            `SELECT
                    cr.id AS request_id,
                    cr.driver_id AS request_driver_id,
                    cr.trip_id AS request_trip_id,
                    cr.commission_percentage,
                    cr.net_profit AS request_net_profit,
                    cr.commission_amount,
                    cr.status AS request_status,
                    cr.reviewed_by,
                    cr.reviewed_at,
                    cr.remarks,
                    cr.created_at AS request_created_at,
                    cr.updated_at AS request_updated_at,
                    t.*,
                    d.full_name AS driver_full_name,
                    u.username AS driver_username,
                    u.phone AS driver_phone,
                    d.license_number,
                    c.car_number,
                    reviewer.username AS reviewed_by_username,
                    (COALESCE(t.end_meter_reading, 0) - COALESCE(t.start_meter_reading, 0)) AS distance_km
             FROM driver_commission_requests cr
             JOIN drivers d ON cr.driver_id = d.id
             JOIN users u ON d.user_id = u.id
             JOIN trips t ON cr.trip_id = t.id
             LEFT JOIN cars c ON t.car_id = c.id
             LEFT JOIN users reviewer ON cr.reviewed_by = reviewer.id
             ${whereClause}
             ORDER BY cr.created_at DESC, cr.id DESC`,
            params
        );

        const requestsWithExpenses = await attachExpensesToTrips(requests);
        const freightRates = await getFreightRates().catch(() => []);
        const requestsWithVariance = requestsWithExpenses.map((request) => {
            const enrichedTrip = applyTripNetIncomeFormula(withFreightVariance(request, freightRates));
            return {
                ...enrichedTrip,
                request_id: request.request_id,
                driver_id: request.request_driver_id,
                trip_id: request.request_trip_id,
                commission_percentage: Number(request.commission_percentage) || 0,
                commission_amount: Number(request.commission_amount) || 0,
                net_profit: Number(request.request_net_profit) || Number(enrichedTrip.net_income) || 0,
                status: request.request_status,
                created_at: request.request_created_at,
                updated_at: request.request_updated_at
            };
        });

        res.json({ success: true, requests: requestsWithVariance });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateDriverCommissionRequestStatus = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const requestId = Number(req.params.id);
        const status = String(req.body?.status || '').trim().toLowerCase();
        const remarks = toNullableString(req.body?.remarks);

        if (!ACCOUNT_REVIEW_STATUSES.has(status)) {
            return res.status(400).json({ message: 'Status must be approved or rejected' });
        }

        const [rows] = await connection.execute(
            'SELECT * FROM driver_commission_requests WHERE id = ? LIMIT 1',
            [requestId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: 'Commission request not found' });
        }

        const request = rows[0];
        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Only pending requests can be updated' });
        }

        if (status === 'approved') {
            await connection.execute(
                'UPDATE drivers SET commission_balance = commission_balance + ? WHERE id = ?',
                [request.commission_amount, request.driver_id]
            );
            await createDriverAccountTransaction(connection, {
                driverId: request.driver_id,
                balanceType: 'commission',
                transactionType: 'commission_credit',
                direction: 'credit',
                amount: request.commission_amount,
                sourceType: 'commission_request',
                sourceId: request.id,
                notes: `Commission approved for trip #${request.trip_id}`
            });
        }

        await connection.execute(
            `UPDATE driver_commission_requests
             SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, remarks = ?
             WHERE id = ?`,
            [status, req.user.id, remarks, requestId]
        );

        await connection.commit();
        res.json({ success: true, message: `Commission request ${status}` });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

const updateDriverCommissionRequest = async (req, res) => {
    try {
        const requestId = Number(req.params.id);
        const commissionPercentage = toNonNegativeAmount(req.body?.commission_percentage);
        const netProfit = toNonNegativeAmount(req.body?.net_profit);
        const submittedAmount = req.body?.commission_amount;
        const commissionAmount = submittedAmount === undefined || submittedAmount === null || submittedAmount === ''
            ? roundCurrency((netProfit * commissionPercentage) / 100)
            : toNonNegativeAmount(submittedAmount);
        const remarks = toNullableString(req.body?.remarks);

        const [rows] = await pool.execute(
            'SELECT id, status FROM driver_commission_requests WHERE id = ? LIMIT 1',
            [requestId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: 'Commission request not found' });
        }

        if (rows[0].status !== 'pending') {
            return res.status(400).json({ message: 'Only pending requests can be edited' });
        }

        if (!(commissionPercentage > 0)) {
            return res.status(400).json({ message: 'Commission percentage must be greater than zero' });
        }

        if (!(netProfit >= 0)) {
            return res.status(400).json({ message: 'Net profit is required' });
        }

        if (!(commissionAmount >= 0)) {
            return res.status(400).json({ message: 'Commission amount is required' });
        }

        await pool.execute(
            `UPDATE driver_commission_requests
             SET commission_percentage = ?, net_profit = ?, commission_amount = ?, remarks = ?
             WHERE id = ?`,
            [commissionPercentage, netProfit, commissionAmount, remarks, requestId]
        );

        res.json({ success: true, message: 'Commission request updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getDriverCashoutRequests = async (req, res) => {
    try {
        const { status = '', driver_id = '' } = req.query;
        const filters = [];
        const params = [];

        if (status && PAYMENT_SUBMISSION_STATUSES.has(status)) {
            filters.push('r.status = ?');
            params.push(status);
        }

        if (driver_id) {
            filters.push('r.driver_id = ?');
            params.push(driver_id);
        }

        const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const [requests] = await pool.execute(
            `SELECT r.*,
                    d.full_name AS driver_full_name,
                    u.username AS driver_username,
                    c.car_number,
                    reviewer.username AS reviewed_by_username
             FROM driver_cashout_requests r
             JOIN drivers d ON r.driver_id = d.id
             JOIN users u ON d.user_id = u.id
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             LEFT JOIN users reviewer ON r.reviewed_by = reviewer.id
             ${whereClause}
             ORDER BY r.created_at DESC, r.id DESC`,
            params
        );

        res.json({ success: true, requests });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateDriverCashoutRequestStatus = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const requestId = Number(req.params.id);
        const status = String(req.body?.status || '').trim().toLowerCase();
        const remarks = toNullableString(req.body?.remarks);

        if (!ACCOUNT_REVIEW_STATUSES.has(status)) {
            return res.status(400).json({ message: 'Status must be approved or rejected' });
        }

        const [rows] = await connection.execute(
            'SELECT * FROM driver_cashout_requests WHERE id = ? LIMIT 1',
            [requestId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: 'Driver cashout request not found' });
        }

        const request = rows[0];
        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Only pending requests can be updated' });
        }

        if (status === 'approved') {
            await syncDriverSalaryForDriver(connection, request.driver_id);
            const balanceColumn = request.balance_type === 'commission' ? 'commission_balance' : 'available_balance';
            const [balanceRows] = await connection.execute(
                `SELECT ${balanceColumn} AS balance FROM drivers WHERE id = ? LIMIT 1`,
                [request.driver_id]
            );
            const balance = Number(balanceRows[0]?.balance) || 0;

            if (balance < Number(request.amount)) {
                throw new Error('Insufficient driver balance to approve this cashout');
            }

            await connection.execute(
                `UPDATE drivers SET ${balanceColumn} = ${balanceColumn} - ? WHERE id = ?`,
                [request.amount, request.driver_id]
            );
            await createDriverAccountTransaction(connection, {
                driverId: request.driver_id,
                balanceType: request.balance_type,
                transactionType: 'cashout_debit',
                direction: 'debit',
                amount: request.amount,
                sourceType: 'driver_cashout_request',
                sourceId: request.id,
                notes: `Driver cashout approved via ${request.receive_method}`
            });
        }

        await connection.execute(
            `UPDATE driver_cashout_requests
             SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, remarks = ?
             WHERE id = ?`,
            [status, req.user.id, remarks, requestId]
        );

        await connection.commit();
        res.json({ success: true, message: `Driver cashout request ${status}` });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

const updateDriverCashoutRequest = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const requestId = Number(req.params.id);
        const balanceType = toNullableString(req.body?.balance_type);
        const receiveMethod = toNullableString(req.body?.receive_method);
        const amountValue = toNonNegativeAmount(req.body?.amount);
        const accountNumber = toNullableString(req.body?.account_number);
        const accountName = toNullableString(req.body?.account_name);
        const bankName = toNullableString(req.body?.bank_name);
        const remarks = toNullableString(req.body?.remarks);

        const [rows] = await connection.execute(
            'SELECT * FROM driver_cashout_requests WHERE id = ? LIMIT 1',
            [requestId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: 'Driver cashout request not found' });
        }

        const request = rows[0];
        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Only pending requests can be edited' });
        }

        if (!DRIVER_BALANCE_TYPES.has(balanceType)) {
            return res.status(400).json({ message: 'Invalid balance type' });
        }

        const validationError = validateReceiveMethodPayload({
            receiveMethod,
            amountValue,
            accountNumber,
            accountName,
            bankName
        });
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        await syncDriverSalaryForDriver(connection, request.driver_id);
        const balanceColumn = balanceType === 'commission' ? 'commission_balance' : 'available_balance';
        const [balanceRows] = await connection.execute(
            `SELECT ${balanceColumn} AS balance FROM drivers WHERE id = ? LIMIT 1`,
            [request.driver_id]
        );
        const balance = Number(balanceRows[0]?.balance) || 0;

        if (balance < amountValue) {
            return res.status(400).json({ message: 'Requested amount exceeds available balance' });
        }

        await connection.execute(
            `UPDATE driver_cashout_requests
             SET balance_type = ?, amount = ?, receive_method = ?, account_number = ?, account_name = ?, bank_name = ?, remarks = ?
             WHERE id = ?`,
            [
                balanceType,
                amountValue,
                receiveMethod,
                receiveMethod === 'account' ? accountNumber : null,
                receiveMethod === 'account' ? accountName : null,
                receiveMethod === 'account' ? bankName : null,
                remarks,
                requestId
            ]
        );

        res.json({ success: true, message: 'Driver cashout request updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

const getHelperCashoutRequests = async (req, res) => {
    try {
        const { status = '', helper_id = '' } = req.query;
        const filters = [];
        const params = [];

        if (status && PAYMENT_SUBMISSION_STATUSES.has(status)) {
            filters.push('r.status = ?');
            params.push(status);
        }

        if (helper_id) {
            filters.push('r.helper_id = ?');
            params.push(helper_id);
        }

        const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const [requests] = await pool.execute(
            `SELECT r.*,
                    h.helper_name,
                    d.full_name AS driver_full_name,
                    u.username AS driver_username,
                    c.car_number,
                    reviewer.username AS reviewed_by_username
             FROM helper_cashout_requests r
             JOIN helpers h ON r.helper_id = h.id
             JOIN drivers d ON r.driver_id = d.id
             JOIN users u ON d.user_id = u.id
             LEFT JOIN cars c ON r.car_id = c.id
             LEFT JOIN users reviewer ON r.reviewed_by = reviewer.id
             ${whereClause}
             ORDER BY r.created_at DESC, r.id DESC`,
            params
        );

        res.json({ success: true, requests });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateHelperCashoutRequestStatus = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const requestId = Number(req.params.id);
        const status = String(req.body?.status || '').trim().toLowerCase();
        const remarks = toNullableString(req.body?.remarks);

        if (!ACCOUNT_REVIEW_STATUSES.has(status)) {
            return res.status(400).json({ message: 'Status must be approved or rejected' });
        }

        const [rows] = await connection.execute(
            'SELECT * FROM helper_cashout_requests WHERE id = ? LIMIT 1',
            [requestId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: 'Helper cashout request not found' });
        }

        const request = rows[0];
        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Only pending requests can be updated' });
        }

        if (status === 'approved') {
            await syncHelperSalaryForHelper(connection, request.helper_id);
            const [balanceRows] = await connection.execute(
                'SELECT available_balance FROM helpers WHERE id = ? LIMIT 1',
                [request.helper_id]
            );
            const balance = Number(balanceRows[0]?.available_balance) || 0;

            if (balance < Number(request.amount)) {
                throw new Error('Insufficient helper balance to approve this cashout');
            }

            await connection.execute(
                'UPDATE helpers SET available_balance = available_balance - ? WHERE id = ?',
                [request.amount, request.helper_id]
            );
            await createHelperAccountTransaction(connection, {
                helperId: request.helper_id,
                driverId: request.driver_id,
                transactionType: 'cashout_debit',
                direction: 'debit',
                amount: request.amount,
                sourceType: 'helper_cashout_request',
                sourceId: request.id,
                notes: `Helper cashout approved via ${request.receive_method}`
            });
        }

        await connection.execute(
            `UPDATE helper_cashout_requests
             SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, remarks = ?
             WHERE id = ?`,
            [status, req.user.id, remarks, requestId]
        );

        await connection.commit();
        res.json({ success: true, message: `Helper cashout request ${status}` });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

const updateHelperCashoutRequest = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const requestId = Number(req.params.id);
        const receiveMethod = toNullableString(req.body?.receive_method);
        const amountValue = toNonNegativeAmount(req.body?.amount);
        const accountNumber = toNullableString(req.body?.account_number);
        const accountName = toNullableString(req.body?.account_name);
        const bankName = toNullableString(req.body?.bank_name);
        const remarks = toNullableString(req.body?.remarks);

        const [rows] = await connection.execute(
            'SELECT * FROM helper_cashout_requests WHERE id = ? LIMIT 1',
            [requestId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: 'Helper cashout request not found' });
        }

        const request = rows[0];
        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Only pending requests can be edited' });
        }

        const validationError = validateReceiveMethodPayload({
            receiveMethod,
            amountValue,
            accountNumber,
            accountName,
            bankName
        });
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        await syncHelperSalaryForHelper(connection, request.helper_id);
        const [balanceRows] = await connection.execute(
            'SELECT available_balance FROM helpers WHERE id = ? LIMIT 1',
            [request.helper_id]
        );
        const balance = Number(balanceRows[0]?.available_balance) || 0;

        if (balance < amountValue) {
            return res.status(400).json({ message: 'Requested amount exceeds helper available balance' });
        }

        await connection.execute(
            `UPDATE helper_cashout_requests
             SET amount = ?, receive_method = ?, account_number = ?, account_name = ?, bank_name = ?, remarks = ?
             WHERE id = ?`,
            [
                amountValue,
                receiveMethod,
                receiveMethod === 'account' ? accountNumber : null,
                receiveMethod === 'account' ? accountName : null,
                receiveMethod === 'account' ? bankName : null,
                remarks,
                requestId
            ]
        );

        res.json({ success: true, message: 'Helper cashout request updated successfully' });
    } catch (error) {
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
        const cashoutConditions = ['status = \'approved\''];
        const cashoutParams = [id];

        if (from_date) {
            cashoutConditions.push('reviewed_at >= ?');
            cashoutParams.push(`${from_date} 00:00:00`);
        }

        if (to_date) {
            cashoutConditions.push('reviewed_at <= ?');
            cashoutParams.push(`${to_date} 23:59:59`);
        }

        if (!from_date && !to_date) {
            if (period === 'today') {
                cashoutConditions.push('DATE(reviewed_at) = CURDATE()');
            } else if (period === 'week') {
                cashoutConditions.push('reviewed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
            } else if (period === 'month') {
                cashoutConditions.push('reviewed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
            } else if (period === 'year') {
                cashoutConditions.push('reviewed_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)');
            }
        }

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
        const freightRates = await getFreightRates().catch(() => []);
        const tripsWithVariance = tripsWithExpenses
            .map((trip) => withFreightVariance(trip, freightRates))
            .map(applyTripNetIncomeFormula);
        const currentTripWithExpenses = currentTrip[0]
            ? (await attachExpensesToTrips([{
                ...currentTrip[0],
                total_expenses: currentTrip[0].current_expenses || 0
            }]))[0]
            : null;
        const currentTripWithVariance = currentTripWithExpenses
            ? applyTripNetIncomeFormula(withFreightVariance(currentTripWithExpenses, freightRates))
            : null;

        const stats = [tripsWithVariance.reduce((acc, trip) => {
            const distance = Number(trip.end_meter_reading - trip.start_meter_reading) || 0;
            acc.total_trips += 1;
            acc.ongoing_trips += trip.status === 'ongoing' ? 1 : 0;
            acc.completed_trips += trip.status === 'completed' ? 1 : 0;
            acc.total_revenue += Number(trip.freight_charge) || 0;
            acc.total_expenses += Number(trip.total_expenses) || 0;
            acc.total_distance += distance;
            acc.total_diesel_liters += Number(trip.total_diesel_liters) || 0;
            return acc;
        }, {
            total_trips: 0,
            ongoing_trips: 0,
            completed_trips: 0,
            total_revenue: 0,
            total_expenses: 0,
            total_distance: 0,
            total_diesel_liters: 0,
            net_profit: 0
        })];
        stats[0].net_profit = stats[0].total_revenue - stats[0].total_expenses;
        stats[0].total_food_expenses = tripsWithVariance.reduce((sum, trip) => (
            sum + (trip.expenses || [])
                .filter((expense) => expense.category === 'food')
                .reduce((expenseSum, expense) => expenseSum + (Number(expense.amount) || 0), 0)
        ), 0) + tripsWithVariance.reduce((sum, trip) => (
            sum + (trip.daily_expenses || [])
                .filter((expense) => expense.category === 'food')
                .reduce((expenseSum, expense) => expenseSum + (Number(expense.amount) || 0), 0)
        ), 0);
        stats[0].total_freight_taken = stats[0].total_revenue;
        stats[0].total_bilty_commission = tripsWithVariance.reduce(
            (sum, trip) => sum + (Number(trip.bilty_commission_amount) || 0),
            0
        );
        const [[cashoutSummary]] = await pool.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total_taken
             FROM driver_cashout_requests
             WHERE driver_id = ? AND ${cashoutConditions.join(' AND ')}`,
            cashoutParams
        );
        stats[0].total_challan_amount = tripsWithVariance.reduce((sum, trip) => (
            sum + (trip.expenses || [])
                .filter((expense) => expense.category === 'chalaan')
                .reduce((expenseSum, expense) => expenseSum + (Number(expense.amount) || 0), 0)
        ), 0);
        stats[0].challan_count = tripsWithVariance.reduce((sum, trip) => (
            sum + (trip.expenses || []).filter((expense) => expense.category === 'chalaan').length
        ), 0);
        stats[0].total_taken = Number(cashoutSummary?.total_taken) || 0;

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
            currentTrip: currentTripWithVariance,
            trips: tripsWithVariance,
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
                de.meter_reading,
                de.note,
                de.expense_image,
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

const getDriverPaymentSubmissions = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverPaymentSubmissionsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const { driver_id, month, from_date, to_date, status } = req.query;
        const filters = [];
        const params = [];
        const summaryFilters = [];
        const summaryParams = [];
        const paymentTimeFilter = getTimestampFilter(
            { month, fromDate: from_date, toDate: to_date },
            'ps.submitted_at'
        );
        const tripTimeFilter = getTimestampFilter(
            { month, fromDate: from_date, toDate: to_date },
            't.started_at'
        );
        const tripExpenseTimeFilter = getTimestampFilter(
            { month, fromDate: from_date, toDate: to_date },
            'e.created_at'
        );
        const dailyExpenseTimeFilter = getTimestampFilter(
            { month, fromDate: from_date, toDate: to_date },
            'de.expense_date'
        );

        if (driver_id) {
            filters.push('ps.driver_id = ?');
            params.push(driver_id);
            summaryFilters.push('ps.driver_id = ?');
            summaryParams.push(driver_id);
        }

        if (status && PAYMENT_SUBMISSION_STATUSES.has(status)) {
            filters.push('ps.status = ?');
            params.push(status);
        }

        if (paymentTimeFilter.clause) {
            filters.push(paymentTimeFilter.clause.replace(/^AND /, ''));
            params.push(...paymentTimeFilter.params);
            summaryFilters.push(paymentTimeFilter.clause.replace(/^AND /, ''));
            summaryParams.push(...paymentTimeFilter.params);
        }

        const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const summaryWhereClause = summaryFilters.length ? `WHERE ${summaryFilters.join(' AND ')}` : '';
        const tripFilters = [];
        const tripParams = [];
        const tripExpenseFilters = [];
        const tripExpenseParams = [];
        const dailyExpenseFilters = [];
        const dailyExpenseParams = [];

        if (driver_id) {
            tripFilters.push('t.driver_id = ?');
            tripParams.push(driver_id);
            tripExpenseFilters.push('t.driver_id = ?');
            tripExpenseParams.push(driver_id);
            dailyExpenseFilters.push('de.driver_id = ?');
            dailyExpenseParams.push(driver_id);
        }

        if (tripTimeFilter.clause) {
            tripFilters.push(tripTimeFilter.clause.replace(/^AND /, ''));
            tripParams.push(...tripTimeFilter.params);
        }

        if (tripExpenseTimeFilter.clause) {
            tripExpenseFilters.push(tripExpenseTimeFilter.clause.replace(/^AND /, ''));
            tripExpenseParams.push(...tripExpenseTimeFilter.params);
        }

        if (dailyExpenseTimeFilter.clause) {
            dailyExpenseFilters.push(dailyExpenseTimeFilter.clause.replace(/^AND /, ''));
            dailyExpenseParams.push(...dailyExpenseTimeFilter.params);
        }

        const tripWhereClause = tripFilters.length ? `WHERE ${tripFilters.join(' AND ')}` : '';
        const tripExpenseWhereClause = tripExpenseFilters.length ? `WHERE ${tripExpenseFilters.join(' AND ')}` : '';
        const dailyExpenseWhereClause = dailyExpenseFilters.length ? `WHERE ${dailyExpenseFilters.join(' AND ')}` : '';

        const [payments] = await pool.execute(
            `SELECT
                ps.id,
                ps.driver_id,
                ps.payment_method,
                ps.amount,
                ps.sending_fee,
                ps.handover_to,
                ps.screenshot_image,
                ps.status,
                ps.submitted_at,
                ps.status_updated_at,
                u.username AS driver_name,
                u.phone AS driver_phone,
                c.car_number
             FROM driver_payment_submissions ps
             JOIN drivers d ON ps.driver_id = d.id
             JOIN users u ON d.user_id = u.id
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             ${whereClause}
             ORDER BY ps.submitted_at DESC, ps.id DESC`,
            params
        );

        const [driverTotals] = await pool.execute(
            `SELECT
                ps.driver_id,
                u.username AS driver_name,
                u.phone AS driver_phone,
                c.car_number,
                COUNT(*) AS total_submissions,
                COALESCE(SUM(ps.amount), 0) AS total_amount,
                COALESCE(SUM(CASE WHEN ps.status = 'approved' THEN ps.amount ELSE 0 END), 0) AS total_received
             FROM driver_payment_submissions ps
             JOIN drivers d ON ps.driver_id = d.id
             JOIN users u ON d.user_id = u.id
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             ${whereClause}
             GROUP BY ps.driver_id, u.username, u.phone, c.car_number
             ORDER BY total_amount DESC, u.username ASC`,
            params
        );

        const [[summary]] = await pool.execute(
            `SELECT
                COUNT(*) AS total_submissions,
                COUNT(DISTINCT ps.driver_id) AS total_drivers,
                COALESCE(SUM(ps.amount), 0) AS total_amount,
                COALESCE(SUM(CASE WHEN ps.status = 'approved' THEN ps.amount ELSE 0 END), 0) AS total_amount_received,
                COALESCE(SUM(CASE WHEN ps.status = 'pending' THEN ps.amount ELSE 0 END), 0) AS total_pending_amount,
                COALESCE(SUM(CASE WHEN ps.status = 'rejected' THEN ps.amount ELSE 0 END), 0) AS total_rejected_amount
             FROM driver_payment_submissions ps
             ${summaryWhereClause}`,
            summaryParams
        );

        const [[incomeSummary]] = await pool.execute(
            `SELECT
                COALESCE(SUM(t.freight_charge), 0) AS total_cargo_income
             FROM trips t
             ${tripWhereClause}`,
            tripParams
        );

        const [[tripExpenseSummary]] = await pool.execute(
            `SELECT
                COALESCE(SUM(e.amount), 0) AS total_trip_expenses
             FROM expenses e
             JOIN trips t ON e.trip_id = t.id
             ${tripExpenseWhereClause}`,
            tripExpenseParams
        );

        const [[dailyExpenseSummary]] = await pool.execute(
            `SELECT
                COALESCE(SUM(de.amount), 0) AS total_daily_expenses
             FROM driver_daily_expense_entries de
             ${dailyExpenseWhereClause}`,
            dailyExpenseParams
        );

        const totalCargoIncome = Number(incomeSummary?.total_cargo_income) || 0;
        const totalTripExpenses = Number(tripExpenseSummary?.total_trip_expenses) || 0;
        const totalDailyExpenses = Number(dailyExpenseSummary?.total_daily_expenses) || 0;

        res.json({
            success: true,
            payments,
            driverTotals,
            summary: {
                ...summary,
                total_cargo_income: totalCargoIncome,
                total_trip_expenses: totalTripExpenses,
                total_daily_expenses: totalDailyExpenses,
                net_profit: totalCargoIncome - totalTripExpenses - totalDailyExpenses
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateDriverPaymentSubmissionStatus = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverPaymentSubmissionsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const { id } = req.params;
        const nextStatus = String(req.body?.status || '').trim().toLowerCase();

        if (!PAYMENT_SUBMISSION_STATUSES.has(nextStatus) || nextStatus === 'pending') {
            return res.status(400).json({ message: 'Status must be approved or rejected' });
        }

        const [existingRows] = await pool.execute(
            'SELECT id, status FROM driver_payment_submissions WHERE id = ? LIMIT 1',
            [id]
        );

        if (!existingRows.length) {
            return res.status(404).json({ message: 'Payment submission not found' });
        }

        await pool.execute(
            `UPDATE driver_payment_submissions
             SET status = ?, status_updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [nextStatus, id]
        );

        const [[payment]] = await pool.execute(
            `SELECT
                ps.id,
                ps.driver_id,
                ps.payment_method,
                ps.amount,
                ps.sending_fee,
                ps.handover_to,
                ps.screenshot_image,
                ps.status,
                ps.submitted_at,
                ps.status_updated_at,
                u.username AS driver_name,
                c.car_number
             FROM driver_payment_submissions ps
             JOIN drivers d ON ps.driver_id = d.id
             JOIN users u ON d.user_id = u.id
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             WHERE ps.id = ?
             LIMIT 1`,
            [id]
        );

        res.json({
            success: true,
            message: `Payment submission ${nextStatus} successfully`,
            payment
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateDriverPaymentSubmission = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverPaymentSubmissionsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const paymentId = Number(req.params.id);
        const paymentMethod = toNullableString(req.body?.payment_method);
        const amountValue = toNonNegativeAmount(req.body?.amount);
        const sendingFee = toNonNegativeAmount(req.body?.sending_fee);
        const handoverTo = toNullableString(req.body?.handover_to);

        if (!PAYMENT_METHODS.has(paymentMethod)) {
            return res.status(400).json({ message: 'Valid payment method is required' });
        }

        if (!(amountValue > 0)) {
            return res.status(400).json({ message: 'Amount must be greater than zero' });
        }

        const [rows] = await pool.execute(
            'SELECT id, status FROM driver_payment_submissions WHERE id = ? LIMIT 1',
            [paymentId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: 'Payment submission not found' });
        }

        if (rows[0].status !== 'pending') {
            return res.status(400).json({ message: 'Only pending payment submissions can be edited' });
        }

        await pool.execute(
            `UPDATE driver_payment_submissions
             SET payment_method = ?, amount = ?, sending_fee = ?, handover_to = ?
             WHERE id = ?`,
            [paymentMethod, amountValue, paymentMethod === 'cash' ? 0 : sendingFee, paymentMethod === 'cash' ? handoverTo : null, paymentId]
        );

        res.json({ success: true, message: 'Payment submission updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateTripCorrection = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const tripId = Number(req.params.id);
        const [rows] = await connection.execute(
            'SELECT * FROM trips WHERE id = ? LIMIT 1',
            [tripId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: 'Trip not found' });
        }

        const trip = rows[0];
        const startMeterReading = toOptionalDecimal(req.body?.start_meter_reading);
        const endMeterReading = req.body?.end_meter_reading === '' ? null : toOptionalDecimal(req.body?.end_meter_reading);
        const freightCharge = toNonNegativeAmount(req.body?.freight_charge);
        const fromLocation = toNullableString(req.body?.from_location);
        const toLocation = toNullableString(req.body?.to_location);
        const notes = toNullableString(req.body?.notes);

        if (startMeterReading === null) {
            return res.status(400).json({ message: 'Start meter reading is required' });
        }

        if (!fromLocation || !toLocation) {
            return res.status(400).json({ message: 'From and to locations are required' });
        }

        if (!(freightCharge >= 0)) {
            return res.status(400).json({ message: 'Freight charge is required' });
        }

        if (trip.status === 'completed' && endMeterReading === null) {
            return res.status(400).json({ message: 'End meter reading is required for completed trips' });
        }

        if (endMeterReading !== null && endMeterReading < startMeterReading) {
            return res.status(400).json({ message: 'End meter reading cannot be less than start meter reading' });
        }

        await connection.execute(
            `UPDATE trips
             SET start_meter_reading = ?, end_meter_reading = ?, freight_charge = ?, from_location = ?, to_location = ?, notes = ?
             WHERE id = ?`,
            [startMeterReading, endMeterReading, freightCharge, fromLocation, toLocation, notes, tripId]
        );

        await syncCarCurrentMeterFromTrips(connection, trip.car_id);
        const updatedTrip = await fetchTripWithExpensesById(tripId);

        res.json({
            success: true,
            message: 'Trip updated successfully',
            trip: updatedTrip
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

const addTripExpenseByAdmin = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        const category = toNullableString(req.body?.category);
        const amountValue = toNonNegativeAmount(req.body?.amount);
        const litersValue = toOptionalDecimal(req.body?.liters);
        const locationValue = toNullableString(req.body?.location);
        const notesValue = toNullableString(req.body?.notes);

        const [tripRows] = await pool.execute('SELECT id FROM trips WHERE id = ? LIMIT 1', [tripId]);
        if (!tripRows.length) {
            return res.status(404).json({ message: 'Trip not found' });
        }

        if (!TRIP_EXPENSE_CATEGORIES.has(category)) {
            return res.status(400).json({ message: 'Invalid expense category' });
        }

        if (!(amountValue > 0)) {
            return res.status(400).json({ message: 'Expense amount must be greater than zero' });
        }

        if (category === 'diesel' && litersValue === null) {
            return res.status(400).json({ message: 'Liters are required for diesel expense' });
        }

        const [result] = await pool.execute(
            `INSERT INTO expenses (trip_id, category, amount, liters, location, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [tripId, category, amountValue, litersValue, locationValue, notesValue]
        );

        const [[expense]] = await pool.execute(
            `SELECT id, trip_id, category, amount, liters, location, receipt_image, notes, created_at
             FROM expenses
             WHERE id = ? LIMIT 1`,
            [result.insertId]
        );

        res.json({
            success: true,
            message: 'Trip expense added successfully',
            expense: {
                ...expense,
                amount: Number(expense.amount) || 0
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateTripExpenseByAdmin = async (req, res) => {
    try {
        const expenseId = Number(req.params.id);
        const category = toNullableString(req.body?.category);
        const amountValue = toNonNegativeAmount(req.body?.amount);
        const litersValue = req.body?.liters === '' ? null : toOptionalDecimal(req.body?.liters);
        const locationValue = toNullableString(req.body?.location);
        const notesValue = toNullableString(req.body?.notes);

        const [rows] = await pool.execute('SELECT id FROM expenses WHERE id = ? LIMIT 1', [expenseId]);
        if (!rows.length) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        if (!TRIP_EXPENSE_CATEGORIES.has(category)) {
            return res.status(400).json({ message: 'Invalid expense category' });
        }

        if (!(amountValue > 0)) {
            return res.status(400).json({ message: 'Expense amount must be greater than zero' });
        }

        if (category === 'diesel' && litersValue === null) {
            return res.status(400).json({ message: 'Liters are required for diesel expense' });
        }

        await pool.execute(
            `UPDATE expenses
             SET category = ?, amount = ?, liters = ?, location = ?, notes = ?
             WHERE id = ?`,
            [category, amountValue, category === 'diesel' ? litersValue : null, locationValue, notesValue, expenseId]
        );

        const [[expense]] = await pool.execute(
            `SELECT id, trip_id, category, amount, liters, location, receipt_image, notes, created_at
             FROM expenses
             WHERE id = ? LIMIT 1`,
            [expenseId]
        );

        res.json({
            success: true,
            message: 'Trip expense updated successfully',
            expense: {
                ...expense,
                amount: Number(expense.amount) || 0
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const addDriverDailyExpenseByAdmin = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverDailyExpenseEntriesTable(schemaConnection);
            const [[databaseRow]] = await schemaConnection.query('SELECT DATABASE() AS database_name');
            await ensureDriverDailyExpenseEntryColumns(schemaConnection, databaseRow?.database_name);
        } finally {
            schemaConnection.release();
        }

        const driverId = Number(req.body?.driver_id);
        const category = toNullableString(req.body?.category);
        const amountValue = toNonNegativeAmount(req.body?.amount);
        const meterReadingValue = req.body?.meter_reading === '' ? null : toOptionalDecimal(req.body?.meter_reading);
        const noteValue = toNullableString(req.body?.note);
        const expenseDate = toNullableString(req.body?.expense_date);

        if (!driverId) {
            return res.status(400).json({ message: 'Driver is required' });
        }

        if (!DAILY_EXPENSE_CATEGORIES.has(category)) {
            return res.status(400).json({ message: 'Invalid daily expense category' });
        }

        if (!(amountValue > 0)) {
            return res.status(400).json({ message: 'Expense amount must be greater than zero' });
        }

        if (category === 'moboil_change' && meterReadingValue === null) {
            return res.status(400).json({ message: 'Meter reading is required for moboil change' });
        }

        const [driverRows] = await pool.execute('SELECT id FROM drivers WHERE id = ? LIMIT 1', [driverId]);
        if (!driverRows.length) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        const [result] = await pool.execute(
            `INSERT INTO driver_daily_expense_entries
             (driver_id, category, amount, meter_reading, note, expense_date)
             VALUES (?, ?, ?, ?, ?, COALESCE(?, CURDATE()))`,
            [driverId, category, amountValue, meterReadingValue, noteValue, expenseDate]
        );

        res.json({
            success: true,
            message: 'Driver daily expense added successfully',
            id: result.insertId
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateDriverDailyExpenseByAdmin = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverDailyExpenseEntriesTable(schemaConnection);
            const [[databaseRow]] = await schemaConnection.query('SELECT DATABASE() AS database_name');
            await ensureDriverDailyExpenseEntryColumns(schemaConnection, databaseRow?.database_name);
        } finally {
            schemaConnection.release();
        }

        const entryId = Number(req.params.id);
        const category = toNullableString(req.body?.category);
        const amountValue = toNonNegativeAmount(req.body?.amount);
        const meterReadingValue = req.body?.meter_reading === '' ? null : toOptionalDecimal(req.body?.meter_reading);
        const noteValue = toNullableString(req.body?.note);
        const expenseDate = toNullableString(req.body?.expense_date);

        const [rows] = await pool.execute(
            'SELECT id FROM driver_daily_expense_entries WHERE id = ? LIMIT 1',
            [entryId]
        );
        if (!rows.length) {
            return res.status(404).json({ message: 'Driver daily expense not found' });
        }

        if (!DAILY_EXPENSE_CATEGORIES.has(category)) {
            return res.status(400).json({ message: 'Invalid daily expense category' });
        }

        if (!(amountValue > 0)) {
            return res.status(400).json({ message: 'Expense amount must be greater than zero' });
        }

        if (category === 'moboil_change' && meterReadingValue === null) {
            return res.status(400).json({ message: 'Meter reading is required for moboil change' });
        }

        await pool.execute(
            `UPDATE driver_daily_expense_entries
             SET category = ?, amount = ?, meter_reading = ?, note = ?, expense_date = COALESCE(?, expense_date)
             WHERE id = ?`,
            [category, amountValue, meterReadingValue, noteValue, expenseDate, entryId]
        );

        res.json({ success: true, message: 'Driver daily expense updated successfully' });
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
    const driverIds = [...new Set(
        trips
            .map((trip) => Number(trip.driver_id))
            .filter(Number.isFinite)
    )];

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

    const tripsWithExpenses = trips.map((trip) => {
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

    if (!driverIds.length) {
        return tripsWithExpenses;
    }

    const driverPlaceholders = driverIds.map(() => '?').join(', ');
    const [timelineTrips, dailyExpenseRows] = await Promise.all([
        pool.execute(
            `SELECT id, driver_id, status, started_at, ended_at
             FROM trips
             WHERE driver_id IN (${driverPlaceholders})
             ORDER BY driver_id ASC, started_at ASC, id ASC`,
            driverIds
        ),
        pool.execute(
            `SELECT id, driver_id, category, amount, meter_reading, note, expense_image, expense_date, created_at
             FROM driver_daily_expense_entries
             WHERE driver_id IN (${driverPlaceholders})
             ORDER BY driver_id ASC, created_at ASC, id ASC`,
            driverIds
        )
    ]);

    return attachBetweenTripDailyExpenses(tripsWithExpenses, timelineTrips[0], dailyExpenseRows[0]);
};

const getDashboardStats = async (req, res) => {
    try {
        const [[overall]] = await pool.execute(`
            SELECT
                (SELECT COUNT(*) FROM cars WHERE status = 'active') as active_cars,
                (SELECT COUNT(*) FROM drivers d JOIN users u ON d.user_id = u.id WHERE u.status = 'active') as active_drivers,
                (SELECT COUNT(*) FROM helpers WHERE status = 'active') as active_helpers,
                (SELECT COUNT(*) FROM trips WHERE status = 'ongoing') as ongoing_trips,
                (SELECT COUNT(*) FROM trips WHERE DATE(started_at) = CURDATE()) as today_trips
        `);

        const monthlyCompletedTripsQuery = `
            SELECT
                t.id,
                t.car_id,
                t.driver_id,
                t.started_at,
                t.freight_charge,
                t.bilty_commission_amount,
                COALESCE(SUM(e.amount), 0) AS total_expenses
            FROM trips t
            LEFT JOIN expenses e ON t.id = e.trip_id
            WHERE t.status = 'completed'
              AND DATE_FORMAT(t.started_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
            GROUP BY t.id, t.car_id, t.driver_id, t.started_at, t.freight_charge, t.bilty_commission_amount
        `;

        const [[today]] = await pool.execute(`
            SELECT
                COALESCE(SUM(trip_summary.freight_charge), 0) as today_revenue,
                COALESCE(SUM(trip_summary.total_expenses + COALESCE(trip_summary.bilty_commission_amount, 0)), 0) as today_expenses
            FROM (
                SELECT
                    t.id,
                    t.started_at,
                    t.freight_charge,
                    t.bilty_commission_amount,
                    COALESCE(SUM(e.amount), 0) AS total_expenses
                FROM trips t
                LEFT JOIN expenses e ON t.id = e.trip_id
                WHERE t.status = 'completed'
                GROUP BY t.id, t.started_at, t.freight_charge, t.bilty_commission_amount
            ) trip_summary
            WHERE DATE(trip_summary.started_at) = CURDATE()
        `);

        const [monthlyTripsRaw] = await pool.execute(monthlyCompletedTripsQuery);
        const monthlyTrips = applyTripNetIncomeFormula ? monthlyTripsRaw.map(applyTripNetIncomeFormula) : monthlyTripsRaw;

        const [[monthlyDailyExpenseRow]] = await pool.execute(`
            SELECT COALESCE(SUM(amount), 0) AS total_daily_expenses
            FROM driver_daily_expense_entries
            WHERE DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        `);

        const [[monthlyApprovedCashoutRow]] = await pool.execute(`
            SELECT COALESCE(SUM(amount), 0) AS total_approved_cashouts
            FROM driver_cashout_requests
            WHERE status = 'approved'
              AND reviewed_at IS NOT NULL
              AND DATE_FORMAT(reviewed_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        `);

        const [monthlyExpenseBreakdownRows] = await pool.execute(`
            SELECT category, COALESCE(SUM(amount), 0) AS total_amount
            FROM expenses
            WHERE DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
            GROUP BY category
            ORDER BY FIELD(category, 'diesel', 'toll', 'food', 'police', 'chalaan', 'mandi_kaat', 'reward', 'tyre_puncture', 'bilty_commission'), category
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

        const [carPerformance] = await pool.execute(`
            SELECT 
                c.car_number,
                COUNT(trip_summary.id) as trip_count,
                COALESCE(SUM(trip_summary.freight_charge), 0) as revenue,
                COALESCE(SUM(trip_summary.total_expenses + COALESCE(trip_summary.bilty_commission_amount, 0)), 0) as expenses
            FROM cars c
            LEFT JOIN (${monthlyCompletedTripsQuery}) trip_summary ON c.id = trip_summary.car_id
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
                COALESCE(SUM(trip_summary.total_expenses + COALESCE(trip_summary.bilty_commission_amount, 0)), 0) as expenses
            FROM (
                SELECT
                    t.id,
                    t.started_at,
                    t.freight_charge,
                    t.bilty_commission_amount,
                    COALESCE(SUM(e.amount), 0) AS total_expenses
                FROM trips t
                LEFT JOIN expenses e ON t.id = e.trip_id
                WHERE t.status = 'completed'
                GROUP BY t.id, t.started_at, t.freight_charge, t.bilty_commission_amount
            ) trip_summary
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

        const monthlyFreight = monthlyTrips.reduce((sum, trip) => sum + (Number(trip.freight_charge) || 0), 0);
        const monthlyTripExpenses = monthlyTrips.reduce((sum, trip) => sum + (Number(trip.trip_expenses_total) || 0), 0);
        const monthlyBiltyCommission = monthlyTrips.reduce((sum, trip) => sum + (Number(trip.bilty_commission_amount) || 0), 0);
        const monthlyDailyExpenses = Number(monthlyDailyExpenseRow?.total_daily_expenses) || 0;
        const monthlyApprovedCashouts = Number(monthlyApprovedCashoutRow?.total_approved_cashouts) || 0;
        const monthlyExpenses = monthlyTripExpenses + monthlyDailyExpenses + monthlyBiltyCommission;
        const monthlyNetIncome = monthlyFreight - monthlyExpenses - monthlyApprovedCashouts;

        res.json({
            success: true,
            stats: {
                ...overall,
                ...today,
                monthly_freight: monthlyFreight,
                monthly_expenses: monthlyExpenses,
                monthly_net_income: monthlyNetIncome,
                net_today: today.today_revenue - today.today_expenses
            },
            recentTrips,
            carPerformance,
            revenueChart,
            expenseBreakdown: monthlyExpenseBreakdownRows.map((row) => ({
                name: String(row.category || '')
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (char) => char.toUpperCase()),
                value: Number(row.total_amount) || 0
            }))
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

        const loadTripsForRange = async ({ start, end }) => {
            const [trips] = await pool.execute(`
                SELECT
                    t.id,
                    t.driver_id,
                    t.from_location as source,
                    t.to_location as destination,
                    t.started_at,
                    t.ended_at as completed_at,
                    t.ended_at,
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
                GROUP BY
                    t.id, t.driver_id, t.from_location, t.to_location, t.started_at,
                    t.ended_at, t.freight_charge, u.username, c.car_number
                ORDER BY t.started_at DESC
            `, [start, end]);

            return attachExpensesToTrips(trips);
        };

        const currentTrips = await loadTripsForRange(currentRange);
        const previousTrips = await loadTripsForRange(previousRange);

        const summarizeTrips = (trips) => trips.reduce((acc, trip) => {
            acc.totalRevenue += Number(trip.freight_charge) || 0;
            acc.totalExpenses += Number(trip.total_expenses) || 0;
            acc.totalTrips += 1;
            return acc;
        }, {
            totalRevenue: 0,
            totalExpenses: 0,
            totalTrips: 0
        });

        const summary = summarizeTrips(currentTrips);
        const previousSummary = summarizeTrips(previousTrips);
        const totalRevenue = summary.totalRevenue;
        const totalExpenses = summary.totalExpenses;
        const totalTrips = summary.totalTrips;
        const netProfit = totalRevenue - totalExpenses;
        const previousNetProfit = previousSummary.totalRevenue - previousSummary.totalExpenses;

        const trendAccumulator = new Map();
        for (const trip of currentTrips) {
            const tripDate = new Date(trip.started_at);
            const bucketKey = bucket === 'month'
                ? `${tripDate.getFullYear()}-${String(tripDate.getMonth() + 1).padStart(2, '0')}`
                : tripDate.toISOString().slice(0, 10);

            if (!trendAccumulator.has(bucketKey)) {
                trendAccumulator.set(bucketKey, {
                    bucket_key: bucketKey,
                    label: formatBucketLabel(tripDate, bucket),
                    trips: 0,
                    revenue: 0,
                    expenses: 0
                });
            }

            const entry = trendAccumulator.get(bucketKey);
            entry.trips += 1;
            entry.revenue += Number(trip.freight_charge) || 0;
            entry.expenses += Number(trip.total_expenses) || 0;
        }

        const trendRows = Array.from(trendAccumulator.values()).sort((left, right) =>
            String(left.bucket_key).localeCompare(String(right.bucket_key))
        );

        const expenseBreakdownMap = new Map();
        for (const trip of currentTrips) {
            for (const expense of trip.expenses || []) {
                const key = expense.category || 'other';
                expenseBreakdownMap.set(key, (expenseBreakdownMap.get(key) || 0) + (Number(expense.amount) || 0));
            }
            for (const expense of trip.daily_expenses || []) {
                const key = expense.category || 'other';
                expenseBreakdownMap.set(key, (expenseBreakdownMap.get(key) || 0) + (Number(expense.amount) || 0));
            }
        }

        const expenseBreakdown = Array.from(expenseBreakdownMap.entries())
            .map(([category, amount]) => ({ category, amount }))
            .sort((left, right) => right.amount - left.amount);
        const totalExpenseAmount = expenseBreakdown.reduce((sum, item) => sum + item.amount, 0);
        const formattedExpenseBreakdown = expenseBreakdown.map((item) => ({
            category: item.category,
            amount: Number(item.amount) || 0,
            percentage: totalExpenseAmount
                ? Number((((Number(item.amount) || 0) / totalExpenseAmount) * 100).toFixed(1))
                : 0
        }));

        const recentTrips = currentTrips
            .slice()
            .sort((left, right) => new Date(right.started_at) - new Date(left.started_at))
            .slice(0, 10);

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
                revenueChange: calculateChange(totalRevenue, previousSummary.totalRevenue),
                expensesChange: calculateChange(totalExpenses, previousSummary.totalExpenses),
                netProfitChange: calculateChange(netProfit, previousNetProfit),
                tripsChange: calculateChange(totalTrips, previousSummary.totalTrips)
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
                net_profit: Number(trip.net_profit) || ((Number(trip.freight_charge) || 0) - (Number(trip.total_expenses) || 0))
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getFreightRateCards = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureFreightRateCardsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const rates = await getFreightRates();
        res.json({ rates });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const addFreightRateCard = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureFreightRateCardsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const weightTon = parsePositiveNumber(req.body?.weight_ton);
        const ratePerKm = parsePositiveNumber(req.body?.rate_per_km);
        const notes = toNullableString(req.body?.notes);

        if (!weightTon || !ratePerKm) {
            return res.status(400).json({ message: 'Weight ton and rate per km must be greater than zero' });
        }

        const [existingRows] = await pool.execute(
            'SELECT id FROM freight_rate_cards WHERE ABS(weight_ton - ?) < 0.0001 LIMIT 1',
            [weightTon]
        );

        if (existingRows.length) {
            return res.status(409).json({ message: 'A freight rate for this weight already exists' });
        }

        const [result] = await pool.execute(
            'INSERT INTO freight_rate_cards (weight_ton, rate_per_km, notes) VALUES (?, ?, ?)',
            [roundTo(weightTon), roundTo(ratePerKm), notes]
        );

        const [rows] = await pool.execute(
            `SELECT id, weight_ton, rate_per_km, notes, created_at, updated_at
             FROM freight_rate_cards
             WHERE id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            message: 'Freight rate added successfully',
            rate: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateFreightRateCard = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureFreightRateCardsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const { id } = req.params;
        const weightTon = parsePositiveNumber(req.body?.weight_ton);
        const ratePerKm = parsePositiveNumber(req.body?.rate_per_km);
        const notes = toNullableString(req.body?.notes);

        if (!weightTon || !ratePerKm) {
            return res.status(400).json({ message: 'Weight ton and rate per km must be greater than zero' });
        }

        const [existingRows] = await pool.execute(
            'SELECT id FROM freight_rate_cards WHERE id = ? LIMIT 1',
            [id]
        );

        if (!existingRows.length) {
            return res.status(404).json({ message: 'Freight rate not found' });
        }

        const [duplicateRows] = await pool.execute(
            'SELECT id FROM freight_rate_cards WHERE ABS(weight_ton - ?) < 0.0001 AND id != ? LIMIT 1',
            [weightTon, id]
        );

        if (duplicateRows.length) {
            return res.status(409).json({ message: 'Another freight rate already uses this weight' });
        }

        await pool.execute(
            `UPDATE freight_rate_cards
             SET weight_ton = ?, rate_per_km = ?, notes = ?
             WHERE id = ?`,
            [roundTo(weightTon), roundTo(ratePerKm), notes, id]
        );

        const [rows] = await pool.execute(
            `SELECT id, weight_ton, rate_per_km, notes, created_at, updated_at
             FROM freight_rate_cards
             WHERE id = ?`,
            [id]
        );

        res.json({
            message: 'Freight rate updated successfully',
            rate: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const deleteFreightRateCard = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureFreightRateCardsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const { id } = req.params;
        const [existingRows] = await pool.execute(
            'SELECT id FROM freight_rate_cards WHERE id = ? LIMIT 1',
            [id]
        );

        if (!existingRows.length) {
            return res.status(404).json({ message: 'Freight rate not found' });
        }

        await pool.execute('DELETE FROM freight_rate_cards WHERE id = ?', [id]);
        res.json({ message: 'Freight rate deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const calculateFreightRateEstimate = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureFreightRateCardsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const estimate = await calculateFreightEstimate({
            weightTon: req.body?.weight_ton ?? req.query?.weight_ton,
            distanceKm: req.body?.distance_km ?? req.query?.distance_km
        });

        res.json({ estimate });
    } catch (error) {
        const statusCode = error.message === 'No freight rates saved yet' || error.message === 'Weight and distance must be greater than zero'
            ? 400
            : 500;
        res.status(statusCode).json({ message: error.message || 'Server error' });
    }
};

module.exports = {
    // Cars
    getAllCars,
    addCar,
    updateCar,
    deleteCar,
    getCarHistory,
    getTripReport,
    
    // Drivers
    getAllDrivers,
    addDriver,
    assignCarToDriver,
    updateDriver,
    getHelpers,
    addHelper,
    updateHelper,
    getDriverReport,
    getDriversExpenseReport,
    getDriverCommissionRequests,
    updateDriverCommissionRequest,
    updateDriverCommissionRequestStatus,
    getDriverCashoutRequests,
    updateDriverCashoutRequest,
    updateDriverCashoutRequestStatus,
    getHelperCashoutRequests,
    updateHelperCashoutRequest,
    updateHelperCashoutRequestStatus,
    getDriverPaymentSubmissions,
    updateDriverPaymentSubmission,
    updateDriverPaymentSubmissionStatus,
    updateTripCorrection,
    addTripExpenseByAdmin,
    updateTripExpenseByAdmin,
    addDriverDailyExpenseByAdmin,
    updateDriverDailyExpenseByAdmin,
    
    // Dashboard
    getDashboardStats,
    getReportsData,

    // Freight rates
    getFreightRateCards,
    addFreightRateCard,
    updateFreightRateCard,
    deleteFreightRateCard,
    calculateFreightRateEstimate
};
