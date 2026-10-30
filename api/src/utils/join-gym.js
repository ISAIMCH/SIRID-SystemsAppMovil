const Gym = require('../models/gym.model');
const Organization = require('../models/organization.model');
const OrganizationMember = require('../models/organization-member.model');
const Membership = require('../models/membership.model');
const HttpError = require('./http-error');
const { JOIN_CODE_LENGTH, normalizeJoinCode } = require('./access-codes');

// The active gym of an active organization that the code belongs to.
async function findGymByJoinCode(value) {
  const joinCode = normalizeJoinCode(value);
  const gym = joinCode.length === JOIN_CODE_LENGTH
    && await Gym.findOne({ joinCode, isActive: true }).select('_id name organizationId').lean();
  const organization = gym && await Organization.findOne({ _id: gym.organizationId, status: 'active' }).select('name').lean();
  if (!organization) throw new HttpError(404, 'El código no corresponde a ningún gimnasio.');
  return { ...gym, organization };
}

// Joining is immediate: the client can use the app there, and enters once reception sells a membership.
// A client who already belongs to the organization keeps their membership; a deactivated member stays out.
async function addClientToGym(userId, gym, { session } = {}) {
  const member = await OrganizationMember.findOne({ userId, organizationId: gym.organizationId }).session(session);
  if (member && !member.isActive) throw new HttpError(403, 'Tu acceso a este gimnasio fue desactivado. Acude a recepción.');
  if (!member) {
    await OrganizationMember.create([{ userId, organizationId: gym.organizationId, roles: ['Cliente'] }], { session });
  } else if (!member.roles.includes('Cliente')) {
    member.roles.push('Cliente');
    await member.save({ session });
  }

  const membership = await Membership.findOne({ userId, organizationId: gym.organizationId }).session(session);
  if (!membership) {
    await Membership.create([{ userId, organizationId: gym.organizationId, homeGymId: gym._id, status: 'pending' }], { session });
  } else if (!membership.homeGymId) {
    membership.homeGymId = gym._id;
    await membership.save({ session });
  }
  return { alreadyMember: Boolean(member?.roles.includes('Cliente')) };
}

module.exports = { findGymByJoinCode, addClientToGym };
