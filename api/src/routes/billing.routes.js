const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/billing.controller');

const router = express.Router();

router.use(authenticate);
router.get('/me', authorize('Cliente'), asyncHandler(controller.getMyBilling));
router.post('/payments', authorize('Cliente'), asyncHandler(controller.requestReceptionPayment));
router.get('/payments', authorize('Admin'), asyncHandler(controller.listPayments));
router.patch('/payments/:id/status', authorize('Admin'), asyncHandler(controller.updatePaymentStatus));

module.exports = router;