const path = require('node:path');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');
const { findOrganizationMember, canSeeMember } = require('../utils/members');

const documentsDirectory = path.resolve(__dirname, '../../uploads/documents');

// A document can be read by its owner, an Admin who can see the owner, or the owner's assigned Coach.
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
  const isOwnDocument = String(owner._id) === req.user.id;
  const ownerMember = !isOwnDocument && req.tenant ? await findOrganizationMember(req, owner._id) : null;
  if (!isOwnDocument && !(ownerMember && canSeeMember(req, ownerMember))) {
    throw new HttpError(403, 'No tienes permiso para consultar este documento.');
  }
  if (!canReadDocument({ id: req.user.id, role: req.tenant?.role }, owner)) throw new HttpError(403, 'No tienes permiso para consultar este documento.');

  res.sendFile(filename, { root: documentsDirectory, headers: { 'Cache-Control': 'private, no-store' } }, (error) => {
    if (!error) return;
    next(error.statusCode === 404 ? new HttpError(404, 'Documento no encontrado.') : error);
  });
}

module.exports = { getDocument, canReadDocument };
