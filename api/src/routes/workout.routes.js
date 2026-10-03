const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/workout.controller');

const router = express.Router();

router.get('/client/:clientId', authenticate, authorize('Admin', 'Coach'), asyncHandler(controller.getClientWorkoutHistory));

router.use(authenticate, authorize('Cliente'));
router.post('/', asyncHandler(controller.createWorkoutSession));
router.get('/me', asyncHandler(controller.getMyWorkoutHistory));
router.get('/me/stats', asyncHandler(controller.getMyWorkoutStats));

module.exports = router;
