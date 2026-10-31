const { z } = require('zod');
const Document = require('../models/document.model');
const DocumentAccessLog = require('../models/document-access-log.model');
const OrganizationMember = require('../models/organization-member.model');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');
const storage = require('../utils/storage');
const { emitRealtime } = require('../utils/realtime');
const { resolveTenant, organizationFilter } = require('../utils/tenant');
const { isOwner, findOrganizationMember } = require('../utils/members');
const {
  LEGACY_PREFIX,
  canViewDocument,
  canReviewDocument,
  canUploadFor,
  documentKind,
  isOwnDocument,
  logDocumentAction,
  storeDocument,
  purgeDocument,
} = require('../utils/documents');

const { DOCUMENT_CATEGORIES, DOCUMENT_STATUSES } = Document;
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido.');
const optionalId = z.union([objectIdSchema, z.literal('')]).transform((value) => value || undefined).optional();
const LIST_LIMIT = 200;

const uploadSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  // Owners and managers upload for someone else; everyone else uploads their own.
  ownerId: optionalId,
});

const listSchema = z.object({
  ownerId: optionalId,
  kind: z.enum(['staff', 'client']).optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
});

const reviewSchema = z.object({
  status: z.enum(['verified', 'rejected']),
  rejectionReason: z.string().trim().max(300).optional(),
  validUntil: z.union([z.coerce.date(), z.literal(''), z.null()]).transform((value) => value || null).optional(),
}).refine((input) => input.status !== 'rejected' || input.rejectionReason, {
  path: ['rejectionReason'],
  message: 'Indica el motivo del rechazo.',
});

const logsSchema = z.object({
  documentId: optionalId,
  ownerId: optionalId,
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

function serializeDocument(document) {
  const person = (value) => (value && typeof value === 'object' && value.name
    ? { id: String(value._id), name: value.name, lastName: value.lastName, email: value.email }
    : value ? String(value) : null);
  return {
    id: String(document._id),
    owner: person(document.ownerId),
    kind: document.kind,
    category: document.category,
    originalName: document.originalName,
    mimeType: document.mimeType,
    size: document.size,
    status: document.status,
    rejectionReason: document.rejectionReason,
    validUntil: document.validUntil,
    reviewedBy: person(document.reviewedBy),
    reviewedAt: document.reviewedAt,
    uploadedBy: person(document.uploadedBy),
    createdAt: document.createdAt,
  };
}

// Owners and the gym's staff who may review see client documents live; staff files only reach owners.
function notifyDocument(req, document, action) {
  const payload = { action, document: serializeDocument(document) };
  if (document.kind === 'client') {
    emitRealtime(req, 'document-updated', payload, [document.ownerId], { gymId: resolveTenant(req).gymId });
    return;
  }
  const io = req.app?.get('io');
  io?.to([`user:${document.ownerId}`, `org:${document.organizationId}:owners`]).emit('document-updated', payload);
}

function findOwnerMember(document) {
  return OrganizationMember.findOne({ userId: document.ownerId, organizationId: document.organizationId, isActive: true }).lean();
}

// A document the requester may see; anything else is reported as not found.
async function loadVisibleDocument(req, id) {
  const document = await Document.findOne({ _id: objectIdSchema.parse(id), deletedAt: null });
  if (!document) throw new HttpError(404, 'Documento no encontrado.');
  const ownerMember = isOwnDocument(req, document) ? null : await findOwnerMember(document);
  if (!canViewDocument(req, document, ownerMember)) throw new HttpError(404, 'Documento no encontrado.');
  return { document, ownerMember };
}

async function uploadDocument(req, res) {
  const input = uploadSchema.parse(req.body ?? {});
  if (!req.file) throw new HttpError(400, 'Adjunta el archivo en el campo "file".');
  const ownerId = input.ownerId ?? String(req.user._id);
  const ownerMember = await findOrganizationMember(req, ownerId);
  if (!ownerMember) throw new HttpError(404, 'Usuario no encontrado.');
  if (!canUploadFor(req, ownerMember, documentKind(input.category, ownerMember))) {
    throw new HttpError(403, 'No tienes permiso para subir documentos de este usuario.');
  }
  const document = await storeDocument(req, { ownerMember, file: req.file, category: input.category });
  notifyDocument(req, document, 'created');
  res.status(201).json({ document: serializeDocument(document) });
}

async function listMyDocuments(req, res) {
  const documents = await Document.find({ ownerId: req.user._id, ...organizationFilter(req), deletedAt: null })
    .populate('reviewedBy', 'name lastName')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ documents: documents.map(serializeDocument) });
}

