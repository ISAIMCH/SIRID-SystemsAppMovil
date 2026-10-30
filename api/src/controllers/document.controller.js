const path = require('node:path');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');

const documentsDirectory = path.resolve(__dirname, '../../uploads/documents');

// A document can be read by an Admin, its owner, or the owner's assigned Coach.
function canReadDocument(viewer, owner) {
  if (viewer.role === 'Admin') return true;
  if (String(owner._id) === viewer.id) return true;
  return viewer.role === 'Coach' && String(owner.assignedCoach) === viewer.id;
}

async function getDocument(req, res, next) {
  const { filename } = req.params;
  if (!/^[\w-]+\.pdf$/i.test(filename)) throw new HttpError(404, 'Documento no encontrado.');

  const owner = await User.findOne({ documents: `/uploads/documents/${filename}` }).select('_id assignedCoach').lean();
  if (!owner) throw new HttpError(404, 'Documento no encontrado.');
  if (!canReadDocument(req.user, owner)) throw new HttpError(403, 'No tienes permiso para consultar este documento.');

  res.sendFile(filename, { root: documentsDirectory, headers: { 'Cache-Control': 'private, no-store' } }, (error) => {
    if (!error) return;
    next(error.statusCode === 404 ? new HttpError(404, 'Documento no encontrado.') : error);
  });
}

module.exports = { getDocument, canReadDocument };
