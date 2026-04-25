const express = require('express');
const router = express.Router();
const multer = require('multer');
const { meterStorage } = require('../config/cloudinary');
const { authMiddleware, driverOnly } = require('../middleware/auth');
const {
    getDashboard,
    startTrip,
    endTrip,
    addTripExpense,
    getTripHistory,
    getTripDetails,
    getDailyExpenses,
    saveDailyExpense
} = require('../controllers/driverController');

const upload = multer({ storage: meterStorage });

// Driver dashboard
router.get('/dashboard', authMiddleware, driverOnly, getDashboard);

// Trip operations
router.post(
    '/trips/start',
    authMiddleware,
    driverOnly,
    upload.fields([
        { name: 'meter_image', maxCount: 1 },
        { name: 'bilty_slip_image', maxCount: 1 }
    ]),
    startTrip
);
router.post(
    '/trips/:trip_id/end',
    authMiddleware,
    driverOnly,
    upload.fields([{ name: 'meter_image', maxCount: 1 }]),
    endTrip
);
router.post('/trips/:trip_id/expenses', authMiddleware, driverOnly, addTripExpense);
router.get('/trips', authMiddleware, driverOnly, getTripHistory);
router.get('/trips/:trip_id', authMiddleware, driverOnly, getTripDetails);
router.get('/daily-expenses', authMiddleware, driverOnly, getDailyExpenses);
router.post('/daily-expenses', authMiddleware, driverOnly, saveDailyExpense);

module.exports = router;
