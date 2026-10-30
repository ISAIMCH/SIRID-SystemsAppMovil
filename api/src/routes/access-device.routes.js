const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/gym.controller');

const router = express.Router();

router.use(authenticate, authorize('Admin'));
router.get('/', asyncHandler(controller.listDevices));
router.post('/', asyncHandler(controller.createDevice));
router.delete('/:id', asyncHandler(controller.revokeDevice));

module.exports = router;
