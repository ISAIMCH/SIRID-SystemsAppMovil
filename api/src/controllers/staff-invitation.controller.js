const { z } = require('zod');
const StaffInvitation = require('../models/staff-invitation.model');
const OrganizationMember = require('../models/organization-member.model');
const { GYM_ROLES } = require('../models/organization-member.model');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');
const withTransaction = require('../utils/transaction');
const { resolveTenant } = require('../utils/tenant');
const { applyRoles, assertCanManage } = require('../utils/members');
const { emitToOrganizationStaff } = require('../utils/realtime');

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido.');

// The same answer whether the account exists or not, so inviting never tells who uses GymGo.
const SENT_MESSAGE = 'Si la cuenta existe, verá la invitación al iniciar sesión. Vence en 7 días.';

const nameOf = (person) => (person ? [person.name, person.lastName].filter(Boolean).join(' ') : null);

function invitationStatus(invitation, now = new Date()) {
  return invitation.status === 'pending' && invitation.expiresAt <= now ? 'expired' : invitation.status;
}

function serializeInvitation(invitation) {
  const ref = (value) => (value?.name !== undefined ? value : null);
  return {
    id: String(invitation._id),
    email: invitation.email,
    roles: invitation.roles,
    status: invitationStatus(invitation),
    gym: { id: String(invitation.gymId?._id ?? invitation.gymId), name: ref(invitation.gymId)?.name ?? null },
    organization: { id: String(invitation.organizationId?._id ?? invitation.organizationId), name: ref(invitation.organizationId)?.name ?? null },
    invitedBy: ref(invitation.invitedBy) ? { id: String(invitation.invitedBy._id), name: nameOf(invitation.invitedBy) } : null,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    respondedAt: invitation.respondedAt,
  };
}

const INVITATION_REFERENCES = [
  { path: 'gymId', select: 'name isActive' },
  { path: 'organizationId', select: 'name status' },
  { path: 'invitedBy', select: 'name lastName' },
];

// Reaches the organization's staff (who see the list change) and the invited account, without the email.
function notifyInvitationChange(req, invitation, users = []) {
  emitToOrganizationStaff(req, invitation.organizationId?._id ?? invitation.organizationId, 'staff-invitation:updated', {
    id: String(invitation._id),
    gymId: String(invitation.gymId?._id ?? invitation.gymId),
    status: invitationStatus(invitation),
  }, users);
}

// The gym the invitation is for: the selected one, or the one named in the body when the user sees several.
function invitationGym(req, gymId) {
  const tenant = resolveTenant(req);
  if (gymId) {
    const gym = tenant.gymIds.find((id) => String(id) === String(gymId));
    if (!gym) throw new HttpError(403, 'No tienes acceso a esa sucursal.');
    return gym;
  }
  if (tenant.gymIds.length !== 1) throw new HttpError(400, 'Elige la sucursal a la que invitas.');
  return tenant.gymIds[0];
}

// People already in the organization change roles from Editar; Cliente stays a role of its own there.
async function assertNotMember(organizationId, user) {
  const member = user && await OrganizationMember.findOne({ userId: user._id, organizationId, isActive: true }).lean();
  if (!member) return;
  if (member.roles.includes('Propietario')) throw new HttpError(409, 'Esa persona es propietaria de esta organización.');
  if (member.roles.includes('Cliente')) throw new HttpError(409, 'Esa persona ya es cliente aquí: cambia sus roles desde Editar.');
  throw new HttpError(409, 'Esa persona ya forma parte del staff: cambia sus roles o su sucursal desde Editar.');
}

// --- Owners and managers, from the dashboard. ---

async function createStaffInvitation(req, res) {
  const input = z.object({
    email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()),
    roles: z.array(z.enum(GYM_ROLES)).min(1).refine((roles) => new Set(roles).size === roles.length, 'No repitas roles.'),
    gymId: z.union([objectIdSchema, z.literal('')]).transform((value) => value || undefined).optional(),
  }).parse(req.body);
  const { organizationId } = resolveTenant(req);
  const gymId = invitationGym(req, input.gymId);
  assertCanManage(req, null, input.roles);

  const user = await User.findOne({ email: input.email }).select('_id').lean();
  await assertNotMember(organizationId, user);

  const open = await StaffInvitation.findOne({ gymId, email: input.email, status: 'pending' });
  if (open && invitationStatus(open) === 'pending') throw new HttpError(409, 'Ya hay una invitación pendiente para ese correo en esta sucursal.');
  if (open) {
    open.status = 'expired';
    await open.save();
  }

  const invitation = await StaffInvitation.create({ organizationId, gymId, email: input.email, roles: input.roles, invitedBy: req.user._id });
  notifyInvitationChange(req, invitation, user ? [user._id] : []);
  await invitation.populate(INVITATION_REFERENCES);
  res.status(201).json({ invitation: serializeInvitation(invitation), message: SENT_MESSAGE });
}

