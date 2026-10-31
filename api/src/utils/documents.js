const Document = require('../models/document.model');
const DocumentAccessLog = require('../models/document-access-log.model');
const User = require('../models/user.model');
const HttpError = require('./http-error');
const storage = require('./storage');
const { resolveTenant } = require('./tenant');
const { isOwner, canSeeMember } = require('./members');

const { STAFF_CATEGORIES, CLIENT_CATEGORIES } = Document;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const EXTENSIONS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const LEGACY_PREFIX = '/uploads/documents/';

// The declared type of an upload is not trusted: the file's first bytes decide.
function detectFileType(buffer) {
  if (!buffer || buffer.length < 8) return null;
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

function isStaffMember(member) {
  return Boolean(member) && (isOwner(member) || member.gyms.some((gym) => gym.roles.length > 0));
}

// Staff categories belong to people who work in the organization, client ones to its clients.
function documentKind(category, ownerMember) {
  if (STAFF_CATEGORIES.includes(category)) {
    if (!isStaffMember(ownerMember)) throw new HttpError(400, 'Esa categoría solo aplica al personal.');
    return 'staff';
  }
  if (CLIENT_CATEGORIES.includes(category)) {
    if (!ownerMember?.roles.includes('Cliente')) throw new HttpError(400, 'Esa categoría solo aplica a clientes.');
    return 'client';
  }
  return isStaffMember(ownerMember) ? 'staff' : 'client';
}

function isOwnDocument(req, document) {
  return String(document.ownerId?._id ?? document.ownerId) === String(req.user._id);
}

// Least privilege: owners and managers see staff files of the gyms they run (owners' files only owners),
// reception and managers see client documents, coaches see none but their own.
function canViewDocument(req, document, ownerMember) {
  if (isOwnDocument(req, document)) return true;
  const tenant = req.tenant;
  if (!tenant || String(tenant.organizationId) !== String(document.organizationId)) return false;
  if (document.kind === 'client') return ['Admin', 'Recepcion'].includes(tenant.role);
  if (tenant.role !== 'Admin') return false;
  return ownerMember ? canSeeMember(req, ownerMember) : isOwner(req.tenantContext.member);
}

function canReviewDocument(req, document, ownerMember) {
  return !isOwnDocument(req, document) && canViewDocument(req, document, ownerMember);
}

// Uploading for someone else is for owners and managers only.
function canUploadFor(req, ownerMember, kind) {
  if (String(ownerMember.userId) === String(req.user._id)) return true;
  if (resolveTenant(req).role !== 'Admin') return false;
  return kind === 'client' || canSeeMember(req, ownerMember);
}

function requestInfo(req) {
  return { ip: String(req.ip ?? '').slice(0, 64), userAgent: String(req.get?.('user-agent') ?? '').slice(0, 300) };
}

async function logDocumentAction(req, document, action, { session } = {}) {
  await DocumentAccessLog.create([{
    documentId: document._id,
    ownerId: document.ownerId?._id ?? document.ownerId,
    organizationId: document.organizationId,
    actorId: req.user._id,
    action,
    ...requestInfo(req),
  }], { session });
}

function cleanFileName(name, mimeType) {
  // Multer reads multipart names as latin1; browsers and phones send UTF-8.
  const decoded = Buffer.from(String(name ?? ''), 'latin1').toString('utf8');
  const cleaned = decoded.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 200);
  return cleaned || `documento.${EXTENSIONS[mimeType]}`;
}

// Checks the file, sends it to R2 and records it. The key never contains anything the client chose.
async function storeDocument(req, { ownerMember, file, category, legacy = false }) {
  const mimeType = detectFileType(file?.buffer);
  if (!mimeType) throw new HttpError(400, 'El archivo no es un PDF, JPG o PNG válido.');
  if (legacy && mimeType !== 'application/pdf') throw new HttpError(400, 'Solo se permiten archivos PDF.');

  const kind = documentKind(category, ownerMember);
  const document = new Document({
    organizationId: ownerMember.organizationId,
    ownerId: ownerMember.userId,
    kind,
    category,
    originalName: cleanFileName(file.originalname, mimeType),
    mimeType,
    size: file.size ?? file.buffer.length,
    uploadedBy: req.user._id,
  });
  document.key = `org/${document.organizationId}/users/${document.ownerId}/${document._id}.${EXTENSIONS[mimeType]}`;
  if (legacy) document.legacyPath = `${LEGACY_PREFIX}${document._id}.pdf`;
  await document.validate();

  await storage.putObject(document.key, file.buffer, mimeType);
  await document.save();
  await logDocumentAction(req, document, 'upload');
  return document;
}

// Destroys the file in R2 for good; the record and its log stay, marked as purged.
async function purgeDocument(req, document) {
  if (document.purgedAt) return;
  await storage.deleteObject(document.key);
  const now = new Date();
  document.purgedAt = now;
  document.deletedAt ??= now;
  document.deletedBy ??= req.user._id;
  await document.save();
  if (document.legacyPath) await User.updateOne({ _id: document.ownerId }, { $pull: { documents: document.legacyPath } });
  await logDocumentAction(req, document, 'purge');
}

// pdfFiles on the dashboard's user forms: each PDF becomes an 'other' document reachable by its old-style path.
async function storeLegacyUploads(req, ownerMember) {
  const paths = [];
  for (const file of req.files ?? []) {
    const document = await storeDocument(req, { ownerMember, file, category: 'other', legacy: true });
    paths.push(document.legacyPath);
  }
  return paths;
}

// The dashboard sends back the whole User.documents list; it may only drop paths, never add new ones.
// Dropped paths hide their document, as any staff deletion does; another organization's documents stay.
async function applyLegacyDocumentList(req, user, requested) {
  const current = user.documents ?? [];
  const removed = current.filter((path) => !requested.includes(path));
  const documents = removed.length > 0 ? await Document.find({ legacyPath: { $in: removed }, ownerId: user._id }) : [];
  const organizationId = String(resolveTenant(req).organizationId);
  const elsewhere = new Set(documents.filter((document) => String(document.organizationId) !== organizationId).map((document) => document.legacyPath));
  for (const document of documents) {
    if (elsewhere.has(document.legacyPath) || document.deletedAt) continue;
    document.deletedAt = new Date();
    document.deletedBy = req.user._id;
    await document.save();
    await logDocumentAction(req, document, 'delete');
  }
  user.documents = current.filter((path) => requested.includes(path) || elsewhere.has(path));
}

// Whether the client holds a verified, current document of that category with the organization
// (e.g. a student card for a student promotion or plan).
async function hasVerifiedDocument(userId, organizationId, category, { session } = {}) {
  const now = new Date();
  const found = await Document.exists({
    ownerId: userId,
    organizationId,
    category,
    status: 'verified',
    deletedAt: null,
    $or: [{ validUntil: null }, { validUntil: { $gt: now } }],
  }).session(session ?? null);
  return Boolean(found);
}

module.exports = {
  ALLOWED_MIME_TYPES,
  LEGACY_PREFIX,
  detectFileType,
  isStaffMember,
  documentKind,
  isOwnDocument,
  canViewDocument,
  canReviewDocument,
  canUploadFor,
  cleanFileName,
  logDocumentAction,
  storeDocument,
  purgeDocument,
  storeLegacyUploads,
  applyLegacyDocumentList,
  hasVerifiedDocument,
};
