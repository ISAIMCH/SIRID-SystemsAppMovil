const mongoose = require('mongoose');
const { z } = require('zod');
const HistoryShare = require('../models/history-share.model');
const HistoryAccessLog = require('../models/history-access-log.model');
const WorkoutSession = require('../models/workout-session.model');
const Routine = require('../models/routine.model');
const User = require('../models/user.model');
const Organization = require('../models/organization.model');
const Gym = require('../models/gym.model');
const HttpError = require('../utils/http-error');
const { resolveTenant } = require('../utils/tenant');
const { findClientMember, isAssignedCoach, coachClientIds } = require('../utils/members');
const { emitToOrganizationStaff } = require('../utils/realtime');
const { sessionResponse } = require('./workout.controller');
const { routineResponse } = require('./routine.controller');

// After the client rejects or revokes, the gym waits this long before asking again.
const REQUEST_COOLDOWN_DAYS = 30;
const HISTORY_LIMIT = 200;

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido.');

const nameOf = (person) => (person ? [person.name, person.lastName].filter(Boolean).join(' ') : null);

function serializeShare(share) {
  // Populated references are objects; bare ids (ObjectId also has an _id) are not.
  const ref = (value) => (value && typeof value === 'object' && !(value instanceof mongoose.Types.ObjectId) ? value : null);
  return {
    id: String(share._id),
    status: share.status,
    includeSensitive: share.includeSensitive,
    requestedAt: share.requestedAt,
    respondedAt: share.respondedAt,
    revokedAt: share.revokedAt,
    clientId: String(ref(share.userId)?._id ?? share.userId),
    ...(ref(share.userId) ? { clientName: nameOf(share.userId) } : {}),
    gym: { id: String(ref(share.gymId)?._id ?? share.gymId), name: ref(share.gymId)?.name ?? null },
    organization: { id: String(ref(share.organizationId)?._id ?? share.organizationId), name: ref(share.organizationId)?.name ?? null },
    requestedBy: ref(share.requestedBy) ? { id: String(share.requestedBy._id), name: nameOf(share.requestedBy) } : null,
  };
}

const SHARE_REFERENCES = [
  { path: 'gymId', select: 'name' },
  { path: 'organizationId', select: 'name' },
  { path: 'requestedBy', select: 'name lastName' },
];

// Status changes reach the gym's staff (so a revoked history disappears at once) and the client's other devices.
function notifyShareChange(req, share) {
  emitToOrganizationStaff(req, share.organizationId?._id ?? share.organizationId, 'history-share:updated', {
    id: String(share._id),
    clientId: String(share.userId?._id ?? share.userId),
    gymId: String(share.gymId?._id ?? share.gymId),
    status: share.status,
    includeSensitive: share.includeSensitive,
  }, [share.userId]);
}

function cooldownEnd(share) {
  const closedAt = share.status === 'revoked' ? share.revokedAt : share.respondedAt;
  return closedAt ? new Date(closedAt.getTime() + REQUEST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) : null;
}

// The gym the request is for: the selected one, or the one named in the body when the user sees several.
function requestGym(req, gymId) {
  const tenant = resolveTenant(req);
  if (gymId) {
    const gym = tenant.gymIds.find((id) => String(id) === String(gymId));
    if (!gym) throw new HttpError(403, 'No tienes acceso a esa sucursal.');
    return gym;
  }
  if (tenant.gymIds.length !== 1) throw new HttpError(400, 'Elige la sucursal que solicita el historial.');
  return tenant.gymIds[0];
}

// Owners and managers reach every client of the organization; a Coach only the clients assigned to them.
async function findReachableClient(req, clientId) {
  const member = await findClientMember(req, clientId);
  if (resolveTenant(req).role === 'Coach' && !isAssignedCoach(member, req.user.id)) throw new HttpError(404, 'Cliente no encontrado.');
  return member;
}

