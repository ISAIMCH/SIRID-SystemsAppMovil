const express = require('express');
const asyncHandler = require('../utils/async-handler');
const controller = require('../controllers/organization.controller');

const router = express.Router();

router.post('/signup', asyncHandler(controller.signupOwner));

module.exports = router;
