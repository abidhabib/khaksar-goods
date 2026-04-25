const pool = require('./database');

const TRIP_COLUMNS = [
    {
        name: 'start_live_location',
        definition: 'VARCHAR(255) NULL AFTER from_location'
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
        name: 'bilty_slip_image',
        definition: 'VARCHAR(500) NULL AFTER start_meter_image'
    },
    {
        name: 'bilty_commission_amount',
        definition: 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER bilty_slip_image'
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
        name: 'receipt_image',
        definition: 'VARCHAR(500) NULL AFTER location'
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
    } finally {
        connection.release();
    }
};

module.exports = {
    ensureSchema,
    ensureDriverDailyExpenseEntriesTable
};
