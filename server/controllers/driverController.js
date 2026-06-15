const pool = require('../config/database');
const MOBOIL_CHANGE_INTERVAL = 5000; // km

const {
    ensureDriverDailyExpenseEntriesTable,
    ensureDriverDailyExpenseEntryColumns,
    ensureDriverPaymentSubmissionsTable,
    ensureDriverCompanyBalanceAdjustmentsTable,
    ensureDriverLocationLogsTable,
    ensureDriverLeaveRequestsTable,
    ensureFreightRateCardsTable
} = require('../config/schema');
const {
    roundCurrency,
    syncDriverSalaryForDriver,
    syncHelperSalaryForHelper,
    validateReceiveMethodPayload
} = require('../services/accountService');
const {
    attachBetweenTripDailyExpenses
} = require('../utils/helpers');
const { calculateFreightEstimate } = require('../services/freightRateService');
const DRIVER_TOTAL_INCOME_SQL = (driverAlias) => `
    (
        COALESCE((
            SELECT SUM(CASE WHEN t.status = 'completed' THEN t.freight_charge ELSE 0 END)
            FROM trips t
            WHERE t.driver_id = ${driverAlias}
        ), 0)
        -
        COALESCE((
            SELECT SUM(e.amount)
            FROM expenses e
            JOIN trips t2 ON t2.id = e.trip_id
            WHERE t2.driver_id = ${driverAlias}
              AND t2.status = 'completed'
        ), 0)
        -
        COALESCE((
            SELECT SUM(t3.bilty_commission_amount)
            FROM trips t3
            WHERE t3.driver_id = ${driverAlias}
              AND t3.status = 'completed'
              AND NOT EXISTS (
                  SELECT 1
                  FROM expenses e2
                  WHERE e2.trip_id = t3.id
                    AND e2.category = 'bilty_commission'
              )
        ), 0)
        -
        COALESCE((
            SELECT SUM(de.amount)
            FROM driver_daily_expense_entries de
            WHERE de.driver_id = ${driverAlias}
        ), 0)
        -
        COALESCE((
            SELECT SUM(CASE WHEN r.status = 'approved' THEN r.amount ELSE 0 END)
            FROM driver_cashout_requests r
            WHERE r.driver_id = ${driverAlias}
        ), 0)
        -
        COALESCE((
            SELECT SUM(CASE WHEN dps.status = 'approved' THEN dps.amount ELSE 0 END)
            FROM driver_payment_submissions dps
            WHERE dps.driver_id = ${driverAlias}
        ), 0)
        +
        COALESCE((
            SELECT SUM(CASE WHEN dcba.adjustment_type = 'deposit' THEN dcba.amount ELSE 0 END)
            FROM driver_company_balance_adjustments dcba
            WHERE dcba.driver_id = ${driverAlias}
        ), 0)
        + 15000
    )
`;
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

const toLocationDecimal = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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
    'mandi_kaat',
    'reward',
    'tyre_puncture',
    'bilty_commission'
]);

const DAILY_EXPENSE_CATEGORY_MAP = {
    cargo_service: 'cargo_service',
    mobile: 'mobile',
    moboil_change: 'moboil_change',
    vehicle_maintenance: 'vehicle_maintenance',
    mechanic: 'mechanic',
    medical: 'medical',
    food: 'food',
    cargo_security_guard: 'cargo_security_guard',
    other: 'other'
};

const PAYMENT_METHODS = new Set(['cash', 'account']);
const LEAVE_ACTIVE_STATUSES = new Set(['on_leave', 'pending_join']);
const DRIVER_BALANCE_TYPES = new Set(['available', 'commission']);

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

const getCurrentLeaveCycleRange = (joinedDateValue, referenceDate = new Date()) => {
    const joinedDate = joinedDateValue ? new Date(joinedDateValue) : new Date(referenceDate);
    const joinedDay = joinedDate.getDate();
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const currentMonthMaxDay = new Date(year, month + 1, 0).getDate();
    const cycleDayThisMonth = Math.min(joinedDay, currentMonthMaxDay);

    let start = new Date(year, month, cycleDayThisMonth, 0, 0, 0, 0);
    if (referenceDate < start) {
        const prevMonthDate = new Date(year, month - 1, 1);
        const prevMonthMaxDay = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
        start = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), Math.min(joinedDay, prevMonthMaxDay), 0, 0, 0, 0);
    }

    const nextMonthDate = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const nextMonthMaxDay = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0).getDate();
    const end = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), Math.min(joinedDay, nextMonthMaxDay), 0, 0, 0, 0);

    return { start, end };
};

const getDriverLeaveOverview = async (driverId) => {
    const [driverRows] = await pool.execute(
        `SELECT d.id, d.joined_date, d.assigned_car_id, c.car_number, c.current_meter_reading
         FROM drivers d
         LEFT JOIN cars c ON d.assigned_car_id = c.id
         WHERE d.id = ?
         LIMIT 1`,
        [driverId]
    );

    if (!driverRows.length) {
        return null;
    }

    const driver = driverRows[0];
    const cycle = getCurrentLeaveCycleRange(driver.joined_date, new Date());
    const [leaveRows] = await pool.execute(
        `SELECT id, status, leave_meter_reading, leave_location, leave_coordinates, leave_requested_at,
                join_meter_reading, join_location, join_coordinates, join_requested_at, join_approved_at, status_updated_at
         FROM driver_leave_requests
         WHERE driver_id = ?
         ORDER BY leave_requested_at DESC, id DESC`,
        [driverId]
    );

    const activeLeave = leaveRows.find((row) => LEAVE_ACTIVE_STATUSES.has(row.status)) || null;

    let totalLeaveDays = 0;
    for (const row of leaveRows) {
        const leaveStart = row.leave_requested_at ? new Date(row.leave_requested_at) : null;
        if (!leaveStart) continue;

        const leaveEnd = row.join_approved_at
            ? new Date(row.join_approved_at)
            : row.status === 'on_leave' || row.status === 'pending_join'
                ? new Date()
                : null;

        if (!leaveEnd) continue;

        const overlapStart = new Date(Math.max(leaveStart.getTime(), cycle.start.getTime()));
        const overlapEnd = new Date(Math.min(leaveEnd.getTime(), cycle.end.getTime()));
        if (overlapEnd <= overlapStart) continue;

        totalLeaveDays += Math.max(Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)), 0);
    }

    return {
        driver,
        activeLeave,
        summary: {
            total_leave_days: totalLeaveDays,
            cycle_start: cycle.start,
            cycle_end: cycle.end
        }
    };
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
    const d = Number(distance) || 0;
    const l = Number(liters) || 0;

    if (d <= 0 || l <= 0) return null;

    return +(d / l).toFixed(2);
};

