const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/muscle-group.controller');

const router = express.Router();

router.use(authenticate, authorize('Admin', 'Coach'));
router.get('/', asyncHandler(controller.listMuscleGroups));
router.post('/', asyncHandler(controller.createMuscleGroup));

module.exports = router;
