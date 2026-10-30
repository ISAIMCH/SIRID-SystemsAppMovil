const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/store.controller');

const router = express.Router();

// Recepcion reads active promotions to apply them in sales; only Admins manage them.
router.use(authenticate);
router.get('/', authorize('Admin', 'Recepcion'), asyncHandler(controller.listPromotions));
router.post('/', authorize('Admin'), asyncHandler(controller.createPromotion));
router.put('/:id', authorize('Admin'), asyncHandler(controller.updatePromotion));
router.delete('/:id', authorize('Admin'), asyncHandler(controller.deletePromotion));

module.exports = router;