const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/exercise.controller');
const catalog = require('../controllers/exercise-dictionary.controller');

const router = express.Router();

router.use(authenticate);
// Clients read an exercise's steps from their own routine.
router.get('/catalog/:id', authorize('Admin', 'Coach', 'Cliente'), asyncHandler(catalog.getCatalogExercise));
router.use(authorize('Admin', 'Coach'));
router.get('/', asyncHandler(controller.getExercises));
router.get('/catalog', asyncHandler(catalog.getCatalog));
router.post('/', asyncHandler(controller.createExercise));
router.put('/:id', asyncHandler(controller.updateExercise));
router.delete('/:id', asyncHandler(controller.deleteExercise));

module.exports = router;
