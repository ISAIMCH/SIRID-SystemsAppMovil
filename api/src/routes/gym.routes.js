const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/gym.controller');

const router = express.Router();

router.use(authenticate);
router.post('/join', asyncHandler(controller.joinGym));
router.get('/', authorize('Admin', 'Recepcion'), asyncHandler(controller.listGyms));
router.post('/', authorize('Admin'), asyncHandler(controller.createGym));
router.post('/:id/join-code', authorize('Admin'), asyncHandler(controller.regenerateJoinCode));

module.exports = router;
