const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/user.controller');

const router = express.Router();

router.patch('/:id/observations', authenticate, authorize('Admin', 'Coach'), asyncHandler(controller.updateClientObservations));

module.exports = router;
