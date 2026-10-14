const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/store-order.controller');

const clientRouter = express.Router();
clientRouter.use(authenticate, authorize('Cliente'));
clientRouter.post('/', asyncHandler(controller.createOrder));

const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('Admin'));
adminRouter.get('/', asyncHandler(controller.getOrders));
adminRouter.post('/', asyncHandler(controller.createOrder));
adminRouter.put('/:id/status', asyncHandler(controller.updateOrderStatus));

module.exports = { clientRouter, adminRouter };