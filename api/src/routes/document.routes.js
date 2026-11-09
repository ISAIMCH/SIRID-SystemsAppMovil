const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../middlewares/subscription.middleware');
const { documentUpload } = require('../middlewares/upload.middleware');
const controller = require('../controllers/document.controller');

// Mounted on /api/uploads: the old paths of pdfFiles uploads.
const legacyRouter = express.Router();
legacyRouter.get('/documents/:filename', authenticate, asyncHandler(controller.getLegacyDocument));

// Mounted on /api/documents. Each handler checks who may see the document (utils/documents.js).
const router = express.Router();
router.use(authenticate);
// Pro plan: reviewing and uploading. Reading, deleting and purging one's own documents stay open (ARCO rights).
const documentsFeature = requireFeature('documents');
router.get('/me', asyncHandler(controller.listMyDocuments));
router.post('/me/purge', asyncHandler(controller.purgeMyDocuments));
router.get('/logs', authorize('Admin'), asyncHandler(controller.listDocumentLogs));
router.post('/users/:userId/purge', authorize('Admin'), asyncHandler(controller.purgeUserDocuments));
router.get('/', authorize('Admin', 'Recepcion'), documentsFeature, asyncHandler(controller.listDocuments));
router.post('/', documentsFeature, documentUpload.single('file'), asyncHandler(controller.uploadDocument));
router.get('/:id/url', asyncHandler(controller.getDocumentUrl));
router.patch('/:id/review', authorize('Admin', 'Recepcion'), documentsFeature, asyncHandler(controller.reviewDocument));
router.delete('/:id', asyncHandler(controller.deleteDocument));

module.exports = { legacyRouter, router };
