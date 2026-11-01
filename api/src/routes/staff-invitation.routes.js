const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/staff-invitation.controller');

const router = express.Router();

router.use(authenticate);
// The invited person, from the app or the dashboard, in whatever gym the session is working.
router.get('/me', asyncHandler(controller.listMyStaffInvitations));
router.post('/me/:id/accept', asyncHandler(controller.acceptStaffInvitation));
router.post('/me/:id/reject', asyncHandler(controller.rejectStaffInvitation));
// Owners and managers of the gym, from the dashboard.
router.get('/', authorize('Admin'), asyncHandler(controller.listStaffInvitations));
router.post('/', authorize('Admin'), asyncHandler(controller.createStaffInvitation));
router.post('/:id/cancel', authorize('Admin'), asyncHandler(controller.cancelStaffInvitation));

module.exports = router;
