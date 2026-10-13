const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/payment.controller');

const router = express.Router();

router.use(authenticate, authorize('Admin'));
router.get('/', asyncHandler(controller.getPayments));
router.post('/', asyncHandler(controller.createPayment));
router.put('/:id', asyncHandler(controller.updatePayment));
router.delete('/:id', asyncHandler(controller.deletePayment));

module.exports = router;