// Staff view: reception only reaches client documents; managers only the staff of their gyms.
async function listDocuments(req, res) {
  const input = listSchema.parse(req.query);
  const tenant = resolveTenant(req);
  if (tenant.role !== 'Admin' && input.kind === 'staff') return res.json({ documents: [] });
  const filter = { ...organizationFilter(req), deletedAt: null };
  if (input.ownerId) filter.ownerId = input.ownerId;
  if (input.category) filter.category = input.category;
  if (input.status) filter.status = input.status;
  if (input.kind) filter.kind = input.kind;
  if (tenant.role !== 'Admin') filter.kind = 'client';

  const documents = await Document.find(filter)
    .populate('ownerId', 'name lastName email')
    .populate('reviewedBy', 'name lastName')
    .populate('uploadedBy', 'name lastName')
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean();
  const staffOwnerIds = [...new Set(documents.filter((document) => document.kind === 'staff').map((document) => String(document.ownerId?._id ?? document.ownerId)))];
  const members = staffOwnerIds.length
    ? await OrganizationMember.find({ userId: { $in: staffOwnerIds }, organizationId: tenant.organizationId, isActive: true }).lean()
    : [];
  const memberByUser = new Map(members.map((member) => [String(member.userId), member]));
  const visible = documents.filter((document) => canViewDocument(req, document, memberByUser.get(String(document.ownerId?._id ?? document.ownerId))));
  res.json({ documents: visible.map(serializeDocument) });
}

// A short-lived link straight to R2; every one handed out is logged.
async function getDocumentUrl(req, res) {
  const { document } = await loadVisibleDocument(req, req.params.id);
  const download = ['1', 'true'].includes(String(req.query.download));
  const link = await storage.signedUrl(document.key, { filename: document.originalName, contentType: document.mimeType, download });
  await logDocumentAction(req, document, download ? 'download' : 'view');
  res.json(link);
}

async function reviewDocument(req, res) {
  const input = reviewSchema.parse(req.body ?? {});
  const { document, ownerMember } = await loadVisibleDocument(req, req.params.id);
  if (!canReviewDocument(req, document, ownerMember)) throw new HttpError(403, 'No puedes revisar tus propios documentos.');
  document.status = input.status;
  document.reviewedBy = req.user._id;
  document.reviewedAt = new Date();
  document.rejectionReason = input.status === 'rejected' ? input.rejectionReason : '';
  if (input.validUntil !== undefined) document.validUntil = input.validUntil;
  await document.save();
  await logDocumentAction(req, document, input.status === 'verified' ? 'verify' : 'reject');
  notifyDocument(req, document, 'reviewed');
  res.json({ document: serializeDocument(document) });
}

// What the owner may destroy alone: their client documents and files they uploaded themselves.
// Hiring files the gym added (e.g. an evaluation) stay until an owner destroys them.
function ownerMayPurge(req, document) {
  return document.kind === 'client' || String(document.uploadedBy) === String(req.user._id);
}

// The owner deleting their own document destroys the file (LFPDPPP); staff deletions only hide it.
async function deleteDocument(req, res) {
  const { document, ownerMember } = await loadVisibleDocument(req, req.params.id);
  if (isOwnDocument(req, document)) {
    if (!ownerMayPurge(req, document)) throw new HttpError(403, 'Este documento lo administra tu gimnasio; pide al propietario que lo elimine.');
    await purgeDocument(req, document);
  } else {
    if (resolveTenant(req).role !== 'Admin' || !canReviewDocument(req, document, ownerMember)) {
      throw new HttpError(403, 'No tienes permiso para eliminar este documento.');
    }
    document.deletedAt = new Date();
    document.deletedBy = req.user._id;
    await document.save();
    if (document.legacyPath) await User.updateOne({ _id: document.ownerId }, { $pull: { documents: document.legacyPath } });
    await logDocumentAction(req, document, 'delete');
  }
  notifyDocument(req, document, 'deleted');
  res.json({ document: serializeDocument(document) });
}

