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

async function findOrganizationMember(req, userId) {
  return OrganizationMember.findOne({ userId, organizationId: resolveTenant(req).organizationId, isActive: true });
}

// A user of the request's organization that the requester may see; anything else is reported as not found.
async function findVisibleMember(req, userId, message = 'Usuario no encontrado.') {
  const member = await findOrganizationMember(req, userId);
  if (!member || !canSeeMember(req, member)) throw new HttpError(404, message);
  return member;
}

async function findClientMember(req, userId, message = 'Cliente no encontrado.') {
  const member = await findOrganizationMember(req, userId);
  if (!member?.roles.includes('Cliente')) throw new HttpError(404, message);
  return member;
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

module.exports = { isOwner, hasGymRole, canSeeMember, findOrganizationMember, findVisibleMember, findClientMember, assertCoachInGyms };
