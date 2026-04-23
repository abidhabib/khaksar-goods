const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Login for both Admin and Driver
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Please provide username and password' });
        }

        const [users] = await pool.execute(
            'SELECT u.*, d.id as driver_id, d.assigned_car_id FROM users u LEFT JOIN drivers d ON u.id = d.user_id WHERE u.username = ? AND u.status = "active"',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, driver_id: user.driver_id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE }
        );

        // Remove password from response
        delete user.password_hash;

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                phone: user.phone,
                driver_id: user.driver_id,
                assigned_car_id: user.assigned_car_id
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get current user profile
const getProfile = async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT u.id, u.username, u.role, u.phone, u.status, u.created_at,
                    d.id as driver_id, d.license_number, d.joined_date,
                    c.id as car_id, c.car_number, c.current_meter_reading
             FROM users u
             LEFT JOIN drivers d ON u.id = d.user_id
             LEFT JOIN cars c ON d.assigned_car_id = c.id
             WHERE u.id = ?`,
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ success: true, user: users[0] });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { login, getProfile };