const express = require('express');
const router = express.Router();
const multer = require('multer');
const { meterStorage } = require('../config/cloudinary');
const { authMiddleware, driverOnly } = require('../middleware/auth');
const {
    getDashboard,
    startTrip,
    saveTripLoadDetails,
    endTrip,
    addTripExpense,
    getTripHistory,
    getTripDetails,
    getDailyExpenses,
    saveDailyExpense,
    submitCompanyPayment,
    getCompanyPayments
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
    '/trips/:trip_id/load-details',
    authMiddleware,
    driverOnly,
    upload.fields([{ name: 'load_photo', maxCount: 1 }]),
    saveTripLoadDetails
);
router.post(
    '/trips/:trip_id/end',
    authMiddleware,
    driverOnly,
    upload.fields([{ name: 'meter_image', maxCount: 1 }]),
    endTrip
);
router.post(
    '/trips/:trip_id/expenses',
    authMiddleware,
    driverOnly,
    upload.fields([{ name: 'receipt_image', maxCount: 1 }]),
    addTripExpense
);
router.get('/trips', authMiddleware, driverOnly, getTripHistory);
router.get('/trips/:trip_id', authMiddleware, driverOnly, getTripDetails);
router.get('/daily-expenses', authMiddleware, driverOnly, getDailyExpenses);
router.post('/daily-expenses', authMiddleware, driverOnly, saveDailyExpense);
router.post(
    '/company-payments',
    authMiddleware,
    driverOnly,
    upload.fields([{ name: 'payment_screenshot', maxCount: 1 }]),
    submitCompanyPayment
);
router.get('/company-payments', authMiddleware, driverOnly, getCompanyPayments);

module.exports = router;
