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
} = require('../controllers/driverController');

const upload = multer({ storage: meterStorage });

// Driver dashboard
router.get('/dashboard', authMiddleware, driverOnly, getDashboard);
router.get('/freight-rates/estimate', authMiddleware, driverOnly, getFreightRateEstimate);

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
router.post(
    '/daily-expenses',
    authMiddleware,
    driverOnly,
    upload.fields([{ name: 'expense_image', maxCount: 1 }]),
    saveDailyExpense
);
router.post('/moboil-change', authMiddleware, driverOnly, saveMoboilChangeReading);
router.post(
    '/company-payments',
    authMiddleware,
    driverOnly,
    upload.fields([{ name: 'payment_screenshot', maxCount: 1 }]),
    submitCompanyPayment
);
router.get('/company-payments', authMiddleware, driverOnly, getCompanyPayments);
router.get('/account', authMiddleware, driverOnly, getDriverAccount);
router.post('/account/cashout-requests', authMiddleware, driverOnly, createDriverCashoutRequest);
router.get('/driver-account', authMiddleware, driverOnly, getDriverAccount);
router.post('/driver-account/cashout-requests', authMiddleware, driverOnly, createDriverCashoutRequest);
router.get('/helper-account', authMiddleware, driverOnly, getHelperAccount);
router.post('/helper-account/cashout-requests', authMiddleware, driverOnly, createHelperCashoutRequest);
router.get('/leave', authMiddleware, driverOnly, getLeaveStatus);
router.post(
    '/leave/request',
    authMiddleware,
    driverOnly,
    upload.fields([{ name: 'meter_image', maxCount: 1 }]),
    requestLeave
);
router.post(
    '/leave/join-request',
    authMiddleware,
    driverOnly,
    upload.fields([{ name: 'meter_image', maxCount: 1 }]),
    requestJoinAfterLeave
);
router.post('/location', authMiddleware, driverOnly, saveCurrentLocation);

module.exports = router;
