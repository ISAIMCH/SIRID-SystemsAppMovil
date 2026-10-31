const multer = require('multer');
const HttpError = require('../utils/http-error');
const { ALLOWED_MIME_TYPES } = require('../utils/documents');

// Files stay in memory until they are checked and sent to R2; nothing is written to the server's disk.
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function allowOnly(mimeTypes, message) {
  return function fileFilter(req, file, callback) {
    if (!mimeTypes.includes(file.mimetype)) return callback(new HttpError(400, message), false);
    return callback(null, true);
  };
}

// The dashboard's `pdfFiles` on staff create/edit.
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: allowOnly(['application/pdf'], 'Solo se permiten archivos PDF.'),
  limits: { files: 5, fileSize: MAX_FILE_SIZE },
});

// One document per request in the `file` field. Some phone pickers report image/jpg or a generic type;
// the real type is always read from the file's first bytes (utils/documents.js).
const documentUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: allowOnly([...ALLOWED_MIME_TYPES, 'image/jpg', 'application/octet-stream'], 'Solo se permiten archivos PDF, JPG o PNG.'),
  limits: { files: 1, fileSize: MAX_FILE_SIZE },
});

module.exports = { MAX_FILE_SIZE, pdfUpload, documentUpload };
