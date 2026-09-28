const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', asyncHandler(controller.registerClient));
router.post('/bootstrap-admin', asyncHandler(controller.bootstrapAdmin));
router.post('/login', asyncHandler(controller.login));
router.get('/users', authenticate, authorize('Admin', 'Coach'), asyncHandler(controller.listDirectoryUsers));
router.get('/users/:id', authenticate, authorize('Admin', 'Coach'), asyncHandler(controller.getDirectoryUser));
router.post('/users', authenticate, authorize('Admin'), asyncHandler(controller.createManagedUser));
router.patch('/users/:id/membership', authenticate, authorize('Admin'), asyncHandler(controller.updateMembership));
router.get('/me', authenticate, asyncHandler(controller.getCurrentUser));

module.exports = router;