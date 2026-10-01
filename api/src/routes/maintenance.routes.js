const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/maintenance.controller');

const router = express.Router();

router.post('/reports', authenticate, authorize('Cliente'), asyncHandler(controller.createReport));
router.get('/reports', authenticate, authorize('Admin'), asyncHandler(controller.listReports));
router.patch('/reports/:id', authenticate, authorize('Admin'), asyncHandler(controller.updateReport));

module.exports = router;