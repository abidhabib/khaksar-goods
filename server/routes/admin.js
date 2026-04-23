const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const {
    getAllCars,
    addCar,
    updateCar,
    deleteCar,
    getCarHistory,
    getAllDrivers,
    addDriver,
    assignCarToDriver,
    updateDriver,
    getDriverReport,
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

// Drivers
router.get('/drivers', authMiddleware, adminOnly, getAllDrivers);
router.post('/drivers', authMiddleware, adminOnly, addDriver);
router.put('/drivers/:id', authMiddleware, adminOnly, updateDriver);
router.post('/drivers/assign-car', authMiddleware, adminOnly, assignCarToDriver);
router.get('/drivers/:id/report', authMiddleware, adminOnly, getDriverReport);

module.exports = router;
