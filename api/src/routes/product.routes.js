const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/store.controller');

const router = express.Router();

router.use(authenticate);
router.get('/', asyncHandler(controller.getProducts));
router.post('/', authorize('Admin'), asyncHandler(controller.createProduct));
router.put('/:id', authorize('Admin'), asyncHandler(controller.updateProduct));
router.delete('/:id', authorize('Admin'), asyncHandler(controller.deleteProduct));

module.exports = router;
