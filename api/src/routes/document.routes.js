const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate } = require('../middlewares/auth.middleware');
const controller = require('../controllers/document.controller');

const router = express.Router();

router.get('/documents/:filename', authenticate, asyncHandler(controller.getDocument));

module.exports = router;
