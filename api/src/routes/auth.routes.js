const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { pdfUpload } = require('../middlewares/upload.middleware');
const controller = require('../controllers/auth.controller');
const enrollment = require('../controllers/client-enrollment.controller');

const router = express.Router();

router.post('/register', asyncHandler(controller.registerClient));
router.post('/bootstrap-admin', asyncHandler(controller.bootstrapAdmin));
router.post('/login', asyncHandler(controller.login));
router.post('/activate', asyncHandler(enrollment.activateAccount));
// Reception registers clients who come without the app; the full user form stays with Admins (POST /users).
router.post('/clients', authenticate, authorize('Admin', 'Recepcion'), asyncHandler(enrollment.enrollClient));
router.post('/clients/:id/activation-code', authenticate, authorize('Admin', 'Recepcion'), asyncHandler(enrollment.regenerateActivationCode));
router.get('/users', authenticate, authorize('Admin', 'Coach', 'Recepcion'), asyncHandler(controller.listDirectoryUsers));
router.get('/users/:id', authenticate, authorize('Admin', 'Coach', 'Recepcion'), asyncHandler(controller.getDirectoryUser));
router.post('/users', authenticate, authorize('Admin'), pdfUpload.array('pdfFiles', 5), asyncHandler(controller.createManagedUser));
router.put('/users/:id', authenticate, authorize('Admin'), pdfUpload.array('pdfFiles', 5), asyncHandler(controller.updateDirectoryUser));
router.patch('/users/:id', authenticate, authorize('Admin'), pdfUpload.array('pdfFiles', 5), asyncHandler(controller.updateUser));
router.patch('/users/:id/membership', authenticate, authorize('Admin'), asyncHandler(controller.updateMembership));
router.get('/me', authenticate, asyncHandler(controller.getCurrentUser));
router.get('/me/gyms', authenticate, asyncHandler(controller.getMyGyms));
router.get('/me/enrollment-notices', authenticate, asyncHandler(enrollment.listEnrollmentNotices));
router.post('/me/enrollment-notices/:organizationId/dismiss', authenticate, asyncHandler(enrollment.dismissEnrollmentNotice));
router.patch('/me/physical', authenticate, authorize('Cliente'), asyncHandler(controller.updatePhysicalProfile));

module.exports = router;