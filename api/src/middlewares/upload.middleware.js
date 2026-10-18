const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const HttpError = require('../utils/http-error');

const documentsDirectory = path.resolve(__dirname, '../../uploads/documents');
fs.mkdirSync(documentsDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: documentsDirectory,
  filename(req, file, callback) {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    callback(null, uniqueName);
  },
});

function fileFilter(req, file, callback) {
  if (file.mimetype !== 'application/pdf') {
    return callback(new HttpError(400, 'Solo se permiten archivos PDF.'), false);
  }
  return callback(null, true);
}

module.exports = multer({
  storage,
  fileFilter,
  limits: { files: 5 },
});
