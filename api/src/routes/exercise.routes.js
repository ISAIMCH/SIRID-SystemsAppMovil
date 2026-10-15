const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/exercise.controller');

const router = express.Router();

router.use(authenticate, authorize('Admin', 'Coach'));
router.get('/', asyncHandler(controller.getExercises));
router.post('/', asyncHandler(controller.createExercise));
router.put('/:id', asyncHandler(controller.updateExercise));
router.delete('/:id', asyncHandler(controller.deleteExercise));

module.exports = router;
