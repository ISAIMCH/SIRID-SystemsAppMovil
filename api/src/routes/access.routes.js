const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const authenticateIotDeviceOrAdmin = require('../middlewares/iot-device-or-admin.middleware');
const controller = require('../controllers/access.controller');
const logController = require('../controllers/access-log.controller');

const router = express.Router();

router.post('/access/qr', authenticate, authorize('Cliente'), asyncHandler(controller.createQrToken));
router.post('/iot/access', authenticateIotDeviceOrAdmin, asyncHandler(controller.registerQrAccess));
// The live capacity monitor and the access log, for the gym's managers and reception.
router.get('/access/occupancy', authenticate, authorize('Admin', 'Recepcion'), asyncHandler(logController.getOccupancy));
router.get('/access/logs', authenticate, authorize('Admin', 'Recepcion'), asyncHandler(logController.listAccessLogs));

module.exports = router;