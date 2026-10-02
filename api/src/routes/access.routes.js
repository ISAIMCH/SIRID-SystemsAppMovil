const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const authenticateIotDeviceOrAdmin = require('../middlewares/iot-device-or-admin.middleware');
const controller = require('../controllers/access.controller');

const router = express.Router();

router.post('/access/qr', authenticate, authorize('Cliente'), asyncHandler(controller.createQrToken));
router.post('/iot/access', authenticateIotDeviceOrAdmin, asyncHandler(controller.registerQrAccess));

module.exports = router;