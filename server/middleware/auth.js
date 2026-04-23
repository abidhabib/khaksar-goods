const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const findDriverRecord = async (userId) => {
    const [drivers] = await pool.execute(
        'SELECT id, assigned_car_id FROM drivers WHERE user_id = ? LIMIT 1',
        [userId]
    );

    return drivers.length > 0 ? drivers[0] : null;
};

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify user still exists and is active
        const [users] = await pool.execute(
            `SELECT u.id, u.username, u.role, u.status, u.updated_at,
                    d.id as driver_id, d.assigned_car_id
             FROM users u
             LEFT JOIN drivers d ON d.user_id = u.id
             WHERE u.id = ? AND u.status = "active"`,
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'Token is not valid' });
        }

        const user = users[0];
        const issuedAtMs = decoded.iat ? decoded.iat * 1000 : 0;
        const updatedAtMs = new Date(user.updated_at).getTime();

        if (issuedAtMs && updatedAtMs > issuedAtMs) {
            return res.status(401).json({ message: 'Token is not valid' });
        }

        if (user.role === 'driver' && !user.driver_id) {
            const driver = await findDriverRecord(user.id);
            if (driver) {
                user.driver_id = driver.id;
                user.assigned_car_id = driver.assigned_car_id;
            }
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

const driverOnly = async (req, res, next) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ message: 'Driver access required' });
        }

        if (!req.user.driver_id) {
            const driver = await findDriverRecord(req.user.id);
            if (!driver) {
                return res.status(403).json({ message: 'Driver account required' });
            }

            req.user.driver_id = driver.id;
            req.user.assigned_car_id = driver.assigned_car_id;
        }

        next();
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { authMiddleware, adminOnly, driverOnly };
