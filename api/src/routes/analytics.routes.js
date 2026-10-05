const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/analytics.controller');

const router = express.Router();

router.get('/client/:clientId', authenticate, authorize('Admin', 'Coach', 'Cliente'), asyncHandler(controller.getClientFitnessAnalytics));
router.get('/dashboard', authenticate, authorize('Admin', 'Coach'), asyncHandler(controller.getOperationsDashboard));

module.exports = router;