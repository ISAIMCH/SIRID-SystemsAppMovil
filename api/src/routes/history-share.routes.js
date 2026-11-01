const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/history-share.controller');

// Recepcion never takes part: only owners, managers and Coaches ask for or read a shared history.
const router = express.Router();

router.use(authenticate);
// The client, from the app, in whatever gym the session is working.
router.get('/me', asyncHandler(controller.listMyHistoryShares));
router.get('/me/logs', asyncHandler(controller.listMyAccessLogs));
router.post('/me/:id/approve', asyncHandler(controller.approveHistoryShare));
router.post('/me/:id/reject', asyncHandler(controller.rejectHistoryShare));
router.post('/me/:id/revoke', asyncHandler(controller.revokeHistoryShare));
router.patch('/me/:id', asyncHandler(controller.updateHistoryShare));
// Staff of the gym, from the dashboard.
router.get('/logs', authorize('Admin'), asyncHandler(controller.listAccessLogs));
router.get('/', authorize('Admin', 'Coach'), asyncHandler(controller.listHistoryShares));
router.post('/', authorize('Admin', 'Coach'), asyncHandler(controller.requestHistoryShare));
router.get('/:id/history', authorize('Admin', 'Coach'), asyncHandler(controller.getSharedHistory));

module.exports = router;