// Staff of a gym ask the client for their history; the client answers in the app.
async function requestHistoryShare(req, res) {
  const input = z.object({
    clientId: objectIdSchema,
    gymId: z.union([objectIdSchema, z.literal('')]).transform((value) => value || undefined).optional(),
  }).parse(req.body);
  const { organizationId } = resolveTenant(req);
  const gymId = requestGym(req, input.gymId);
  await findReachableClient(req, input.clientId);

  const existing = await HistoryShare.findOne({ userId: input.clientId, gymId });
  if (existing?.status === 'pending') throw new HttpError(409, 'Ya hay una solicitud pendiente para esta sucursal.');
  if (existing?.status === 'approved') throw new HttpError(409, 'El cliente ya comparte su historial con esta sucursal.');
  const retryAt = existing && cooldownEnd(existing);
  if (retryAt && retryAt > new Date()) {
    throw new HttpError(409, `El cliente respondió hace poco. Podrás volver a solicitarlo a partir del ${retryAt.toLocaleDateString('es-MX')}.`, {
      code: 'history_share_cooldown',
      retryAt,
    });
  }

  const share = existing ?? new HistoryShare({ userId: input.clientId, organizationId, gymId });
  share.set({ status: 'pending', requestedBy: req.user._id, requestedAt: new Date(), includeSensitive: false, respondedAt: null, revokedAt: null });
  await share.save();
  notifyShareChange(req, share);

  await share.populate([...SHARE_REFERENCES, { path: 'userId', select: 'name lastName' }]);
  res.status(existing ? 200 : 201).json({ share: serializeShare(share) });
}

// The requests of the request's gyms, optionally for one client.
async function listHistoryShares(req, res) {
  const { clientId } = z.object({ clientId: objectIdSchema.optional() }).parse(req.query);
  const { organizationId, gymIds, role } = resolveTenant(req);
  const filter = { organizationId, gymId: { $in: gymIds } };
  if (clientId) {
    await findReachableClient(req, clientId);
    filter.userId = clientId;
  } else if (role === 'Coach') {
    filter.userId = { $in: await coachClientIds(req) };
  }
  const shares = await HistoryShare.find(filter).populate([...SHARE_REFERENCES, { path: 'userId', select: 'name lastName' }]).sort({ requestedAt: -1 }).lean();
  res.json({ shares: shares.map(serializeShare) });
}

