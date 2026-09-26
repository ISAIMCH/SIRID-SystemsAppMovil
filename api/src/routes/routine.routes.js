const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/routine.controller');

const router = express.Router();

router.use(authenticate);
router.get('/', asyncHandler(controller.listRoutines));
router.post('/', authorize('Admin', 'Coach'), asyncHandler(controller.createRoutine));
router.get('/:id', asyncHandler(controller.getRoutine));
router.patch('/:id', authorize('Admin', 'Coach'), asyncHandler(controller.updateRoutine));
router.delete('/:id', authorize('Admin', 'Coach'), asyncHandler(controller.deleteRoutine));

module.exports = router;