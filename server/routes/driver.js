const express = require('express');
const router = express.Router();
const multer = require('multer');
const { meterStorage } = require('../config/cloudinary');
const { authMiddleware, driverOnly } = require('../middleware/auth');
const {
    getDashboard,
    startTrip,
    endTrip,
    getTripHistory,
    getTripDetails
} = require('../controllers/driverController');

const upload = multer({ storage: meterStorage });

// Driver dashboard
router.get('/dashboard', authMiddleware, driverOnly, getDashboard);

// Trip operations
router.post('/trips/start', authMiddleware, driverOnly, upload.single('meter_image'), startTrip);
router.post('/trips/:trip_id/end', authMiddleware, driverOnly, upload.single('meter_image'), endTrip);
router.get('/trips', authMiddleware, driverOnly, getTripHistory);
router.get('/trips/:trip_id', authMiddleware, driverOnly, getTripDetails);

module.exports = router;