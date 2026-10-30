const OrganizationMember = require('../models/organization-member.model');
const Organization = require('../models/organization.model');

// Rooms a socket joins, from the user's roles in every organization:
// org:<id>:owners, org:<id>:admins (owners and managers), org:<id>:staff (anyone working there),
// gym:<id>:managers and gym:<id>:reception. Every socket also joins user:<id>.
// SIRID staff join the owner rooms of every organization.
async function realtimeRooms(user) {
  const members = user.isPlatformAdmin
    ? (await Organization.distinct('_id')).map((organizationId) => ({ organizationId, roles: ['Propietario'], gyms: [] }))
    : await OrganizationMember.find({ userId: user._id, isActive: true }).select('organizationId roles gyms').lean();
  const rooms = new Set([`user:${user._id}`]);
  for (const member of members) {
    const organization = `org:${member.organizationId}`;
    const isOwner = member.roles.includes('Propietario');
    if (isOwner) rooms.add(`${organization}:owners`);
    if (isOwner || member.gyms.length > 0) rooms.add(`${organization}:staff`);
    for (const gym of member.gyms) {
      if (gym.roles.includes('Gerente')) rooms.add(`gym:${gym.gymId}:managers`);
      if (gym.roles.includes('Recepcion')) rooms.add(`gym:${gym.gymId}:reception`);
    }
    if (isOwner || member.gyms.some((gym) => gym.roles.includes('Gerente'))) rooms.add(`${organization}:admins`);
  }
  return [...rooms];
}

function toUserRoom(user) {
  const id = user?._id ?? user;
  return id ? `user:${id}` : null;
}

// Sends the event to the given users (ids or populated user documents) and to the request's organization:
// for gym data, its owners plus that gym's managers and reception; otherwise every owner and manager.
function emitRealtime(req, event, payload, users = [], { gymId } = {}) {
  const io = req.app?.get('io');
  if (!io || !req.tenant) return;
  const organization = `org:${req.tenant.organizationId}`;
  const staffRooms = gymId
    ? [`${organization}:owners`, `gym:${gymId}:managers`, `gym:${gymId}:reception`]
    : [`${organization}:admins`];
  io.to([...new Set([...staffRooms, ...users.map(toUserRoom).filter(Boolean)])]).emit(event, payload);
}

// Sends the event to everyone working in the request's organization; only for non-sensitive payloads.
function emitToStaff(req, event, payload) {
  const io = req.app?.get('io');
  if (io && req.tenant) io.to(`org:${req.tenant.organizationId}:staff`).emit(event, payload);
}

module.exports = { realtimeRooms, emitRealtime, emitToStaff };
