const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { requireOwner } = require('../middlewares/subscription.middleware');
const controller = require('../controllers/subscription.controller');

// The owner's GymGo plan. These routes stay open while the plan is unpaid so the owner can pay.
// The Stripe webhook is mounted in app.js, before the JSON parser.
const router = express.Router();

router.use(authenticate, authorize('Admin'), requireOwner);
router.get('/', asyncHandler(controller.getMySubscription));
router.get('/payments', asyncHandler(controller.listMyPayments));
router.post('/checkout', asyncHandler(controller.createCheckout));
router.post('/portal', asyncHandler(controller.createPortal));
// PayPal simulado para la evaluación escolar (sin llaves ni llamadas a PayPal).
router.post('/paypal/demo', asyncHandler(controller.startPaypalDemo));
// router.post('/paypal/orders', asyncHandler(controller.createPaypalOrder));
// router.post('/paypal/orders/:orderId/capture', asyncHandler(controller.capturePaypalOrder));

// Public: plans and prices for the web.
const publicRouter = express.Router();
publicRouter.get('/', asyncHandler(controller.listSaasPlans));

module.exports = { router, publicRouter };