const buildMoboilStatus = ({
    currentMeterReading,
    lastMoboilChangeMeterReading,
    baselineMeterReading
}) => {
    const currentMeter = Number(currentMeterReading) || 0;
    const lastMeter = lastMoboilChangeMeterReading === null || lastMoboilChangeMeterReading === undefined
        ? null
        : Number(lastMoboilChangeMeterReading) || 0;
    const baselineMeter = Number.isFinite(Number(baselineMeterReading))
        ? Number(baselineMeterReading) || 0
        : 0;

    const referenceMeter = lastMeter !== null ? lastMeter : baselineMeter;
    const kmSinceChange = currentMeter >= referenceMeter
        ? Number((currentMeter - referenceMeter).toFixed(2))
        : 0;
    const remainingKm = Math.max(0, MOBOIL_CHANGE_INTERVAL - kmSinceChange);
    const progressPercent = Math.min(100, (kmSinceChange / MOBOIL_CHANGE_INTERVAL) * 100);

    return {
        last_change_meter: lastMeter,
        baseline_meter: baselineMeter,
        reference_meter: Number(referenceMeter.toFixed(2)),
        km_since_change: Number(kmSinceChange.toFixed(2)),
        remaining_km: Number(remainingKm.toFixed(2)),
        progress_percent: Number(progressPercent.toFixed(1)),
        needs_change: remainingKm <= 0
    };
};

const getDriverCarContext = async (driverId) => {
    const [rows] = await pool.execute(
        `SELECT d.assigned_car_id,
                c.car_number,
                c.current_meter_reading,
                (
                    SELECT ca.start_meter_reading
                    FROM car_assignments ca
                    WHERE ca.driver_id = d.id
                      AND ca.car_id = d.assigned_car_id
                      AND ca.unassigned_at IS NULL
                    ORDER BY ca.assigned_at DESC, ca.id DESC
                    LIMIT 1
                ) AS assignment_start_meter,
                (
                    SELECT ca.assigned_at
                    FROM car_assignments ca
                    WHERE ca.driver_id = d.id
                      AND ca.car_id = d.assigned_car_id
                      AND ca.unassigned_at IS NULL
                    ORDER BY ca.assigned_at DESC, ca.id DESC
                    LIMIT 1
                ) AS assignment_assigned_at
         FROM drivers d
         LEFT JOIN cars c ON d.assigned_car_id = c.id
         WHERE d.id = ?
         LIMIT 1`,
        [driverId]
    );

    return rows[0] || null;
};

const attachDriverTimelineExpensesToTrips = async (trips) => {
    if (!Array.isArray(trips) || !trips.length) {
        return Array.isArray(trips) ? trips : [];
    }

    const driverIds = [...new Set(
        trips
            .map((trip) => Number(trip.driver_id))
            .filter(Number.isFinite)
    )];

    if (!driverIds.length) {
        return trips;
    }

    const placeholders = driverIds.map(() => '?').join(', ');
    const [timelineRows, dailyExpenseRows] = await Promise.all([
        pool.execute(
            `SELECT id, driver_id, status, started_at, ended_at
             FROM trips
             WHERE driver_id IN (${placeholders})
             ORDER BY driver_id ASC, started_at ASC, id ASC`,
            driverIds
        ),
        pool.execute(
            `SELECT id, driver_id, applied_trip_id, category, amount, meter_reading, note, expense_image, expense_date, created_at
             FROM driver_daily_expense_entries
             WHERE driver_id IN (${placeholders})
             ORDER BY driver_id ASC, created_at ASC, id ASC`,
            driverIds
        )
    ]);

    return attachBetweenTripDailyExpenses(trips, timelineRows[0], dailyExpenseRows[0]);
};

const applyCommissionTripFormula = (trip) => {
    const freightCharge = Number(trip?.freight_charge) || 0;
    const tripExpensesTotal = Number(
        trip?.trip_expenses_total ?? trip?.current_expenses ?? trip?.total_expenses
    ) || 0;
    const betweenTripExpensesTotal = Number(trip?.between_trip_expenses_total) || 0;
    const biltyCommissionAmount = Number(trip?.bilty_commission_amount) || 0;
    const hasStoredBiltyCommissionExpense = Array.isArray(trip?.expenses)
        && trip.expenses.some((expense) => expense?.category === 'bilty_commission');
    const effectiveBiltyCommissionAmount = hasStoredBiltyCommissionExpense ? 0 : biltyCommissionAmount;
    const totalExpenses = tripExpensesTotal + betweenTripExpensesTotal + effectiveBiltyCommissionAmount;
    const netProfit = roundCurrency(freightCharge - totalExpenses);

    return {
        ...trip,
        trip_expenses_total: tripExpensesTotal,
        between_trip_expenses_total: betweenTripExpensesTotal,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        net_income: netProfit
    };
};

