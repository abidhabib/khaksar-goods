const pool = require('./database');

const TRIP_COLUMNS = [
    { name: 'start_live_location', definition: 'VARCHAR(255) NULL AFTER from_location' },
    { name: 'start_coordinates', definition: 'VARCHAR(64) NULL AFTER start_live_location' },
    { name: 'end_location', definition: 'VARCHAR(255) NULL AFTER to_location' },
    { name: 'end_live_location', definition: 'VARCHAR(255) NULL AFTER end_location' },
    { name: 'end_coordinates', definition: 'VARCHAR(64) NULL AFTER end_live_location' },
    { name: 'bilty_slip_image', definition: 'VARCHAR(500) NULL AFTER start_meter_image' },
    { name: 'bilty_commission_amount', definition: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER bilty_slip_image' },
    { name: 'load_name', definition: 'VARCHAR(255) NULL AFTER bilty_commission_amount' },
    { name: 'load_weight', definition: 'VARCHAR(255) NULL AFTER load_name' },
    { name: 'load_photo', definition: 'VARCHAR(500) NULL AFTER load_weight' },
    { name: 'load_live_location', definition: 'VARCHAR(255) NULL AFTER load_photo' },
    { name: 'load_coordinates', definition: 'VARCHAR(64) NULL AFTER load_live_location' }
];

const EXPENSE_COLUMNS = [
    { name: 'liters', definition: 'DECIMAL(10,2) NULL AFTER amount' },
    { name: 'location', definition: 'VARCHAR(255) NULL AFTER liters' },
    { name: 'coordinates', definition: 'VARCHAR(64) NULL AFTER location' },
    { name: 'receipt_image', definition: 'VARCHAR(500) NULL AFTER coordinates' }
];

const DRIVER_COLUMNS = [
    { name: 'full_name', definition: 'VARCHAR(255) NULL AFTER user_id' },
    { name: 'salary_amount', definition: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER license_number' },
    { name: 'commission_percentage', definition: 'DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER salary_amount' },
    { name: 'helper_id', definition: 'INT NULL AFTER assigned_car_id' },
    { name: 'available_balance', definition: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER helper_id' },
    { name: 'commission_balance', definition: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER available_balance' },
    { name: 'next_salary_credit_date', definition: 'DATE NULL AFTER commission_balance' }
];

const USERS_COLUMNS = [
    { name: 'status', definition: "ENUM('active', 'inactive', 'suspended', 'on_leave', 'pending_join') NOT NULL DEFAULT 'active' AFTER role" }
];

const columnExists = async (connection, databaseName, tableName, columnName) => {
    const [rows] = await connection.execute(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [databaseName, tableName, columnName]
    );

    return rows.length > 0;
};

const ensureColumns = async (connection, databaseName, tableName, columns) => {
    for (const column of columns) {
        const exists = await columnExists(connection, databaseName, tableName, column.name);
        if (!exists) {
            await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`);
        }
    }
};

const ensureForeignKey = async (connection, databaseName, tableName, constraintName, sql) => {
    const [rows] = await connection.execute(
        `SELECT CONSTRAINT_NAME
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
        [databaseName, tableName, constraintName]
    );

    if (!rows.length) {
        await connection.query(sql);
    }
};

const ensureTripColumns = async (connection, databaseName) => {
    await ensureColumns(connection, databaseName, 'trips', TRIP_COLUMNS);
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
    await ensureColumns(connection, databaseName, 'driver_daily_expense_entries', [
        { name: 'meter_reading', definition: 'DECIMAL(10,2) NULL AFTER amount' },
        { name: 'note', definition: 'TEXT NULL AFTER meter_reading' },
        { name: 'expense_image', definition: 'VARCHAR(500) NULL AFTER note' }
    ]);
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

    const [[databaseRow]] = await connection.query('SELECT DATABASE() AS database_name');
    await ensureColumns(connection, databaseRow?.database_name, 'driver_payment_submissions', [
        { name: 'payment_method', definition: "ENUM('cash', 'account') NOT NULL DEFAULT 'account' AFTER driver_id" },
        { name: 'sending_fee', definition: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER amount' },
        { name: 'handover_to', definition: 'VARCHAR(255) NULL AFTER sending_fee' },
        { name: 'status', definition: "ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending' AFTER screenshot_image" },
        { name: 'submitted_at', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER status' },
        { name: 'status_updated_at', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER submitted_at' }
    ]);

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
            leave_meter_image VARCHAR(500) NULL,
            leave_location VARCHAR(255) NULL,
            leave_coordinates VARCHAR(64) NULL,
            leave_requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            join_meter_reading DECIMAL(10,2) NULL,
            join_meter_image VARCHAR(500) NULL,
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

    const [[databaseRow]] = await connection.query('SELECT DATABASE() AS database_name');
    await ensureColumns(connection, databaseRow?.database_name, 'driver_leave_requests', [
        { name: 'leave_meter_image', definition: 'VARCHAR(500) NULL AFTER leave_meter_reading' },
        { name: 'join_meter_image', definition: 'VARCHAR(500) NULL AFTER join_meter_reading' }
    ]);
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
    await ensureColumns(connection, databaseName, 'expenses', EXPENSE_COLUMNS);
};

const ensureUsersColumns = async (connection, databaseName) => {
    await ensureColumns(connection, databaseName, 'users', USERS_COLUMNS);
    const [[column]] = await connection.execute(
        `SELECT COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status'`,
        [databaseName]
    );

    const columnType = String(column?.COLUMN_TYPE || '').toLowerCase();
    const requiredEnum = "enum('active','inactive','suspended','on_leave','pending_join')";
    if (columnType && columnType !== requiredEnum) {
        await connection.query(
            "ALTER TABLE users MODIFY COLUMN status ENUM('active', 'inactive', 'suspended', 'on_leave', 'pending_join') NOT NULL DEFAULT 'active'"
        );
    }
};

const ensureDriversColumns = async (connection, databaseName) => {
    await ensureColumns(connection, databaseName, 'drivers', DRIVER_COLUMNS);
    await ensureForeignKey(
        connection,
        databaseName,
        'drivers',
        'fk_drivers_helper',
        `ALTER TABLE drivers
         ADD CONSTRAINT fk_drivers_helper
         FOREIGN KEY (helper_id) REFERENCES helpers(id)
         ON DELETE SET NULL`
    ).catch(() => {});
};

const ensureHelpersTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS helpers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            helper_name VARCHAR(255) NOT NULL,
            phone_number VARCHAR(50) NULL,
            salary_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            available_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            next_salary_credit_date DATE NULL,
            status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
};

const ensureDriverAccountTransactionsTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS driver_account_transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            driver_id INT NOT NULL,
            balance_type ENUM('available', 'commission') NOT NULL,
            transaction_type ENUM('salary_credit', 'commission_credit', 'cashout_debit', 'cashout_reversal') NOT NULL,
            direction ENUM('credit', 'debit') NOT NULL,
            amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            source_type VARCHAR(50) NULL,
            source_id INT NULL,
            notes TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_driver_account_transactions_driver_created (driver_id, created_at),
            CONSTRAINT fk_driver_account_transactions_driver
                FOREIGN KEY (driver_id) REFERENCES drivers(id)
                ON DELETE CASCADE
        )
    `);
};

const ensureHelperAccountTransactionsTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS helper_account_transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            helper_id INT NOT NULL,
            driver_id INT NULL,
            transaction_type ENUM('salary_credit', 'cashout_debit', 'cashout_reversal') NOT NULL,
            direction ENUM('credit', 'debit') NOT NULL,
            amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            source_type VARCHAR(50) NULL,
            source_id INT NULL,
            notes TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_helper_account_transactions_helper_created (helper_id, created_at),
            CONSTRAINT fk_helper_account_transactions_helper
                FOREIGN KEY (helper_id) REFERENCES helpers(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_helper_account_transactions_driver
                FOREIGN KEY (driver_id) REFERENCES drivers(id)
                ON DELETE SET NULL
        )
    `);
};

const ensureDriverCommissionRequestsTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS driver_commission_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            driver_id INT NOT NULL,
            trip_id INT NOT NULL,
            commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
            net_profit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
            reviewed_by INT NULL,
            reviewed_at TIMESTAMP NULL,
            remarks TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_driver_trip_commission_request (trip_id),
            INDEX idx_driver_commission_requests_driver_status (driver_id, status),
            CONSTRAINT fk_driver_commission_requests_driver
                FOREIGN KEY (driver_id) REFERENCES drivers(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_driver_commission_requests_trip
                FOREIGN KEY (trip_id) REFERENCES trips(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_driver_commission_requests_reviewer
                FOREIGN KEY (reviewed_by) REFERENCES users(id)
                ON DELETE SET NULL
        )
    `);
};

const ensureDriverCashoutRequestsTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS driver_cashout_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            driver_id INT NOT NULL,
            balance_type ENUM('available', 'commission') NOT NULL,
            amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            receive_method ENUM('cash', 'account') NOT NULL,
            account_number VARCHAR(100) NULL,
            account_name VARCHAR(255) NULL,
            bank_name VARCHAR(100) NULL,
            status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
            reviewed_by INT NULL,
            reviewed_at TIMESTAMP NULL,
            remarks TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_driver_cashout_requests_driver_status (driver_id, status),
            CONSTRAINT fk_driver_cashout_requests_driver
                FOREIGN KEY (driver_id) REFERENCES drivers(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_driver_cashout_requests_reviewer
                FOREIGN KEY (reviewed_by) REFERENCES users(id)
                ON DELETE SET NULL
        )
    `);
};

const ensureHelperCashoutRequestsTable = async (connection) => {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS helper_cashout_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            helper_id INT NOT NULL,
            driver_id INT NOT NULL,
            car_id INT NULL,
            amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            receive_method ENUM('cash', 'account') NOT NULL,
            account_number VARCHAR(100) NULL,
            account_name VARCHAR(255) NULL,
            bank_name VARCHAR(100) NULL,
            status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
            reviewed_by INT NULL,
            reviewed_at TIMESTAMP NULL,
            remarks TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_helper_cashout_requests_helper_status (helper_id, status),
            CONSTRAINT fk_helper_cashout_requests_helper
                FOREIGN KEY (helper_id) REFERENCES helpers(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_helper_cashout_requests_driver
                FOREIGN KEY (driver_id) REFERENCES drivers(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_helper_cashout_requests_car
                FOREIGN KEY (car_id) REFERENCES cars(id)
                ON DELETE SET NULL,
            CONSTRAINT fk_helper_cashout_requests_reviewer
                FOREIGN KEY (reviewed_by) REFERENCES users(id)
                ON DELETE SET NULL
        )
    `);
};

const ensureSchema = async () => {
    const connection = await pool.getConnection();

    try {
        const [[databaseRow]] = await connection.query('SELECT DATABASE() AS database_name');
        const databaseName = databaseRow?.database_name;

        if (!databaseName) {
            throw new Error('Unable to determine active database name');
        }

        await ensureHelpersTable(connection);
        await ensureUsersColumns(connection, databaseName);
        await ensureDriversColumns(connection, databaseName);
        await ensureTripColumns(connection, databaseName);
        await ensureExpensesCategoryColumn(connection, databaseName);
        await ensureExpenseColumns(connection, databaseName);
        await ensureDriverDailyExpensesTable(connection);
        await ensureDriverDailyExpenseEntriesTable(connection);
        await ensureDriverDailyExpenseEntryColumns(connection, databaseName);
        await ensureDriverPaymentSubmissionsTable(connection);
        await ensureDriverLocationLogsTable(connection);
        await ensureDriverLeaveRequestsTable(connection);
        await ensureDriverAccountTransactionsTable(connection);
        await ensureHelperAccountTransactionsTable(connection);
        await ensureDriverCommissionRequestsTable(connection);
        await ensureDriverCashoutRequestsTable(connection);
        await ensureHelperCashoutRequestsTable(connection);
        await connection.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_driver_salary_cycle
            ON driver_account_transactions (driver_id, balance_type, transaction_type, source_type, source_id)
        `).catch(() => {});
        await connection.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_helper_salary_cycle
            ON helper_account_transactions (helper_id, transaction_type, source_type, source_id)
        `).catch(() => {});
        await connection.query(`
            UPDATE drivers d
            JOIN users u ON u.id = d.user_id
            SET d.full_name = u.username
            WHERE d.full_name IS NULL OR TRIM(d.full_name) = ''
        `);
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
