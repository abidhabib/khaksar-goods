const pool = require('./database');

const TRIP_COLUMNS = [
    {
        name: 'start_live_location',
        definition: 'VARCHAR(255) NULL AFTER from_location'
    },
    {
        name: 'start_coordinates',
        definition: 'VARCHAR(64) NULL AFTER start_live_location'
    },
    {
        name: 'end_location',
        definition: 'VARCHAR(255) NULL AFTER to_location'
    },
    {
        name: 'end_live_location',
        definition: 'VARCHAR(255) NULL AFTER end_location'
    },
    {
        name: 'end_coordinates',
        definition: 'VARCHAR(64) NULL AFTER end_live_location'
    },
    {
        name: 'bilty_slip_image',
        definition: 'VARCHAR(500) NULL AFTER start_meter_image'
    },
    {
        name: 'bilty_commission_amount',
        definition: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER bilty_slip_image'
    },
    {
        name: 'load_name',
        definition: 'VARCHAR(255) NULL AFTER bilty_commission_amount'
    },
    {
        name: 'load_weight',
        definition: 'VARCHAR(255) NULL AFTER load_name'
    },
    {
        name: 'load_photo',
        definition: 'VARCHAR(500) NULL AFTER load_weight'
    },
    {
        name: 'load_live_location',
        definition: 'VARCHAR(255) NULL AFTER load_photo'
    },
    {
        name: 'load_coordinates',
        definition: 'VARCHAR(64) NULL AFTER load_live_location'
    }
];

const EXPENSE_COLUMNS = [
    {
        name: 'liters',
        definition: 'DECIMAL(10,2) NULL AFTER amount'
    },
    {
        name: 'location',
        definition: 'VARCHAR(255) NULL AFTER liters'
    },
    {
        name: 'coordinates',
        definition: 'VARCHAR(64) NULL AFTER location'
    },
    {
        name: 'receipt_image',
        definition: 'VARCHAR(500) NULL AFTER coordinates'
    }
];

const ensureTripColumns = async (connection, databaseName) => {
    for (const column of TRIP_COLUMNS) {
        const [rows] = await connection.execute(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'trips' AND COLUMN_NAME = ?`,
            [databaseName, column.name]
        );

        if (!rows.length) {
            await connection.query(`ALTER TABLE trips ADD COLUMN ${column.name} ${column.definition}`);
        }
    }
};

const ensureDriverDailyExpensesTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS driver_daily_expenses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            driver_id INT NOT NULL,
            expense_date DATE NOT NULL,
            cargo_service_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            mobile_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            moboil_change_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            mechanic_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            food_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            cargo_security_guard_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            other_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            notes TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_driver_daily_expense (driver_id, expense_date),
            CONSTRAINT fk_driver_daily_expenses_driver
                FOREIGN KEY (driver_id) REFERENCES drivers(id)
                ON DELETE CASCADE
        )
    `);
};

const ensureDriverDailyExpenseEntriesTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS driver_daily_expense_entries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            driver_id INT NOT NULL,
            category VARCHAR(50) NOT NULL,
            amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            meter_reading DECIMAL(10,2) NULL,
            expense_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_driver_daily_expense_entries_driver_date (driver_id, expense_date),
            CONSTRAINT fk_driver_daily_expense_entries_driver
                FOREIGN KEY (driver_id) REFERENCES drivers(id)
                ON DELETE CASCADE
        )
    `);
};

const ensureDriverDailyExpenseEntryColumns = async (connection, databaseName) => {
    const columnsToEnsure = [
        { name: 'meter_reading', definition: 'DECIMAL(10,2) NULL AFTER amount' },
        { name: 'note', definition: 'TEXT NULL AFTER meter_reading' },
        { name: 'expense_image', definition: 'VARCHAR(500) NULL AFTER note' }
    ];

    for (const column of columnsToEnsure) {
        const [rows] = await connection.execute(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'driver_daily_expense_entries' AND COLUMN_NAME = ?`,
            [databaseName, column.name]
        );

        if (!rows.length) {
            await connection.query(
                `ALTER TABLE driver_daily_expense_entries ADD COLUMN ${column.name} ${column.definition}`
            );
        }
    }
};

const ensureDriverPaymentSubmissionsTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS driver_payment_submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            driver_id INT NOT NULL,
            payment_method ENUM('cash', 'account') NOT NULL DEFAULT 'account',
            amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            sending_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            handover_to VARCHAR(255) NULL,
            screenshot_image VARCHAR(500) NULL,
            status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_driver_payment_submissions_driver_date (driver_id, created_at),
            INDEX idx_driver_payment_submissions_status (status),
            CONSTRAINT fk_driver_payment_submissions_driver
                FOREIGN KEY (driver_id) REFERENCES drivers(id)
                ON DELETE CASCADE
        )
    `);

    const paymentColumns = [
        { name: 'payment_method', definition: "ENUM('cash', 'account') NOT NULL DEFAULT 'account' AFTER driver_id" },
        { name: 'sending_fee', definition: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER amount' },
        { name: 'handover_to', definition: 'VARCHAR(255) NULL AFTER sending_fee' },
        { name: 'status', definition: "ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending' AFTER screenshot_image" },
        { name: 'submitted_at', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER status' },
        { name: 'status_updated_at', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER submitted_at' }
    ];

    const [[databaseRow]] = await connection.query('SELECT DATABASE() AS database_name');
    const databaseName = databaseRow?.database_name;

    for (const column of paymentColumns) {
        const [rows] = await connection.execute(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'driver_payment_submissions' AND COLUMN_NAME = ?`,
            [databaseName, column.name]
        );

        if (!rows.length) {
            await connection.query(
                `ALTER TABLE driver_payment_submissions ADD COLUMN ${column.name} ${column.definition}`
            );
        }
    }

    await connection.query(`
        UPDATE driver_payment_submissions
        SET
            payment_method = COALESCE(payment_method, 'account'),
            sending_fee = COALESCE(sending_fee, 0.00),
            status = COALESCE(status, 'pending'),
            submitted_at = COALESCE(created_at, submitted_at, CURRENT_TIMESTAMP),
            status_updated_at = COALESCE(updated_at, status_updated_at, submitted_at, CURRENT_TIMESTAMP)
    `);
};

const ensureDriverLocationLogsTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS driver_location_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            driver_id INT NOT NULL,
            trip_id INT NULL,
            area VARCHAR(255) NULL,
            city VARCHAR(255) NULL,
            province VARCHAR(255) NULL,
            address_label VARCHAR(255) NULL,
            latitude DECIMAL(10,7) NOT NULL,
            longitude DECIMAL(10,7) NOT NULL,
            source VARCHAR(50) NOT NULL DEFAULT 'driver_app',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_driver_location_logs_driver_created (driver_id, created_at),
            INDEX idx_driver_location_logs_trip_created (trip_id, created_at),
            CONSTRAINT fk_driver_location_logs_driver
                FOREIGN KEY (driver_id) REFERENCES drivers(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_driver_location_logs_trip
                FOREIGN KEY (trip_id) REFERENCES trips(id)
                ON DELETE SET NULL
        )
    `);
};

const ensureDriverLeaveRequestsTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS driver_leave_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            driver_id INT NOT NULL,
            car_id INT NULL,
            status ENUM('on_leave', 'pending_join', 'completed', 'rejected_join') NOT NULL DEFAULT 'on_leave',
            leave_meter_reading DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            leave_location VARCHAR(255) NULL,
            leave_coordinates VARCHAR(64) NULL,
            leave_requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            join_meter_reading DECIMAL(10,2) NULL,
            join_location VARCHAR(255) NULL,
            join_coordinates VARCHAR(64) NULL,
            join_requested_at TIMESTAMP NULL,
            join_approved_at TIMESTAMP NULL,
            status_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_driver_leave_requests_driver_status (driver_id, status),
            INDEX idx_driver_leave_requests_leave_date (leave_requested_at),
            CONSTRAINT fk_driver_leave_requests_driver
                FOREIGN KEY (driver_id) REFERENCES drivers(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_driver_leave_requests_car
                FOREIGN KEY (car_id) REFERENCES cars(id)
                ON DELETE SET NULL
        )
    `);
};

const ensureExpensesCategoryColumn = async (connection, databaseName) => {
    const [[column]] = await connection.execute(
        `SELECT COLUMN_TYPE, DATA_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'category'`,
        [databaseName]
    );

    if (!column) {
        return;
    }

    const columnType = String(column.COLUMN_TYPE || '').toLowerCase();
    const dataType = String(column.DATA_TYPE || '').toLowerCase();

    if (dataType !== 'varchar' || columnType !== 'varchar(50)') {
        await connection.query('ALTER TABLE expenses MODIFY COLUMN category VARCHAR(50) NOT NULL');
    }
};

const ensureExpenseColumns = async (connection, databaseName) => {
    for (const column of EXPENSE_COLUMNS) {
        const [rows] = await connection.execute(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'expenses' AND COLUMN_NAME = ?`,
            [databaseName, column.name]
        );

        if (!rows.length) {
            await connection.query(`ALTER TABLE expenses ADD COLUMN ${column.name} ${column.definition}`);
        }
    }
};

const ensureSchema = async () => {
    const connection = await pool.getConnection();

    try {
        const [[databaseRow]] = await connection.query('SELECT DATABASE() AS database_name');
        const databaseName = databaseRow?.database_name;

        if (!databaseName) {
            throw new Error('Unable to determine active database name');
        }

        await ensureTripColumns(connection, databaseName);
        await ensureExpensesCategoryColumn(connection, databaseName);
        await ensureExpenseColumns(connection, databaseName);
        await ensureDriverDailyExpensesTable(connection);
        await ensureDriverDailyExpenseEntriesTable(connection);
        await ensureDriverDailyExpenseEntryColumns(connection, databaseName);
        await ensureDriverPaymentSubmissionsTable(connection);
        await ensureDriverLocationLogsTable(connection);
        await ensureDriverLeaveRequestsTable(connection);
    } finally {
        connection.release();
    }
};

module.exports = {
    ensureSchema,
    ensureDriverDailyExpenseEntriesTable,
    ensureDriverDailyExpenseEntryColumns,
    ensureDriverPaymentSubmissionsTable,
    ensureDriverLocationLogsTable,
    ensureDriverLeaveRequestsTable
};