// The client's history from every organization, while their consent lasts. Each read is logged.
async function getSharedHistory(req, res) {
  const { organizationId, gymIds } = resolveTenant(req);
  const share = await HistoryShare.findOne({
    _id: objectIdSchema.parse(req.params.id),
    organizationId,
    gymId: { $in: gymIds },
  }).populate(SHARE_REFERENCES).lean();
  if (!share) throw new HttpError(404, 'Solicitud no encontrada.');
  if (share.status !== 'approved') throw new HttpError(403, 'El cliente no comparte su historial con esta sucursal.', { code: 'history_share_not_approved', status: share.status });
  await findReachableClient(req, share.userId);

  const [client, sessions, routines] = await Promise.all([
    User.findById(share.userId).select('name lastName weightKg heightCm restrictions').lean(),
    WorkoutSession.find({ user: share.userId }).sort({ completedAt: -1 }).limit(HISTORY_LIMIT).lean(),
    Routine.find({ assignedTo: share.userId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).limit(HISTORY_LIMIT).lean(),
  ]);
  const organizationIds = [...new Set([...sessions, ...routines].map((item) => String(item.organizationId)).filter((id) => id !== 'undefined'))];
  const [organizations, gyms] = await Promise.all([
    Organization.find({ _id: { $in: organizationIds } }).select('name').lean(),
    Gym.find({ _id: { $in: sessions.map((session) => session.gymId).filter(Boolean) } }).select('name').lean(),
  ]);
  const organizationName = new Map(organizations.map((item) => [String(item._id), item.name]));
  const gymName = new Map(gyms.map((item) => [String(item._id), item.name]));
  const origin = (item) => ({
    organization: { id: String(item.organizationId), name: organizationName.get(String(item.organizationId)) ?? null },
    gym: item.gymId ? { id: String(item.gymId), name: gymName.get(String(item.gymId)) ?? null } : null,
  });

  const sections = ['workouts', 'routines', ...(share.includeSensitive ? ['sensitive'] : [])];
  await HistoryAccessLog.create({ shareId: share._id, userId: share.userId, viewerId: req.user._id, organizationId, gymId: share.gymId._id, sections });

  res.json({
    share: serializeShare(share),
    client: { id: String(client?._id ?? share.userId), name: nameOf(client) },
    workouts: sessions.map((session) => ({ ...sessionResponse(session), ...origin(session) })),
    routines: routines.map((routine) => ({ ...routineResponse(routine), ...origin(routine) })),
    sensitive: share.includeSensitive && client
      ? { weightKg: client.weightKg ?? null, heightCm: client.heightCm ?? null, restrictions: client.restrictions ?? '' }
      : null,
  });
}

// Who opened shared histories in the request's gyms (owners and managers).
async function listAccessLogs(req, res) {
  const { clientId } = z.object({ clientId: objectIdSchema.optional() }).parse(req.query);
  const { organizationId, gymIds } = resolveTenant(req);
  const logs = await HistoryAccessLog.find({ organizationId, gymId: { $in: gymIds }, ...(clientId ? { userId: clientId } : {}) })
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('viewerId', 'name lastName')
    .populate('userId', 'name lastName')
    .populate('gymId', 'name')
    .lean();
  res.json({
    logs: logs.map((log) => ({
      id: String(log._id),
      viewer: { id: String(log.viewerId?._id ?? log.viewerId), name: nameOf(log.viewerId) },
      client: { id: String(log.userId?._id ?? log.userId), name: nameOf(log.userId) },
      gym: { id: String(log.gymId?._id ?? log.gymId), name: log.gymId?.name ?? null },
      sections: log.sections,
      createdAt: log.createdAt,
    })),
  });
}

// --- The client, from the app: their requests, answers and who looked. ---

async function listMyHistoryShares(req, res) {
  const shares = await HistoryShare.find({ userId: req.user._id }).populate(SHARE_REFERENCES).sort({ requestedAt: -1 }).lean();
  const order = { pending: 0, approved: 1, rejected: 2, revoked: 3 };
  res.json({ shares: shares.sort((a, b) => order[a.status] - order[b.status]).map(serializeShare) });
}

async function findMyShare(req) {
  const share = await HistoryShare.findOne({ _id: objectIdSchema.parse(req.params.id), userId: req.user._id });
  if (!share) throw new HttpError(404, 'Solicitud no encontrada.');
  return share;
}

async function saveMyShare(req, res, share) {
  await share.save();
  notifyShareChange(req, share);
  await share.populate(SHARE_REFERENCES);
  res.json({ share: serializeShare(share) });
}

// Approving shares workouts and routines; measurements and injuries only with the extra checkbox.
async function approveHistoryShare(req, res) {
  const { includeSensitive } = z.object({ includeSensitive: z.boolean().default(false) }).parse(req.body ?? {});
  const share = await findMyShare(req);
  if (share.status !== 'pending') throw new HttpError(409, 'Esta solicitud ya fue respondida.');
  share.set({ status: 'approved', includeSensitive, respondedAt: new Date() });
  await saveMyShare(req, res, share);
}

async function rejectHistoryShare(req, res) {
  const share = await findMyShare(req);
  if (share.status !== 'pending') throw new HttpError(409, 'Esta solicitud ya fue respondida.');
  share.set({ status: 'rejected', includeSensitive: false, respondedAt: new Date() });
  await saveMyShare(req, res, share);
}

// Takes effect at once: the API checks the consent on every read and the dashboard hides the history live.
async function revokeHistoryShare(req, res) {
  const share = await findMyShare(req);
  if (share.status !== 'approved') throw new HttpError(409, 'Esta sucursal no tiene acceso a tu historial.');
  share.set({ status: 'revoked', includeSensitive: false, revokedAt: new Date() });
  await saveMyShare(req, res, share);
}

// While sharing, the client can add or withdraw the sensitive data on its own.
async function updateHistoryShare(req, res) {
  const { includeSensitive } = z.object({ includeSensitive: z.boolean() }).parse(req.body);
  const share = await findMyShare(req);
  if (share.status !== 'approved') throw new HttpError(409, 'Esta sucursal no tiene acceso a tu historial.');
  share.set({ includeSensitive });
  await saveMyShare(req, res, share);
}

// The client's right to know who looked at their history (ARCO).
async function listMyAccessLogs(req, res) {
  const logs = await HistoryAccessLog.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('viewerId', 'name lastName')
    .populate('gymId', 'name')
    .populate('organizationId', 'name')
    .lean();
  res.json({
    logs: logs.map((log) => ({
      id: String(log._id),
      viewerName: nameOf(log.viewerId),
      gym: { id: String(log.gymId?._id ?? log.gymId), name: log.gymId?.name ?? null },
      organization: { id: String(log.organizationId?._id ?? log.organizationId), name: log.organizationId?.name ?? null },
      sections: log.sections,
      createdAt: log.createdAt,
    })),
  });
}

module.exports = {
  REQUEST_COOLDOWN_DAYS,
  requestHistoryShare,
  listHistoryShares,
  getSharedHistory,
  listAccessLogs,
  listMyHistoryShares,
  approveHistoryShare,
  rejectHistoryShare,
  revokeHistoryShare,
  updateHistoryShare,
  listMyAccessLogs,
};
