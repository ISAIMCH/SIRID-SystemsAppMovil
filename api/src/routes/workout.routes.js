const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/workout.controller');
const tracking = require('../controllers/client-tracking.controller');

const router = express.Router();

const staff = [authenticate, authorize('Admin', 'Coach')];
router.get('/client/:clientId', ...staff, asyncHandler(controller.getClientWorkoutHistory));
router.get('/client/:clientId/overview', ...staff, asyncHandler(tracking.getClientOverview));
router.get('/client/:clientId/exercises', ...staff, asyncHandler(tracking.getClientExercises));
router.get('/client/:clientId/exercises/:key', ...staff, asyncHandler(tracking.getClientExercise));
router.get('/client/:clientId/sessions/:sessionId', ...staff, asyncHandler(tracking.getClientSession));
router.get('/clients/activity', authenticate, authorize('Coach'), asyncHandler(tracking.getCoachClientsActivity));

router.patch('/:id', authenticate, authorize('Cliente', 'Admin'), asyncHandler(controller.updateWorkoutSession));
router.delete('/:id', authenticate, authorize('Cliente', 'Admin'), asyncHandler(controller.deleteWorkoutSession));

router.use(authenticate, authorize('Cliente'));
router.post('/', asyncHandler(controller.createWorkoutSession));
router.get('/me', asyncHandler(controller.getMyWorkoutHistory));
router.get('/me/stats', asyncHandler(controller.getMyWorkoutStats));

module.exports = router;
