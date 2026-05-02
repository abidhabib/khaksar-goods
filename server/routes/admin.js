const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const {
    getAllCars,
    addCar,
    updateCar,
    deleteCar,
    getCarHistory,
    getTripReport,
    getAllDrivers,
    addDriver,
    assignCarToDriver,
    updateDriver,
    getHelpers,
    addHelper,
    updateHelper,
    getDriverReport,
    getDriversExpenseReport,
    getDriverCommissionRequests,
    updateDriverCommissionRequestStatus,
    getDriverCashoutRequests,
    updateDriverCashoutRequestStatus,
    getHelperCashoutRequests,
    updateHelperCashoutRequestStatus,
    getDriverPaymentSubmissions,
    updateDriverPaymentSubmissionStatus,
    getDriverLeaveRequests,
    updateDriverLeaveRequestStatus,
    getDashboardStats,
    getReportsData
} = require('../controllers/adminController');

// Dashboard
router.get('/dashboard', authMiddleware, adminOnly, getDashboardStats);
router.get('/reports', authMiddleware, adminOnly, getReportsData);

// Cars
router.get('/cars', authMiddleware, adminOnly, getAllCars);
router.post('/cars', authMiddleware, adminOnly, addCar);
router.put('/cars/:id', authMiddleware, adminOnly, updateCar);
router.delete('/cars/:id', authMiddleware, adminOnly, deleteCar);
router.get('/cars/:id/history', authMiddleware, adminOnly, getCarHistory);
router.get('/trips/:id/report', authMiddleware, adminOnly, getTripReport);

// Drivers
router.get('/drivers', authMiddleware, adminOnly, getAllDrivers);
router.post('/drivers', authMiddleware, adminOnly, addDriver);
router.put('/drivers/:id', authMiddleware, adminOnly, updateDriver);
router.post('/drivers/assign-car', authMiddleware, adminOnly, assignCarToDriver);
router.get('/helpers', authMiddleware, adminOnly, getHelpers);
router.post('/helpers', authMiddleware, adminOnly, addHelper);
router.put('/helpers/:id', authMiddleware, adminOnly, updateHelper);
router.get('/helper', authMiddleware, adminOnly, getHelpers);
router.post('/helper', authMiddleware, adminOnly, addHelper);
router.put('/helper/:id', authMiddleware, adminOnly, updateHelper);
router.get('/drivers/:id/report', authMiddleware, adminOnly, getDriverReport);
router.get('/drivers-expenses', authMiddleware, adminOnly, getDriversExpenseReport);
router.get('/driver-commission-requests', authMiddleware, adminOnly, getDriverCommissionRequests);
router.put('/driver-commission-requests/:id/status', authMiddleware, adminOnly, updateDriverCommissionRequestStatus);
router.get('/driver-cashout-requests', authMiddleware, adminOnly, getDriverCashoutRequests);
router.put('/driver-cashout-requests/:id/status', authMiddleware, adminOnly, updateDriverCashoutRequestStatus);
router.get('/helper-cashout-requests', authMiddleware, adminOnly, getHelperCashoutRequests);
router.put('/helper-cashout-requests/:id/status', authMiddleware, adminOnly, updateHelperCashoutRequestStatus);
router.get('/payment-submissions', authMiddleware, adminOnly, getDriverPaymentSubmissions);
router.put('/payment-submissions/:id/status', authMiddleware, adminOnly, updateDriverPaymentSubmissionStatus);
router.get('/leave-requests', authMiddleware, adminOnly, getDriverLeaveRequests);
router.put('/leave-requests/:id/status', authMiddleware, adminOnly, updateDriverLeaveRequestStatus);

module.exports = router;
