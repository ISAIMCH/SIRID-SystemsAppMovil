const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const authenticateIotDevice = require('../middlewares/iot-device.middleware');
const controller = require('../controllers/access.controller');

const router = express.Router();

router.post('/access/qr', authenticate, authorize('Cliente'), asyncHandler(controller.createQrToken));
router.post('/iot/access', authenticateIotDevice, asyncHandler(controller.registerQrAccess));

module.exports = router;