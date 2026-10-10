const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/store.controller');

const router = express.Router();

router.use(authenticate);
router.get('/products', asyncHandler(controller.getProducts));
router.post('/products', authorize('Admin'), asyncHandler(controller.createProduct));
router.patch('/products/:id', authorize('Admin'), asyncHandler(controller.updateProduct));
router.delete('/products/:id', authorize('Admin'), asyncHandler(controller.deleteProduct));
router.get('/promotions', asyncHandler(controller.listPromotions));
router.post('/promotions', authorize('Admin'), asyncHandler(controller.createPromotion));
router.patch('/promotions/:id', authorize('Admin'), asyncHandler(controller.updatePromotion));
router.delete('/promotions/:id', authorize('Admin'), asyncHandler(controller.deletePromotion));
router.post('/orders', asyncHandler(controller.createOrder));

module.exports = router;
