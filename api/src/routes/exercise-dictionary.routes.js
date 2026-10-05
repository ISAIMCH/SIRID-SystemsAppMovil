const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/exercise-dictionary.controller');

const router = express.Router();

router.use(authenticate, authorize('Admin', 'Coach'));
router.get('/search', asyncHandler(controller.searchExercises));

module.exports = router;
