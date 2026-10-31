const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, requirePlatformAdmin } = require('../middlewares/auth.middleware');
const controller = require('../controllers/platform.controller');

// SIRID's master panel: every organization, never the people inside them.
const router = express.Router();

router.use(authenticate, requirePlatformAdmin);
router.get('/organizations', asyncHandler(controller.listOrganizations));
router.get('/organizations/:id', asyncHandler(controller.getOrganization));
router.patch('/organizations/:id/status', asyncHandler(controller.updateOrganizationStatus));
router.patch('/organizations/:id', asyncHandler(controller.updateOrganization));

module.exports = router;
