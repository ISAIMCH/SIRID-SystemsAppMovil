const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, requirePlatformAdmin } = require('../middlewares/auth.middleware');
const controller = require('../controllers/platform.controller');
const exercises = require('../controllers/platform-exercise.controller');
const { catalogMediaUpload } = require('../middlewares/upload.middleware');

// SIRID's master panel: every organization, never the people inside them.
const router = express.Router();

router.use(authenticate, requirePlatformAdmin);
router.get('/organizations', asyncHandler(controller.listOrganizations));
router.get('/organizations/:id', asyncHandler(controller.getOrganization));
router.patch('/organizations/:id/status', asyncHandler(controller.updateOrganizationStatus));
router.patch('/organizations/:id/subscription', asyncHandler(controller.updateOrganizationSubscription));
router.patch('/organizations/:id', asyncHandler(controller.updateOrganization));

// The global exercise catalog every gym builds routines from.
router.get('/exercises', asyncHandler(exercises.listExercises));
router.post('/exercises', asyncHandler(exercises.createExercise));
router.post('/exercises/media', catalogMediaUpload.single('file'), asyncHandler(exercises.uploadMedia));
router.patch('/exercises/:id', asyncHandler(exercises.updateExercise));

module.exports = router;
