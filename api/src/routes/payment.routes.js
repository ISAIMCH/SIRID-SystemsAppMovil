const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/payment.controller');

const router = express.Router();

// Recepcion charges and redeems PINs; only Admins edit or delete payments.
router.use(authenticate);
router.get('/', authorize('Admin', 'Recepcion'), asyncHandler(controller.getPayments));
router.get('/quote', authorize('Admin', 'Recepcion'), asyncHandler(controller.quotePayment));
router.post('/', authorize('Admin', 'Recepcion'), asyncHandler(controller.createPayment));
router.patch('/redeem', authorize('Admin', 'Recepcion'), asyncHandler(controller.redeemPaymentByPin));
router.put('/:id', authorize('Admin'), asyncHandler(controller.updatePayment));
router.delete('/:id', authorize('Admin'), asyncHandler(controller.deletePayment));

module.exports = router;