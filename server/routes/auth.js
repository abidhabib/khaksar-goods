const express = require('express');
const router = express.Router();
const { login, getProfile } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

router.post('/login', login);
router.get('/profile', authMiddleware, getProfile);

module.exports = router;