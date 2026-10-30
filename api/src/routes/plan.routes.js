const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/plan.controller');

const router = express.Router();

// Recepcion reads the plans it charges for; only Admins manage them.
router.use(authenticate);
router.get('/', authorize('Admin', 'Recepcion'), asyncHandler(controller.listPlans));
router.post('/', authorize('Admin'), asyncHandler(controller.createPlan));
router.patch('/:id', authorize('Admin'), asyncHandler(controller.updatePlan));
router.delete('/:id', authorize('Admin'), asyncHandler(controller.deletePlan));

module.exports = router;
