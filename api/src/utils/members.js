const OrganizationMember = require('../models/organization-member.model');
const User = require('../models/user.model');
const HttpError = require('./http-error');
const { resolveTenant } = require('./tenant');

function isOwner(member) {
  return member.roles.includes('Propietario');
}

function hasGymRole(member, role, gymIds) {
  const visible = new Set(gymIds.map(String));
  return member.gyms.some((gym) => visible.has(String(gym.gymId)) && gym.roles.includes(role));
}

// Clients belong to the whole organization; staff are visible in the gyms of the request; owners only to owners.
function canSeeMember(req, member) {
  if (member.roles.includes('Cliente')) return true;
  if (isOwner(member)) return isOwner(req.tenantContext.member);
  const visible = new Set(resolveTenant(req).gymIds.map(String));
  return member.gyms.some((gym) => visible.has(String(gym.gymId)));
}

// Inactive members are former staff of the organization; only the users directory still reaches them.
async function findOrganizationMember(req, userId, { includeInactive = false } = {}) {
  return OrganizationMember.findOne({ userId, organizationId: resolveTenant(req).organizationId, ...(includeInactive ? {} : { isActive: true }) });
}

// A user of the request's organization that the requester may see; anything else is reported as not found.
async function findVisibleMember(req, userId, message = 'Usuario no encontrado.', options = {}) {
  const member = await findOrganizationMember(req, userId, options);
  if (!member || !canSeeMember(req, member)) throw new HttpError(404, message);
  return member;
}

async function findClientMember(req, userId, message = 'Cliente no encontrado.') {
  const member = await findOrganizationMember(req, userId);
  if (!member?.roles.includes('Cliente')) throw new HttpError(404, message);
  return member;
}

// Whether the member (a client of the request's organization) is assigned to that Coach there.
function isAssignedCoach(member, coachId) {
  const assigned = member?.assignedCoach?._id ?? member?.assignedCoach;
  return Boolean(assigned) && String(assigned) === String(coachId);
}

// The Coach's clients in the request's organization.
async function coachClientIds(req) {
  return OrganizationMember.find({ organizationId: resolveTenant(req).organizationId, assignedCoach: req.user.id, isActive: true }).distinct('userId');
}

// A Coach the client can be assigned to: active and coaching in one of the request's gyms.
async function assertCoachInGyms(req, coachId) {
  const [member, isActiveUser] = await Promise.all([
    findOrganizationMember(req, coachId),
    User.exists({ _id: coachId, isActive: true }),
  ]);
  if (!member || !isActiveUser || !hasGymRole(member, 'Coach', resolveTenant(req).gymIds)) {
    throw new HttpError(400, 'El Coach asignado no existe o está inactivo.');
  }
}

// Staff roles replace the member's roles in one gym; Cliente leaves the staff of every gym.
function applyRoles(member, roles, gymId) {
  if (isOwner(member)) throw new HttpError(409, 'El rol del propietario no se cambia desde aquí.');
  if (roles.includes('Cliente')) {
    member.roles = ['Cliente'];
    member.gyms = [];
    return;
  }
  member.roles = member.roles.filter((item) => item !== 'Cliente');
  member.gyms = [
    ...member.gyms.filter((assignment) => String(assignment.gymId) !== String(gymId)),
    { gymId, roles },
  ];
}

// Managers are handled by the owner: a Gerente can't grant Gerente, change a manager's roles or edit another manager.
function assertCanManage(req, member, roles) {
  if (isOwner(req.tenantContext.member)) return;
  const isManager = member?.gyms.some((assignment) => assignment.roles.includes('Gerente'));
  const isSelf = member && String(member.userId) === String(req.user.id);
  if (roles?.includes('Gerente') || (isManager && (roles || !isSelf))) {
    throw new HttpError(403, 'Solo el propietario gestiona a los gerentes.');
  }
}

// Whether the account is used only in this organization; otherwise its email and password belong to its holder.
async function belongsOnlyTo(user, organizationId) {
  if (user.isPlatformAdmin) return false;
  return !await OrganizationMember.exists({ userId: user._id, organizationId: { $ne: organizationId }, isActive: true });
}

// (De)activates the person in this organization only. The account follows when no other organization uses it,
// so someone who only worked here can't sign in anymore, and someone shared with other gyms keeps their access there.
async function setMemberActive(user, member, isActive) {
  if (isOwner(member)) throw new HttpError(409, 'El propietario no se desactiva desde aquí.');
  member.isActive = isActive;
  if (isActive) user.isActive = true;
  else if (await belongsOnlyTo(user, member.organizationId)) user.isActive = false;
}

module.exports = { applyRoles, assertCanManage, belongsOnlyTo, setMemberActive, isOwner, hasGymRole, isAssignedCoach, coachClientIds, canSeeMember, findOrganizationMember, findVisibleMember, findClientMember, assertCoachInGyms };
