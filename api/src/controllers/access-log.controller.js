const { z } = require('zod');
const AccessIoT = require('../models/access-iot.model');
const Gym = require('../models/gym.model');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');
const { resolveTenant, resolveTargetGym } = require('../utils/tenant');
const { addCalendarDays, localMidnightToUtc } = require('../utils/timezone');
const { findClientsInside } = require('../utils/occupancy');

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD.')
  .refine((value) => new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value, 'La fecha no es válida.');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const personName = (user) => [user?.name, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Cliente';

// The visible gyms, or only the one asked for (it must be one of them).
async function requestGyms(req, gymId) {
  const { organizationId, gymIds } = resolveTenant(req);
  const ids = gymId ? [resolveTargetGym(req, gymId)] : gymIds;
  return Gym.find({ _id: { $in: ids }, organizationId }).select('name timezone capacity').sort({ createdAt: 1 }).lean();
}

// Who is inside each visible gym right now, against its capacity.
async function getOccupancy(req, res) {
  const { organizationId } = resolveTenant(req);
  const gyms = await requestGyms(req);
  const inside = await findClientsInside(organizationId, gyms.map((gym) => gym._id));

  res.json({
    generatedAt: new Date(),
    gyms: gyms.map((gym) => {
      const people = inside
        .filter((item) => String(item.gymId) === String(gym._id))
        .sort((first, second) => second.since - first.since)
        .map((item) => ({ id: String(item.user._id), name: personName(item.user), since: item.since }));
      return {
        id: String(gym._id),
        name: gym.name,
        timezone: gym.timezone,
        capacity: gym.capacity ?? null,
        count: people.length,
        people,
      };
    }),
  });
}

// Day bounds of `from`/`to` (inclusive local dates) in each gym's own time zone.
function dateRangeFilter(gyms, from, to) {
  if (!from && !to) return { gymId: { $in: gyms.map((gym) => gym._id) } };
  return {
    $or: gyms.map((gym) => ({
      gymId: gym._id,
      occurredAt: {
        ...(from && { $gte: localMidnightToUtc(from, gym.timezone) }),
        ...(to && { $lt: localMidnightToUtc(addCalendarDays(to, 1), gym.timezone) }),
      },
    })),
  };
}

// Entries, exits and refused attempts at the visible gyms, newest first.
async function listAccessLogs(req, res) {
  const input = z.object({
    gymId: z.string().regex(/^[a-f\d]{24}$/i, 'Sucursal inválida.').optional(),
    event: z.enum(['check-in', 'check-out', 'denied']).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  }).parse(req.query);
  if (input.from && input.to && input.from > input.to) throw new HttpError(400, 'La fecha inicial no puede ser posterior a la final.');

  const { organizationId } = resolveTenant(req);
  const gyms = await requestGyms(req, input.gymId);
  const filter = { organizationId, ...dateRangeFilter(gyms, input.from, input.to), ...(input.event && { event: input.event }) };
  if (input.search) {
    const pattern = new RegExp(escapeRegex(input.search), 'i');
    const users = await User.find({ $or: [{ name: pattern }, { lastName: pattern }, { email: pattern }] }).select('_id').limit(500).lean();
    filter.user = { $in: users.map((user) => user._id) };
  }

  const [total, entries] = await Promise.all([
    gyms.length ? AccessIoT.countDocuments(filter) : 0,
    gyms.length ? AccessIoT.find(filter)
      .sort({ occurredAt: -1, _id: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .populate('user', 'name lastName email')
      .populate('validatedBy', 'name lastName')
      .populate('accessDevice', 'name')
      .lean() : [],
  ]);
  const gymById = new Map(gyms.map((gym) => [String(gym._id), gym]));

  res.json({
    page: input.page,
    pageSize: input.pageSize,
    total,
    entries: entries.map((entry) => ({
      id: String(entry._id),
      occurredAt: entry.occurredAt,
      event: entry.event,
      source: entry.source,
      reason: entry.event === 'denied' ? { code: entry.reason?.code ?? null, message: entry.reason?.message ?? '' } : null,
      gym: { id: String(entry.gymId), name: gymById.get(String(entry.gymId))?.name ?? '', timezone: gymById.get(String(entry.gymId))?.timezone ?? null },
      client: entry.user ? { id: String(entry.user._id), name: personName(entry.user), email: entry.user.email } : null,
      // Who let them through: a turnstile, a staff member scanning by hand, or the API closing a forgotten check-in.
      validatedBy: entry.validatedBy ? personName(entry.validatedBy) : null,
      device: entry.accessDevice?.name ?? entry.deviceId ?? null,
    })),
  });
}

module.exports = { getOccupancy, listAccessLogs, dateRangeFilter };
