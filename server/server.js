const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const driverRoutes = require('./routes/driver');
const { ensureSchema } = require('./config/schema');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/driver', driverRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await ensureSchema();
        app.listen(PORT, () => {
            console.log(`
    🚀 Cargo Tracker Server Running
    =================================
    Port: ${PORT}
    Environment: ${process.env.NODE_ENV}
    API Health: http://localhost:${PORT}/api/health
    =================================
    `);
        });
    } catch (error) {
        console.error('❌ Schema initialization failed:', error.message);
        process.exit(1);
    }
};

startServer();

module.exports = app;