// The invitations of the request's gyms, newest first.
async function listStaffInvitations(req, res) {
  const { organizationId, gymIds } = resolveTenant(req);
  const invitations = await StaffInvitation.find({ organizationId, gymId: { $in: gymIds } })
    .populate(INVITATION_REFERENCES)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  res.json({ invitations: invitations.map((invitation) => serializeInvitation(invitation)) });
}

async function cancelStaffInvitation(req, res) {
  const { organizationId, gymIds } = resolveTenant(req);
  const invitation = await StaffInvitation.findOne({ _id: objectIdSchema.parse(req.params.id), organizationId, gymId: { $in: gymIds } });
  if (!invitation) throw new HttpError(404, 'Invitación no encontrada.');
  if (invitationStatus(invitation) !== 'pending') throw new HttpError(409, 'La invitación ya no está pendiente.');
  assertCanManage(req, null, invitation.roles);

  invitation.set({ status: 'cancelled', respondedAt: new Date() });
  await invitation.save();
  const user = await User.findOne({ email: invitation.email }).select('_id').lean();
  notifyInvitationChange(req, invitation, user ? [user._id] : []);
  await invitation.populate(INVITATION_REFERENCES);
  res.json({ invitation: serializeInvitation(invitation) });
}

// --- The invited person, from the app or the dashboard, whatever organization the session works in. ---

const isAvailable = (invitation) => invitation.organizationId?.status === 'active' && invitation.gymId?.isActive !== false;

async function listMyStaffInvitations(req, res) {
  const invitations = await StaffInvitation.find({ email: req.user.email, status: 'pending', expiresAt: { $gt: new Date() } })
    .populate(INVITATION_REFERENCES)
    .sort({ createdAt: -1 })
    .lean();
  res.json({ invitations: invitations.filter(isAvailable).map((invitation) => serializeInvitation(invitation)) });
}

async function findMyPendingInvitation(req) {
  const invitation = await StaffInvitation.findOne({ _id: objectIdSchema.parse(req.params.id), email: req.user.email })
    .populate(INVITATION_REFERENCES);
  if (!invitation) throw new HttpError(404, 'Invitación no encontrada.');
  const status = invitationStatus(invitation);
  if (status === 'expired') throw new HttpError(409, 'La invitación venció. Pide al gimnasio que te invite de nuevo.');
  if (status !== 'pending') throw new HttpError(409, 'Esta invitación ya no está pendiente.');
  if (!isAvailable(invitation)) throw new HttpError(409, 'Este gimnasio no está disponible por ahora.');
  return invitation;
}

// Joins the gym's staff with the invited roles; a former member of the organization comes back.
async function acceptStaffInvitation(req, res) {
  const invitation = await findMyPendingInvitation(req);
  const organizationId = invitation.organizationId._id;
  const gymId = invitation.gymId._id;
  const member = await OrganizationMember.findOne({ userId: req.user._id, organizationId })
    ?? new OrganizationMember({ userId: req.user._id, organizationId, roles: [], gyms: [] });
  if (member.isActive && member.roles.includes('Cliente')) {
    throw new HttpError(409, 'Ya eres cliente de este gimnasio: pide en recepción que cambien tus roles.');
  }
  // A former member comes back with the invited roles only; an active staff member keeps their other gyms.
  // An owner is never invited, and applyRoles refuses one.
  if (!member.isActive) member.set({ roles: [], gyms: [] });
  applyRoles(member, invitation.roles, gymId);
  member.isActive = true;
  invitation.set({ status: 'accepted', respondedAt: new Date(), userId: req.user._id });

  await withTransaction(async (session) => {
    await member.save({ session });
    await invitation.save({ session });
  });
  notifyInvitationChange(req, invitation, [req.user._id]);
  res.json({ invitation: serializeInvitation(invitation) });
}

async function rejectStaffInvitation(req, res) {
  const invitation = await findMyPendingInvitation(req);
  invitation.set({ status: 'rejected', respondedAt: new Date(), userId: req.user._id });
  await invitation.save();
  notifyInvitationChange(req, invitation, [req.user._id]);
  res.json({ invitation: serializeInvitation(invitation) });
}

module.exports = {
  SENT_MESSAGE,
  invitationStatus,
  createStaffInvitation,
  listStaffInvitations,
  cancelStaffInvitation,
  listMyStaffInvitations,
  acceptStaffInvitation,
  rejectStaffInvitation,
};
