const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/routine-template.controller');

const router = express.Router();

router.use(authenticate, authorize('Admin', 'Coach'));
router.get('/', asyncHandler(controller.listTemplates));
router.post('/', asyncHandler(controller.createTemplate));
router.get('/:id', asyncHandler(controller.getTemplate));
router.patch('/:id', asyncHandler(controller.updateTemplate));
router.delete('/:id', asyncHandler(controller.deleteTemplate));
router.post('/:id/assign', asyncHandler(controller.assignTemplate));

module.exports = router;
