const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/promotion.controller');

const router = express.Router();

router.use(authenticate, authorize('Admin'));
router.get('/', asyncHandler(controller.getPromotions));
router.post('/', asyncHandler(controller.createPromotion));
router.put('/:id', asyncHandler(controller.updatePromotion));
router.delete('/:id', asyncHandler(controller.deletePromotion));

module.exports = router;