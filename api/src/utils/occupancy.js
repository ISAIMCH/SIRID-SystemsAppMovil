const AccessIoT = require('../models/access-iot.model');
const User = require('../models/user.model');

// Clients inside right now: their latest entry or exit in the organization was a check-in at one of `gymIds`.
// Refused attempts do not count. Returns one row per client with the gym and the time they came in.
async function findClientsInside(organizationId, gymIds) {
  const lastEvents = await AccessIoT.aggregate([
    { $match: { organizationId, event: { $in: AccessIoT.PASSAGE_EVENTS } } },
    { $sort: { occurredAt: -1 } },
    { $group: { _id: '$user', event: { $first: '$event' }, gymId: { $first: '$gymId' }, since: { $first: '$occurredAt' } } },
    { $match: { event: 'check-in', gymId: { $in: gymIds } } },
  ]);
  const users = await User.find({ _id: { $in: lastEvents.map((item) => item._id) }, isActive: true, currentlyInside: true })
    .select('name lastName email')
    .lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));
  return lastEvents
    .filter((item) => userById.has(String(item._id)))
    .map((item) => ({ user: userById.get(String(item._id)), gymId: item.gymId, since: item.since }));
}

module.exports = { findClientsInside };
