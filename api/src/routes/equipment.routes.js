const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/equipment.controller');

const router = express.Router();

router.use(authenticate, authorize('Admin'));
router.get('/', asyncHandler(controller.getEquipment));
router.post('/', asyncHandler(controller.createEquipment));
router.put('/:id', asyncHandler(controller.updateEquipment));
router.delete('/:id', asyncHandler(controller.deleteEquipment));

module.exports = router;
