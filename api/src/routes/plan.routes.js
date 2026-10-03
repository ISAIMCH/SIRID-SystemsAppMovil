const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/plan.controller');

const router = express.Router();

router.use(authenticate, authorize('Admin'));
router.get('/', asyncHandler(controller.listPlans));
router.post('/', asyncHandler(controller.createPlan));
router.patch('/:id', asyncHandler(controller.updatePlan));
router.delete('/:id', asyncHandler(controller.deletePlan));

module.exports = router;
