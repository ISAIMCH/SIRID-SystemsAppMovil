const express = require('express');
const { rateLimit } = require('express-rate-limit');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/billing.controller');

const router = express.Router();

router.use(authenticate);
router.get('/me', authorize('Cliente'), asyncHandler(controller.getMyBilling));
router.post('/payments', authorize('Cliente'), asyncHandler(controller.requestReceptionPayment));
router.get('/payments', authorize('Admin'), asyncHandler(controller.listPayments));
router.get(
  '/payments/pin/:pin',
  authorize('Admin'),
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
  asyncHandler(controller.findPendingPaymentByPin),
);
router.patch('/payments/:id/status', authorize('Admin'), asyncHandler(controller.updatePaymentStatus));

module.exports = router;