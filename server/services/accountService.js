const VALID_BANKS = new Set(['Easypaisa', 'JazzCash', 'HBL', 'OTHER']);

const roundCurrency = (value) => Number((Number(value) || 0).toFixed(2));
const toCycleSourceId = (value) => {
    const normalized = toDateString(value);
    return normalized ? Number(normalized.replace(/-/g, '')) : null;
};

const addDays = (date, days) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
};

const addMonths = (date, months) => {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
};

const toDateString = (value) => {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString().slice(0, 10);
};

const syncDriverSalaryForDriver = async (connection, driverId) => {
    const [rows] = await connection.execute(
        `SELECT d.id, d.salary_amount, d.available_balance, d.next_salary_credit_date, d.joined_date, u.status
         FROM drivers d
         JOIN users u ON u.id = d.user_id
         WHERE d.id = ?
         LIMIT 1`,
        [driverId]
    );

    if (!rows.length) {
        return null;
    }

    const driver = rows[0];
    if (driver.status !== 'active') {
        return driver;
    }

    const monthlySalary = roundCurrency(driver.salary_amount);
    if (!(monthlySalary > 0)) {
        return driver;
    }

    const dailyAmount = roundCurrency(monthlySalary / 30);
    const anchor = driver.next_salary_credit_date || driver.joined_date || new Date();
    let nextDate = toDateString(anchor);
    const today = toDateString(new Date());

    if (!nextDate || !today) {
        return driver;
    }

    let totalCredited = 0;
    while (nextDate <= today) {
        const sourceId = toCycleSourceId(nextDate);
        const [existingRows] = await connection.execute(
            `SELECT id
             FROM driver_account_transactions
             WHERE driver_id = ?
               AND balance_type = 'available'
               AND transaction_type = 'salary_credit'
               AND source_type = 'salary_cycle'
               AND source_id = ?
             LIMIT 1`,
            [driverId, sourceId]
        );

        if (!existingRows.length) {
            totalCredited = roundCurrency(totalCredited + dailyAmount);
            await connection.execute(
                `INSERT INTO driver_account_transactions
                    (driver_id, balance_type, transaction_type, direction, amount, source_type, source_id, notes)
                 VALUES (?, 'available', 'salary_credit', 'credit', ?, 'salary_cycle', ?, ?)`,
                [driverId, dailyAmount, sourceId, `Daily salary credit for ${nextDate}`]
            );
        }

        nextDate = toDateString(addDays(nextDate, 1));
    }

    if (totalCredited > 0) {
        await connection.execute(
            `UPDATE drivers
             SET available_balance = available_balance + ?, next_salary_credit_date = ?
             WHERE id = ?`,
            [totalCredited, nextDate, driverId]
        );
    } else if (!driver.next_salary_credit_date) {
        await connection.execute(
            'UPDATE drivers SET next_salary_credit_date = ? WHERE id = ?',
            [nextDate, driverId]
        );
    }

    return { ...driver, available_balance: roundCurrency(driver.available_balance + totalCredited), next_salary_credit_date: nextDate };
};

const syncHelperSalaryForHelper = async (connection, helperId) => {
    const [rows] = await connection.execute(
        `SELECT id, salary_amount, available_balance, next_salary_credit_date, created_at
         FROM helpers
         WHERE id = ?
         LIMIT 1`,
        [helperId]
    );

    if (!rows.length) {
        return null;
    }

    const helper = rows[0];
    const monthlySalary = roundCurrency(helper.salary_amount);
    if (!(monthlySalary > 0)) {
        return helper;
    }

    let nextDate = helper.next_salary_credit_date
        ? toDateString(helper.next_salary_credit_date)
        : toDateString(addMonths(helper.created_at || new Date(), 1));
    const today = toDateString(new Date());

    if (!nextDate || !today) {
        return helper;
    }

    let totalCredited = 0;
    while (nextDate <= today) {
        const sourceId = toCycleSourceId(nextDate);
        const [existingRows] = await connection.execute(
            `SELECT id
             FROM helper_account_transactions
             WHERE helper_id = ?
               AND transaction_type = 'salary_credit'
               AND source_type = 'salary_cycle'
               AND source_id = ?
             LIMIT 1`,
            [helperId, sourceId]
        );

        if (!existingRows.length) {
            totalCredited = roundCurrency(totalCredited + monthlySalary);
            await connection.execute(
                `INSERT INTO helper_account_transactions
                    (helper_id, transaction_type, direction, amount, source_type, source_id, notes)
                 VALUES (?, 'salary_credit', 'credit', ?, 'salary_cycle', ?, ?)`,
                [helperId, monthlySalary, sourceId, `Monthly salary credit for ${nextDate}`]
            );
        }

        nextDate = toDateString(addMonths(nextDate, 1));
    }

    if (totalCredited > 0) {
        await connection.execute(
            `UPDATE helpers
             SET available_balance = available_balance + ?, next_salary_credit_date = ?
             WHERE id = ?`,
            [totalCredited, nextDate, helperId]
        );
    } else if (!helper.next_salary_credit_date) {
        await connection.execute('UPDATE helpers SET next_salary_credit_date = ? WHERE id = ?', [nextDate, helperId]);
    }

    return { ...helper, available_balance: roundCurrency(helper.available_balance + totalCredited), next_salary_credit_date: nextDate };
};

const syncAllDriverSalary = async (connection) => {
    const [rows] = await connection.execute(
        `SELECT d.id
         FROM drivers d
         JOIN users u ON u.id = d.user_id
         WHERE u.status = 'active'`
    );
    for (const row of rows) {
        await syncDriverSalaryForDriver(connection, row.id);
    }
};

const syncAllHelperSalary = async (connection) => {
    const [rows] = await connection.execute('SELECT id FROM helpers');
    for (const row of rows) {
        await syncHelperSalaryForHelper(connection, row.id);
    }
};

const validateReceiveMethodPayload = ({ receiveMethod, amountValue, accountNumber, accountName, bankName }) => {
    if (!['cash', 'account'].includes(receiveMethod)) {
        return 'Valid receive method is required';
    }

    if (!(amountValue > 0)) {
        return 'Amount must be greater than zero';
    }

    if (receiveMethod === 'account') {
        if (!accountNumber || !accountName || !bankName) {
            return 'Account number, account name, and bank name are required';
        }

        if (!VALID_BANKS.has(bankName)) {
            return 'Invalid bank name';
        }
    }

    return null;
};

module.exports = {
    VALID_BANKS,
    roundCurrency,
    syncDriverSalaryForDriver,
    syncHelperSalaryForHelper,
    syncAllDriverSalary,
    syncAllHelperSalary,
    validateReceiveMethodPayload
};
