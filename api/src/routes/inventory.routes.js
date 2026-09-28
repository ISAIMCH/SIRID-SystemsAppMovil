const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/inventory.controller');

const router = express.Router();

router.use(authenticate);
router.get('/', asyncHandler(controller.listEquipment));
router.post('/', authorize('Admin'), asyncHandler(controller.createEquipment));
router.patch('/:id', authorize('Admin'), asyncHandler(controller.updateEquipment));

module.exports = router;