// Get driver's dashboard data
const getDashboard = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            const [[databaseRow]] = await schemaConnection.query('SELECT DATABASE() AS database_name');
            await ensureDriverDailyExpenseEntriesTable(schemaConnection);
            await ensureDriverDailyExpenseEntryColumns(schemaConnection, databaseRow?.database_name);
            await ensureDriverPaymentSubmissionsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const accountConnection = await pool.getConnection();
        try {
            await syncDriverSalaryForDriver(accountConnection, driver_id);
        } finally {
            accountConnection.release();
        }

        // Driver profile with car
        const [profile] = await pool.execute(`
            SELECT d.*,
                   COALESCE(d.full_name, u.username) AS full_name,
                   u.username, u.phone,
                   c.id as car_id, c.car_number, c.current_meter_reading,
                   (
                       SELECT ca.start_meter_reading
                       FROM car_assignments ca
                       WHERE ca.driver_id = d.id
                         AND ca.car_id = d.assigned_car_id
                         AND ca.unassigned_at IS NULL
                       ORDER BY ca.assigned_at DESC, ca.id DESC
                       LIMIT 1
                   ) as assignment_start_meter,
                   (
                       SELECT ca.assigned_at
                       FROM car_assignments ca
                       WHERE ca.driver_id = d.id
                         AND ca.car_id = d.assigned_car_id
                         AND ca.unassigned_at IS NULL
                       ORDER BY ca.assigned_at DESC, ca.id DESC
                       LIMIT 1
                   ) as assignment_assigned_at,
                   h.id as helper_id, h.helper_name, h.phone_number as helper_phone_number, h.salary_amount as helper_salary_amount, h.available_balance as helper_available_balance,
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
            LEFT JOIN helpers h ON d.helper_id = h.id
            WHERE d.id = ?
        `, [driver_id]);

        if (profile.length === 0) {
            return res.status(404).json({ message: 'Driver profile not found' });
        }

        if (profile[0].helper_id) {
            const helperConnection = await pool.getConnection();
            try {
                await syncHelperSalaryForHelper(helperConnection, profile[0].helper_id);
            } finally {
                helperConnection.release();
            }
            const [helperRows] = await pool.execute(
                'SELECT available_balance FROM helpers WHERE id = ? LIMIT 1',
                [profile[0].helper_id]
            );
            if (helperRows.length) {
                profile[0].helper_available_balance = helperRows[0].available_balance;
            }
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
        const assignmentAssignedAt = profile[0].assignment_assigned_at || null;
        const lastMoboilQuery = assignmentAssignedAt
            ? `SELECT id, amount, meter_reading, expense_date, created_at
               FROM driver_daily_expense_entries
               WHERE driver_id = ? AND category = 'moboil_change'
                 AND (
                     expense_date > DATE(?)
                     OR (expense_date = DATE(?) AND created_at >= ?)
                 )
               ORDER BY expense_date DESC, created_at DESC, id DESC
               LIMIT 1`
            : `SELECT id, amount, meter_reading, expense_date, created_at
               FROM driver_daily_expense_entries
               WHERE driver_id = ? AND category = 'moboil_change'
               ORDER BY expense_date DESC, created_at DESC, id DESC
               LIMIT 1`;
        const lastMoboilParams = assignmentAssignedAt
            ? [driver_id, assignmentAssignedAt, assignmentAssignedAt, assignmentAssignedAt]
            : [driver_id];
        const [lastMoboilRows] = await pool.execute(lastMoboilQuery, lastMoboilParams);

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
        const recentTripsWithDailyExpenses = await attachDriverTimelineExpensesToTrips(recentTrips);

        const [lifetimeTripRows] = await pool.execute(`
            SELECT
                t.*,
                COALESCE(exp.total_expenses, 0) as total_expenses,
                COALESCE(exp.total_diesel_liters, 0) as total_diesel_liters
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
        const lifetimeTrips = await attachDriverTimelineExpensesToTrips(lifetimeTripRows);
        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        currentMonthStart.setHours(0, 0, 0, 0);
        const nextMonthStart = new Date(currentMonthStart);
        nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);
        const lifetimeStats = lifetimeTrips.reduce((acc, trip) => {
            const endedAt = trip.ended_at ? new Date(trip.ended_at) : null;
            const endedAtMs = endedAt && !Number.isNaN(endedAt.getTime()) ? endedAt.getTime() : null;
            if (endedAtMs !== null && endedAtMs >= currentMonthStart.getTime() && endedAtMs < nextMonthStart.getTime()) {
                acc.total_trips += 1;
            }

            acc.total_revenue += Number(trip.freight_charge) || 0;
            acc.total_expenses += Number(trip.total_expenses) || 0;
            acc.total_distance += Number(trip.end_meter_reading - trip.start_meter_reading) || 0;
            acc.total_diesel_liters += Number(trip.total_diesel_liters) || 0;
            return acc;
        }, {
            total_trips: 0,
            total_revenue: 0,
            total_expenses: 0,
            net_earnings: 0,
            total_distance: 0,
            total_diesel_liters: 0
        });
        lifetimeStats.net_earnings = lifetimeStats.total_revenue - lifetimeStats.total_expenses;

        const profilePayload = profile[0];
        const lastMoboilChange = lastMoboilRows[0] || null;
        const currentMeter = Number(profilePayload.current_meter_reading) || 0;
        profilePayload.overall_average_km_per_liter = computeAverageKmPerLiter(
            profilePayload.car_total_distance,
            profilePayload.car_total_diesel_liters
        ) ?? 0;
        profilePayload.moboil_status = buildMoboilStatus({
            currentMeterReading: currentMeter,
            lastMoboilChangeMeterReading: lastMoboilChange ? lastMoboilChange.meter_reading : null,
            baselineMeterReading: profilePayload.assignment_start_meter
        });

        lifetimeStats.overall_average_km_per_liter = computeAverageKmPerLiter(
            lifetimeStats.total_distance,
            lifetimeStats.total_diesel_liters
        );

        const leaveOverview = await getDriverLeaveOverview(driver_id);

        res.json({
            success: true,
            profile: profilePayload,
            ongoingTrip: ongoingTrip[0] || null,
            todayStats,
            recentTrips: recentTripsWithDailyExpenses,
            lifetimeStats,
            leaveStatus: leaveOverview?.activeLeave || null,
            leaveSummary: leaveOverview?.summary || null
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
            load_weight
        } = req.body;
        const meter_image = getUploadedFilePath(req, 'meter_image', 'start_meter_image');
        const bilty_slip_image = getUploadedFilePath(req, 'bilty_slip_image', 'bilty_image');
        const meterReadingValue = toNumberOrDefault(meter_reading, NaN);
        const freightValue = toNumberOrDefault(freight_charge, NaN);
        const biltyCommissionValue = toExpenseNumber(bilty_commission_amount);
        const startLiveLocation = toNullableString(start_live_location);
        const startCoordinates = toNullableString(start_coordinates);
        const resolvedToLocation = toNullableString(to_location) || 'Pending end location';
        const loadWeight = toNullableString(load_weight);

        const missingFields = [];
        if (!from_location) missingFields.push('from_location');
        if (!Number.isFinite(meterReadingValue)) missingFields.push('meter_reading');
        if (!Number.isFinite(freightValue)) missingFields.push('freight_charge');
        if (!loadWeight) missingFields.push('load_weight');
        if (!meter_image) missingFields.push('meter_image');
        if (!bilty_slip_image) missingFields.push('bilty_slip_image');

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

        const [previousCompletedTrips] = await connection.execute(
            `SELECT id, ended_at
             FROM trips
             WHERE driver_id = ? AND status = 'completed' AND ended_at IS NOT NULL
             ORDER BY ended_at DESC, id DESC
             LIMIT 1`,
            [driver_id]
        );
        const previousCompletedTrip = previousCompletedTrips[0] || null;

        // Create trip
        const [tripResult] = await connection.execute(
            `INSERT INTO trips 
             (driver_id, car_id, start_meter_reading, from_location, start_live_location, start_coordinates, to_location,
              freight_charge, start_meter_image, bilty_slip_image, bilty_commission_amount, load_name, load_weight, load_photo,
              load_live_location, load_coordinates, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ongoing')`,
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
                null,
                loadWeight,
                null,
                null,
                null
            ]
        );

        const [[createdTrip]] = await connection.execute(
            'SELECT started_at FROM trips WHERE id = ? LIMIT 1',
            [tripResult.insertId]
        );

        if (previousCompletedTrip?.ended_at && createdTrip?.started_at) {
            await connection.execute(
                `UPDATE driver_daily_expense_entries
                 SET applied_trip_id = ?
                 WHERE driver_id = ?
                   AND applied_trip_id IS NULL
                   AND created_at >= ?
                   AND created_at < ?`,
                [tripResult.insertId, driver_id, previousCompletedTrip.ended_at, createdTrip.started_at]
            );
        }

        await connection.execute(
            'UPDATE cars SET current_meter_reading = ? WHERE id = ?',
            [meterReadingValue, car_id]
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
                start_live_location: startLiveLocation,
                start_coordinates: startCoordinates,
                freight_charge: freightValue,
                start_meter_reading: meterReadingValue,
                start_meter_image: meter_image,
                bilty_slip_image,
                bilty_commission_amount: biltyCommissionValue,
                load_name: null,
                load_weight: loadWeight,
                load_photo: null,
                load_live_location: null,
                load_coordinates: null,
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

const saveTripLoadDetails = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const { trip_id } = req.params;
        const { load_live_location, load_coordinates } = req.body;
        const loadPhoto = getUploadedFilePath(req, 'load_photo', 'loadPhoto', 'load_image');
        const loadLiveLocation = toNullableString(load_live_location);
        const loadCoordinates = toNullableString(load_coordinates);

        const missingFields = [];
        if (!loadPhoto) missingFields.push('load_photo');
        if (!loadLiveLocation) missingFields.push('load_live_location');
        if (!loadCoordinates) missingFields.push('load_coordinates');

        if (missingFields.length) {
            return res.status(400).json({
                message: `Invalid load details payload: missing ${missingFields.join(', ')}`
            });
        }

        const [tripRows] = await connection.execute(
            `SELECT id, driver_id, status, load_weight
             FROM trips
             WHERE id = ? AND driver_id = ?
             LIMIT 1`,
            [trip_id, driver_id]
        );

        if (!tripRows.length) {
            return res.status(404).json({ message: 'Trip not found' });
        }

        const trip = tripRows[0];
        if (trip.status !== 'ongoing') {
            return res.status(400).json({ message: 'Load details can only be updated for an ongoing trip' });
        }

        await connection.execute(
            `UPDATE trips
             SET load_photo = ?,
                 load_live_location = ?,
                 load_coordinates = ?
             WHERE id = ? AND driver_id = ?`,
            [loadPhoto, loadLiveLocation, loadCoordinates, trip_id, driver_id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: 'Load details saved successfully',
            trip: {
                id: Number(trip_id),
                load_weight: trip.load_weight,
                load_photo: loadPhoto,
                load_live_location: loadLiveLocation,
                load_coordinates: loadCoordinates,
                status: trip.status
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('Save trip load details error:', error);
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
            mandi_kaat_cost = 0,
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
        const mandiKaatValue = toExpenseNumber(mandi_kaat_cost);
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
            { category: 'mandi_kaat', amount: mandiKaatValue },
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

        const [tripExpenseRows] = await connection.execute(
            'SELECT category, amount FROM expenses WHERE trip_id = ? ORDER BY created_at ASC, id ASC',
            [trip_id]
        );
        const tripExpensesTotal = tripExpenseRows.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
        const hasStoredBiltyCommissionExpense = tripExpenseRows.some((expense) => expense.category === 'bilty_commission');
        const biltyCommissionAmount = Number(trip[0].bilty_commission_amount) || 0;

        const [previousCompletedTripRows] = await connection.execute(
            `SELECT id
             FROM trips
             WHERE driver_id = ?
               AND status = 'completed'
               AND ended_at < ?
             ORDER BY ended_at DESC, id DESC
             LIMIT 1`,
            [driver_id, trip[0].started_at]
        );
        const isFirstTrip = previousCompletedTripRows.length === 0;

        let initialWaitingExpensesTotal = 0;
        if (isFirstTrip) {
            const [[initialWaitingExpenseRow]] = await connection.execute(
                `SELECT COALESCE(SUM(amount), 0) AS total_amount
                 FROM driver_daily_expense_entries
                 WHERE driver_id = ?
                   AND created_at < ?
                   AND (applied_trip_id IS NULL OR applied_trip_id = ?)`,
                [driver_id, trip[0].started_at, trip_id]
            );
            initialWaitingExpensesTotal = Number(initialWaitingExpenseRow?.total_amount) || 0;
        }

        const effectiveBiltyCommissionAmount = hasStoredBiltyCommissionExpense ? 0 : biltyCommissionAmount;
        const totalExpenses = roundCurrency(tripExpensesTotal + initialWaitingExpensesTotal + effectiveBiltyCommissionAmount);
        const netProfit = roundCurrency((Number(trip[0].freight_charge) || 0) - totalExpenses);

        const [[driverRow]] = await connection.execute(
            'SELECT commission_percentage FROM drivers WHERE id = ? LIMIT 1',
            [driver_id]
        );
        const commissionPercentage = Number(driverRow?.commission_percentage) || 0;
        const commissionAmount = netProfit > 0 && commissionPercentage > 0
            ? roundCurrency((netProfit * commissionPercentage) / 100)
            : 0;

        if (commissionAmount > 0) {
            const [existingRequestRows] = await connection.execute(
                `SELECT id, status
                 FROM driver_commission_requests
                 WHERE driver_id = ? AND trip_id = ?
                 LIMIT 1`,
                [driver_id, trip_id]
            );
            const existingRequest = existingRequestRows[0] || null;

            if (!existingRequest || existingRequest.status !== 'approved') {
                if (existingRequest) {
                    await connection.execute(
                        `UPDATE driver_commission_requests
                         SET commission_percentage = ?,
                             net_profit = ?,
                             commission_amount = ?,
                             status = 'approved',
                             reviewed_by = NULL,
                             reviewed_at = CURRENT_TIMESTAMP,
                             remarks = ?
                         WHERE id = ?`,
                        [commissionPercentage, netProfit, commissionAmount, 'Auto-generated on trip completion', existingRequest.id]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO driver_commission_requests
                            (driver_id, trip_id, commission_percentage, net_profit, commission_amount, status, reviewed_at, remarks)
                         VALUES (?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP, ?)`,
                        [driver_id, trip_id, commissionPercentage, netProfit, commissionAmount, 'Auto-generated on trip completion']
                    );
                }

                await connection.execute(
                    'UPDATE drivers SET commission_balance = commission_balance + ? WHERE id = ?',
                    [commissionAmount, driver_id]
                );

                await createDriverAccountTransaction(connection, {
                    driverId: driver_id,
                    balanceType: 'commission',
                    transactionType: 'commission_credit',
                    direction: 'credit',
                    amount: commissionAmount,
                    sourceType: 'commission_request',
                    sourceId: trip_id,
                    notes: `Commission credited automatically for trip #${trip_id}`
                });
            }
        }
        
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
                net_profit: netProfit,
                commission_request: commissionAmount > 0
                    ? {
                        commission_percentage: commissionPercentage,
                        commission_amount: commissionAmount,
                        status: 'approved'
                    }
                    : null
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
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverCompanyBalanceAdjustmentsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

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
                return res.status(400).json({ message: 'Diesel machine photo is required for diesel expense' });
            }
        }

        if (normalizedCategory === 'chalaan' && !receiptImage) {
            return res.status(400).json({ message: 'Chalaan photo is required' });
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
                   COALESCE(exp.mandi_kaat_expense, 0) as mandi_kaat_expense,
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
                    SUM(CASE WHEN category = 'mandi_kaat' THEN amount ELSE 0 END) as mandi_kaat_expense,
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

        const tripsWithDailyExpenses = await attachDriverTimelineExpensesToTrips(trips);

        res.json({
            success: true,
            trips: tripsWithDailyExpenses.map((trip) => {
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
        const [tripWithDailyExpenses] = await attachDriverTimelineExpensesToTrips([{
            ...trip[0],
            total_expenses: expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
            expenses
        }]);

        res.json({
            success: true,
            trip: tripWithDailyExpenses,
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
            const [[databaseRow]] = await schemaConnection.query('SELECT DATABASE() AS database_name');
            await ensureDriverDailyExpenseEntryColumns(schemaConnection, databaseRow?.database_name);
        } finally {
            schemaConnection.release();
        }

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const monthFilter = buildMonthFilter(req.query.month, 'expense_date');

        const [entries] = await pool.execute(
            `SELECT id, driver_id, category, amount, meter_reading, note, expense_image, expense_date, created_at
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
                    vehicle_maintenance_cost: 0,
                    mechanic_cost: 0,
                    medical_cost: 0,
                    food_cost: 0,
                    cargo_security_guard_fee: 0,
                    other_cost: 0,
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
                case 'vehicle_maintenance':
                    expensesByDate[dateKey].vehicle_maintenance_cost += amountValue;
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
                case 'other':
                    expensesByDate[dateKey].other_cost += amountValue;
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
            const [[databaseRow]] = await schemaConnection.query('SELECT DATABASE() AS database_name');
            await ensureDriverDailyExpenseEntryColumns(schemaConnection, databaseRow?.database_name);
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
            vehicle_maintenance_cost = 0,
            mechanic_cost = 0,
            medical_cost = 0,
            food_cost = 0,
            cargo_security_guard_fee = 0,
            meter_reading,
            note
        } = req.body;

        const expense_image = getUploadedFilePath(req, 'expense_image');
        const normalizedCategory = toNullableString(category);
        if (normalizedCategory && amount !== undefined) {
            const amountValue = toExpenseNumber(amount);
            const meterReadingValue = toOptionalDecimal(meter_reading);
            const noteValue = toNullableString(note);

            if (!DAILY_EXPENSE_CATEGORY_MAP[normalizedCategory] && normalizedCategory !== 'other') {
                return res.status(400).json({ message: 'Invalid daily expense category' });
            }

            if (!(amountValue > 0)) {
                return res.status(400).json({ message: 'Expense amount must be greater than zero' });
            }

            if (normalizedCategory === 'moboil_change' && meterReadingValue === null) {
                return res.status(400).json({ message: 'Meter reading is required for moboil change' });
            }

            let carContext = null;
            if (normalizedCategory === 'moboil_change') {
                carContext = await getDriverCarContext(driver_id);
                if (!carContext?.assigned_car_id) {
                    return res.status(400).json({ message: 'Driver has no assigned cargo' });
                }

                const currentCarMeter = Number(carContext.current_meter_reading) || 0;
                if (meterReadingValue < currentCarMeter) {
                    return res.status(400).json({ message: 'Meter reading must be greater than or equal to current car meter reading' });
                }
            }

            const expenseDate = toNullableString(req.body.expense_date);
            const [result] = await pool.execute(
                `INSERT INTO driver_daily_expense_entries
                 (driver_id, category, amount, meter_reading, note, expense_image, expense_date)
                 VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()))`,
                [driver_id, normalizedCategory, amountValue, meterReadingValue, noteValue, expense_image, expenseDate]
            );

            if (normalizedCategory === 'moboil_change' && carContext?.assigned_car_id) {
                await pool.execute(
                    'UPDATE cars SET current_meter_reading = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [meterReadingValue, carContext.assigned_car_id]
                );
            }

            const [[entry]] = await pool.execute(
                `SELECT id, driver_id, category, amount, meter_reading, note, expense_image, expense_date, created_at
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
                toExpenseNumber(vehicle_maintenance_cost),
                toExpenseNumber(mechanic_cost),
                toExpenseNumber(medical_cost),
                toExpenseNumber(food_cost),
                toExpenseNumber(cargo_security_guard_fee)
            ];

            const rows = [
                ['cargo_service', values[0]],
                ['mobile', values[1]],
                ['moboil_change', values[2]],
                ['vehicle_maintenance', values[3]],
                ['mechanic', values[4]],
                ['medical', values[5]],
                ['food', values[6]],
                ['cargo_security_guard', values[7]]
            ].filter(([, amountValue]) => amountValue > 0);

            const expenseDate = req.body.expense_date || null;
            for (const [categoryName, amountValue] of rows) {
                await pool.execute(
                    `INSERT INTO driver_daily_expense_entries
                     (driver_id, category, amount, expense_date)
                     VALUES (?, ?, ?, COALESCE(?, CURDATE()))`,
                    [driver_id, categoryName, amountValue, expenseDate]
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

const saveMoboilChangeReading = async (req, res) => {
    try {
        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const meterReadingValue = toOptionalDecimal(req.body?.meter_reading);

        if (meterReadingValue === null) {
            return res.status(400).json({ message: 'Meter reading is required for moboil change' });
        }

        const carContext = await getDriverCarContext(driver_id);
        if (!carContext?.assigned_car_id) {
            return res.status(400).json({ message: 'Driver has no assigned cargo' });
        }

        const currentCarMeter = Number(carContext.current_meter_reading) || 0;
        if (meterReadingValue < currentCarMeter) {
            return res.status(400).json({ message: 'Meter reading must be greater than or equal to current car meter reading' });
        }

        const assignmentAssignedAt = carContext.assignment_assigned_at || null;
        const lastMoboilQuery = assignmentAssignedAt
            ? `SELECT meter_reading
               FROM driver_daily_expense_entries
               WHERE driver_id = ? AND category = 'moboil_change'
                 AND (
                     expense_date > DATE(?)
                     OR (expense_date = DATE(?) AND created_at >= ?)
                 )
               ORDER BY expense_date DESC, created_at DESC, id DESC
               LIMIT 1`
            : `SELECT meter_reading
               FROM driver_daily_expense_entries
               WHERE driver_id = ? AND category = 'moboil_change'
               ORDER BY expense_date DESC, created_at DESC, id DESC
               LIMIT 1`;
        const lastMoboilParams = assignmentAssignedAt
            ? [driver_id, assignmentAssignedAt, assignmentAssignedAt, assignmentAssignedAt]
            : [driver_id];
        const [lastMoboilRows] = await pool.execute(lastMoboilQuery, lastMoboilParams);
        const lastMoboilChange = lastMoboilRows[0] || null;

        await pool.execute(
            'UPDATE cars SET current_meter_reading = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [meterReadingValue, carContext.assigned_car_id]
        );

        res.json({
            success: true,
            message: 'Moboil change saved successfully',
            car: {
                id: carContext.assigned_car_id,
                car_number: carContext.car_number,
                current_meter_reading: meterReadingValue
            },
            moboil_status: buildMoboilStatus({
                currentMeterReading: meterReadingValue,
                lastMoboilChangeMeterReading: lastMoboilChange ? lastMoboilChange.meter_reading : null,
                baselineMeterReading: carContext.assignment_start_meter
            })
        });
    } catch (error) {
        console.error('Save moboil change error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const getCompanyPayments = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverPaymentSubmissionsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const monthFilter = buildMonthFilter(req.query.month, 'submitted_at');
        const [payments] = await pool.execute(
            `SELECT
                id,
                driver_id,
                payment_method,
                amount,
                sending_fee,
                handover_to,
                screenshot_image,
                status,
                submitted_at,
                status_updated_at
             FROM driver_payment_submissions
             WHERE driver_id = ? ${monthFilter.clause}
             ORDER BY submitted_at DESC, id DESC`,
            [driver_id, ...monthFilter.params]
        );

        const [[historySummary]] = await pool.execute(
            `SELECT
                COUNT(*) AS total_submissions,
                COALESCE(SUM(amount), 0) AS total_amount
             FROM driver_payment_submissions
             WHERE driver_id = ? ${monthFilter.clause}`,
            [driver_id, ...monthFilter.params]
        );

        const [[summary]] = await pool.execute(
            `SELECT
                COUNT(*) AS total_submissions,
                COALESCE(SUM(amount), 0) AS total_submitted_amount,
                COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS total_approved_amount,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS total_pending_amount,
                COALESCE(SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END), 0) AS total_rejected_amount
             FROM driver_payment_submissions
             WHERE driver_id = ?`,
            [driver_id]
        );

        const [[income]] = await pool.execute(
            `SELECT
                c.car_number,
                ${DRIVER_TOTAL_INCOME_SQL('d.id')} AS total_income
             FROM drivers d
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             WHERE d.id = ?
             LIMIT 1`,
            [driver_id]
        );

        res.json({
            success: true,
            payments,
            historySummary,
            summary: {
                ...summary,
                total_income: Number(income?.total_income) || 0,
                car_number: income?.car_number || null
            }
        });
    } catch (error) {
        console.error('Get company payments error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const submitCompanyPayment = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverPaymentSubmissionsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const paymentMethod = toNullableString(req.body?.payment_method);
        const amountValue = toExpenseNumber(req.body?.amount);
        const sendingFeeValue = toExpenseNumber(req.body?.sending_fee);
        const handoverTo = toNullableString(req.body?.handover_to);
        const screenshotImage = getUploadedFilePath(req, 'payment_screenshot', 'screenshot_image');

        if (!paymentMethod || !PAYMENT_METHODS.has(paymentMethod)) {
            return res.status(400).json({ message: 'Valid payment method is required' });
        }

        if (!(amountValue > 0)) {
            return res.status(400).json({ message: 'Payment amount must be greater than zero' });
        }

        if (paymentMethod === 'cash' && !handoverTo) {
            return res.status(400).json({ message: 'Handover to is required for cash payment' });
        }

        if (paymentMethod === 'account' && !screenshotImage) {
            return res.status(400).json({ message: 'Payment screenshot is required for account payment' });
        }

        const paymentStatus = 'pending';

        const [result] = await pool.execute(
            `INSERT INTO driver_payment_submissions
                (driver_id, payment_method, amount, sending_fee, handover_to, screenshot_image, status, submitted_at, status_updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
                driver_id,
                paymentMethod,
                amountValue,
                paymentMethod === 'account' ? sendingFeeValue : 0,
                paymentMethod === 'cash' ? handoverTo : null,
                paymentMethod === 'account' ? screenshotImage : null,
                paymentStatus
            ]
        );

        const [[payment]] = await pool.execute(
            `SELECT
                id,
                driver_id,
                payment_method,
                amount,
                sending_fee,
                handover_to,
                screenshot_image,
                status,
                submitted_at,
                status_updated_at
             FROM driver_payment_submissions
             WHERE id = ? LIMIT 1`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Payment submission saved and awaiting admin approval',
            payment
        });
    } catch (error) {
        console.error('Submit company payment error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getDriverAccount = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await ensureDriverCompanyBalanceAdjustmentsTable(connection);
        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        await syncDriverSalaryForDriver(connection, driver_id);

        const [[account]] = await connection.execute(
            `SELECT d.id, COALESCE(d.full_name, u.username) AS full_name, d.available_balance, d.commission_balance, d.salary_amount, d.commission_percentage,
                    u.username, c.car_number
             FROM drivers d
             JOIN users u ON d.user_id = u.id
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             WHERE d.id = ?
             LIMIT 1`,
            [driver_id]
        );

        const [transactions] = await connection.execute(
            `SELECT id, balance_type, transaction_type, direction, amount, source_type, source_id, notes, created_at
             FROM driver_account_transactions
             WHERE driver_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 100`,
            [driver_id]
        );

        const [cashouts] = await connection.execute(
            `SELECT id, balance_type, amount, receive_method, account_number, account_name, bank_name, status, remarks, created_at, reviewed_at
             FROM driver_cashout_requests
             WHERE driver_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 100`,
            [driver_id]
        );

        const [commissions] = await connection.execute(
            `SELECT id, trip_id, commission_percentage, net_profit, commission_amount, status, remarks, created_at, reviewed_at
             FROM driver_commission_requests
             WHERE driver_id = ?
             ORDER BY created_at DESC, id DESC
            LIMIT 100`,
            [driver_id]
        );

        res.json({
            success: true,
            account,
            transactions,
            cashouts,
            commissions
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

const createDriverCashoutRequest = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        await syncDriverSalaryForDriver(connection, driver_id);

        const balanceType = toNullableString(req.body?.balance_type);
        const receiveMethod = toNullableString(req.body?.receive_method);
        const amountValue = toExpenseNumber(req.body?.amount);
        const accountNumber = toNullableString(req.body?.account_number);
        const accountName = toNullableString(req.body?.account_name);
        const bankName = toNullableString(req.body?.bank_name);

        if (!balanceType || !DRIVER_BALANCE_TYPES.has(balanceType)) {
            return res.status(400).json({ message: 'Valid driver balance type is required' });
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

        const balanceColumn = balanceType === 'commission' ? 'commission_balance' : 'available_balance';
        const [balanceRows] = await connection.execute(
            `SELECT ${balanceColumn} AS balance FROM drivers WHERE id = ? LIMIT 1`,
            [driver_id]
        );
        const balance = Number(balanceRows[0]?.balance) || 0;

        if (balance < amountValue) {
            console.log(`bal ${balance} .. com ${amountValue}`);
            
            return res.status(400).json({ message: 'Requested amount exceeds available balance' });
        }

        await connection.execute(
            `UPDATE drivers SET ${balanceColumn} = ${balanceColumn} - ? WHERE id = ?`,
            [amountValue, driver_id]
        );

        const [result] = await connection.execute(
            `INSERT INTO driver_cashout_requests
                (driver_id, balance_type, amount, receive_method, account_number, account_name, bank_name, status, reviewed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)`,
            [
                driver_id,
                balanceType,
                amountValue,
                receiveMethod,
                receiveMethod === 'account' ? accountNumber : null,
                receiveMethod === 'account' ? accountName : null,
                receiveMethod === 'account' ? bankName : null
            ]
        );

        await createDriverAccountTransaction(connection, {
            driverId: driver_id,
            balanceType,
            transactionType: 'cashout_debit',
            direction: 'debit',
            amount: amountValue,
            sourceType: 'driver_cashout_request',
            sourceId: result.insertId,
            notes: `Driver cashout approved via ${receiveMethod}`
        });

        await connection.commit();
        res.status(201).json({
            success: true,
            message: 'Driver cashout request approved',
            request_id: result.insertId,
            remaining_balance: Math.max(0, balance - amountValue),
            balance_type: balanceType
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

const getHelperAccount = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const [[driverRow]] = await connection.execute(
            `SELECT d.id, COALESCE(d.full_name, u.username) AS full_name, d.helper_id, c.car_number
             FROM drivers d
             JOIN users u ON d.user_id = u.id
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             WHERE d.id = ?
             LIMIT 1`,
            [driver_id]
        );

        if (!driverRow?.helper_id) {
            return res.status(404).json({ message: 'No helper assigned to this driver' });
        }

        await syncHelperSalaryForHelper(connection, driverRow.helper_id);

        const [[helper]] = await connection.execute(
            `SELECT id, helper_name, phone_number, salary_amount, available_balance, status
             FROM helpers
             WHERE id = ?
             LIMIT 1`,
            [driverRow.helper_id]
        );

        const [transactions] = await connection.execute(
            `SELECT id, transaction_type, direction, amount, source_type, source_id, notes, created_at
             FROM helper_account_transactions
             WHERE helper_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 100`,
            [driverRow.helper_id]
        );

        const [cashouts] = await connection.execute(
            `SELECT id, amount, receive_method, account_number, account_name, bank_name, status, remarks, created_at, reviewed_at
             FROM helper_cashout_requests
             WHERE helper_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 100`,
            [driverRow.helper_id]
        );

        res.json({
            success: true,
            driver: driverRow,
            helper,
            transactions,
            cashouts
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

const createHelperCashoutRequest = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const [[driverRow]] = await connection.execute(
            `SELECT d.helper_id, d.assigned_car_id, COALESCE(d.full_name, u.username) AS full_name, c.car_number
             FROM drivers d
             JOIN users u ON d.user_id = u.id
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             WHERE d.id = ?
             LIMIT 1`,
            [driver_id]
        );

        if (!driverRow?.helper_id) {
            return res.status(404).json({ message: 'No helper assigned to this driver' });
        }

        await syncHelperSalaryForHelper(connection, driverRow.helper_id);

        const receiveMethod = toNullableString(req.body?.receive_method);
        const amountValue = toExpenseNumber(req.body?.amount);
        const accountNumber = toNullableString(req.body?.account_number);
        const accountName = toNullableString(req.body?.account_name);
        const bankName = toNullableString(req.body?.bank_name);

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

        const [helperBalanceRows] = await connection.execute(
            'SELECT available_balance FROM helpers WHERE id = ? LIMIT 1',
            [driverRow.helper_id]
        );
        const helperBalance = Number(helperBalanceRows[0]?.available_balance) || 0;

        if (helperBalance < amountValue) {
            return res.status(400).json({ message: 'Requested amount exceeds helper available balance' });
        }

        const [result] = await connection.execute(
            `INSERT INTO helper_cashout_requests
                (helper_id, driver_id, car_id, amount, receive_method, account_number, account_name, bank_name, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
                driverRow.helper_id,
                driver_id,
                driverRow.assigned_car_id || null,
                amountValue,
                receiveMethod,
                receiveMethod === 'account' ? accountNumber : null,
                receiveMethod === 'account' ? accountName : null,
                receiveMethod === 'account' ? bankName : null
            ]
        );

        await connection.commit();
        res.status(201).json({ success: true, message: 'Helper cashout request submitted', request_id: result.insertId });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        connection.release();
    }
};

const getLeaveStatus = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverLeaveRequestsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const leaveOverview = await getDriverLeaveOverview(driver_id);
        if (!leaveOverview) {
            return res.status(404).json({ message: 'Driver leave profile not found' });
        }

        res.json({
            success: true,
            leaveStatus: leaveOverview.activeLeave,
            leaveSummary: leaveOverview.summary,
            driver: leaveOverview.driver
        });
    } catch (error) {
        console.error('Get leave status error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const requestLeave = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverLeaveRequestsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const leaveOverview = await getDriverLeaveOverview(driver_id);
        if (!leaveOverview) {
            return res.status(404).json({ message: 'Driver leave profile not found' });
        }

        if (leaveOverview.activeLeave) {
            return res.status(400).json({ message: 'You already have an active leave request' });
        }

        const [ongoingTripRows] = await pool.execute(
            `SELECT id FROM trips WHERE driver_id = ? AND status = 'ongoing' LIMIT 1`,
            [driver_id]
        );
        if (ongoingTripRows.length) {
            return res.status(400).json({ message: 'Finish your current trip before going on leave' });
        }

        const leaveMeterReading = toExpenseNumber(req.body?.leave_meter_reading);
        const leaveMeterImage = getUploadedFilePath(req, 'meter_image');
        const leaveLocation = toNullableString(req.body?.leave_location);
        const leaveCoordinates = toNullableString(req.body?.leave_coordinates);

        if (!(leaveMeterReading >= 0)) {
            return res.status(400).json({ message: 'Leave meter reading is required' });
        }

        if (!leaveLocation) {
            return res.status(400).json({ message: 'Leave location is required' });
        }

        if (!leaveMeterImage) {
            return res.status(400).json({ message: 'Leave meter photo is required' });
        }

        const connection = await pool.getConnection();
        let result;
        try {
            await connection.beginTransaction();
            [result] = await connection.execute(
                `INSERT INTO driver_leave_requests
                    (driver_id, car_id, status, leave_meter_reading, leave_meter_image, leave_location, leave_coordinates, leave_requested_at, status_updated_at)
                 VALUES (?, ?, 'on_leave', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [
                    driver_id,
                    leaveOverview.driver.assigned_car_id || null,
                    leaveMeterReading,
                    leaveMeterImage,
                    leaveLocation,
                    leaveCoordinates
                ]
            );

            await connection.execute(
                `UPDATE users u
                 JOIN drivers d ON d.user_id = u.id
                 SET u.status = 'on_leave'
                 WHERE d.id = ?`,
                [driver_id]
            );

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        const [[leaveRequest]] = await pool.execute(
            `SELECT *
             FROM driver_leave_requests
             WHERE id = ?
             LIMIT 1`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Leave started successfully',
            leaveRequest
        });
    } catch (error) {
        console.error('Request leave error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const requestJoinAfterLeave = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverLeaveRequestsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const leaveOverview = await getDriverLeaveOverview(driver_id);
        const activeLeave = leaveOverview?.activeLeave;
        if (!activeLeave || !LEAVE_ACTIVE_STATUSES.has(activeLeave.status)) {
            return res.status(400).json({ message: 'No active leave found to join from' });
        }

        const joinMeterReading = toExpenseNumber(req.body?.join_meter_reading);
        const joinMeterImage = getUploadedFilePath(req, 'meter_image');
        const joinLocation = toNullableString(req.body?.join_location);
        const joinCoordinates = toNullableString(req.body?.join_coordinates);

        if (!(joinMeterReading >= 0)) {
            return res.status(400).json({ message: 'Join meter reading is required' });
        }

        if (!joinLocation) {
            return res.status(400).json({ message: 'Join location is required' });
        }

        if (!joinMeterImage) {
            return res.status(400).json({ message: 'Join meter photo is required' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute(
                `UPDATE driver_leave_requests
                 SET status = 'completed',
                     join_meter_reading = ?,
                     join_meter_image = ?,
                     join_location = ?,
                     join_coordinates = ?,
                     join_requested_at = CURRENT_TIMESTAMP,
                     status_updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [joinMeterReading, joinMeterImage, joinLocation, joinCoordinates, activeLeave.id]
            );

            await connection.execute(
                `UPDATE users u
                 JOIN drivers d ON d.user_id = u.id
                 SET u.status = 'pending_join'
                 WHERE d.id = ?`,
                [driver_id]
            );

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        const [[leaveRequest]] = await pool.execute(
            `SELECT *
             FROM driver_leave_requests
             WHERE id = ?
             LIMIT 1`,
            [activeLeave.id]
        );

        res.json({
            success: true,
            message: 'Join request submitted for admin approval',
            leaveRequest
        });
    } catch (error) {
        console.error('Request join after leave error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const saveCurrentLocation = async (req, res) => {
    try {
        const driver_id = await resolveDriverId(req);
        if (!driver_id) {
            return res.status(403).json({ message: 'Driver account required' });
        }

        const schemaConnection = await pool.getConnection();
        try {
            await ensureDriverLocationLogsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const latitude = toLocationDecimal(req.body.latitude);
        const longitude = toLocationDecimal(req.body.longitude);

        if (latitude === null || longitude === null) {
            return res.status(400).json({ message: 'Latitude and longitude are required' });
        }

        const area = toNullableString(req.body.area);
        const city = toNullableString(req.body.city);
        const province = toNullableString(req.body.province);
        const addressLabel = toNullableString(req.body.address_label);
        const source = toNullableString(req.body.source) || 'driver_app';
        const requestedTripId = Number.parseInt(req.body.trip_id, 10);

        let tripId = null;
        if (Number.isFinite(requestedTripId) && requestedTripId > 0) {
            const [tripRows] = await pool.execute(
                'SELECT id FROM trips WHERE id = ? AND driver_id = ? LIMIT 1',
                [requestedTripId, driver_id]
            );
            if (tripRows.length) {
                tripId = requestedTripId;
            }
        }

        if (!tripId) {
            const [ongoingRows] = await pool.execute(
                'SELECT id FROM trips WHERE driver_id = ? AND status = "ongoing" ORDER BY started_at DESC LIMIT 1',
                [driver_id]
            );
            tripId = ongoingRows.length ? Number(ongoingRows[0].id) : null;
        }

        const [result] = await pool.execute(
            `INSERT INTO driver_location_logs
                (driver_id, trip_id, area, city, province, address_label, latitude, longitude, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [driver_id, tripId, area, city, province, addressLabel, latitude, longitude, source]
        );

        const [rows] = await pool.execute(
            `SELECT id, driver_id, trip_id, area, city, province, address_label, latitude, longitude, source, created_at
             FROM driver_location_logs
             WHERE id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Location saved successfully',
            location: rows[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getFreightRateEstimate = async (req, res) => {
    try {
        const schemaConnection = await pool.getConnection();
        try {
            await ensureFreightRateCardsTable(schemaConnection);
        } finally {
            schemaConnection.release();
        }

        const estimate = await calculateFreightEstimate({
            weightTon: req.query?.weight_ton,
            distanceKm: req.query?.distance_km
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
    getDashboard,
    startTrip,
    saveTripLoadDetails,
    endTrip,
    addTripExpense,
    getTripHistory,
    getTripDetails,
    getDailyExpenses,
    saveDailyExpense,
    saveMoboilChangeReading,
    submitCompanyPayment,
    getCompanyPayments,
    getDriverAccount,
    createDriverCashoutRequest,
    getHelperAccount,
    createHelperCashoutRequest,
    getLeaveStatus,
    getFreightRateEstimate,
    requestLeave,
    requestJoinAfterLeave,
    saveCurrentLocation
};