async function purgeAll(req, filter) {
  const documents = await Document.find({ ...filter, purgedAt: null });
  for (const document of documents) await purgeDocument(req, document);
  return documents.length;
}

// The client's request to delete their data: every client file they own, in every organization, hidden ones included.
async function purgeMyDocuments(req, res) {
  res.json({ purged: await purgeAll(req, { ownerId: req.user._id, kind: 'client' }) });
}

// The same request received in person; only an owner may carry it out, for former members too.
async function purgeUserDocuments(req, res) {
  if (!isOwner(req.tenantContext.member)) throw new HttpError(403, 'Solo el propietario puede destruir documentos.');
  const userId = objectIdSchema.parse(req.params.userId);
  if (!(await OrganizationMember.exists({ userId, ...organizationFilter(req) }))) throw new HttpError(404, 'Usuario no encontrado.');
  res.json({ purged: await purgeAll(req, { ownerId: userId, ...organizationFilter(req) }) });
}

async function listDocumentLogs(req, res) {
  if (!isOwner(req.tenantContext.member)) throw new HttpError(403, 'Solo el propietario puede consultar la bitácora.');
  const input = logsSchema.parse(req.query);
  const filter = { ...organizationFilter(req) };
  if (input.documentId) filter.documentId = input.documentId;
  if (input.ownerId) filter.ownerId = input.ownerId;
  const logs = await DocumentAccessLog.find(filter)
    .populate('actorId', 'name lastName email')
    .populate('ownerId', 'name lastName email')
    .populate('documentId', 'originalName category kind')
    .sort({ createdAt: -1 })
    .limit(input.limit)
    .lean();
  res.json({
    logs: logs.map((log) => ({
      id: String(log._id),
      action: log.action,
      actor: log.actorId && { id: String(log.actorId._id), name: log.actorId.name, lastName: log.actorId.lastName, email: log.actorId.email },
      owner: log.ownerId && { id: String(log.ownerId._id), name: log.ownerId.name, lastName: log.ownerId.lastName, email: log.ownerId.email },
      document: log.documentId && { id: String(log.documentId._id), originalName: log.documentId.originalName, category: log.documentId.category, kind: log.documentId.kind },
      ip: log.ip,
      createdAt: log.createdAt,
    })),
  });
}

// The dashboard still opens pdfFiles uploads by their old path; the file is streamed from R2 to keep that contract.
async function getLegacyDocument(req, res) {
  const { filename } = req.params;
  if (!/^[\w-]+\.pdf$/i.test(filename)) throw new HttpError(404, 'Documento no encontrado.');
  const document = await Document.findOne({ legacyPath: `${LEGACY_PREFIX}${filename}`, deletedAt: null });
  if (!document) throw new HttpError(404, 'Documento no encontrado.');
  const ownerMember = isOwnDocument(req, document) ? null : await findOwnerMember(document);
  if (!canViewDocument(req, document, ownerMember)) throw new HttpError(403, 'No tienes permiso para consultar este documento.');

  const body = await storage.getObjectStream(document.key);
  await logDocumentAction(req, document, 'view');
  res.set({
    'Content-Type': document.mimeType,
    'Content-Disposition': storage.contentDisposition(document.originalName, false),
    'Cache-Control': 'private, no-store',
  });
  body.pipe(res);
}

module.exports = {
  serializeDocument,
  uploadDocument,
  listMyDocuments,
  listDocuments,
  getDocumentUrl,
  reviewDocument,
  deleteDocument,
  purgeMyDocuments,
  purgeUserDocuments,
  listDocumentLogs,
  getLegacyDocument,
};
