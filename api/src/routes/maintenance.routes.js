const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/maintenance.controller');

const router = express.Router();

router.post('/reports', authenticate, authorize('Cliente'), asyncHandler(controller.createReport));
router.get('/reports/me', authenticate, authorize('Cliente'), asyncHandler(controller.listMyReports));
// Coaches read them (no changes) to plan routines around equipment that is failing.
router.get('/reports', authenticate, authorize('Admin', 'Coach'), asyncHandler(controller.listReports));
router.patch('/reports/:id', authenticate, authorize('Admin'), asyncHandler(controller.updateReport));

module.exports = router;