const { z } = require('zod');
const Gym = require('../models/gym.model');
const Organization = require('../models/organization.model');
const AccessDevice = require('../models/access-device.model');
const HttpError = require('../utils/http-error');
const withTransaction = require('../utils/transaction');
const { generateJoinCode, generateDeviceKey, hashDeviceKey } = require('../utils/access-codes');
const { findGymByJoinCode, addClientToGym } = require('../utils/join-gym');
const { resolveTenant, resolveTargetGym, gymFilter } = require('../utils/tenant');
const { isOwner } = require('../utils/members');
const { isTimeZone } = require('../utils/timezone');
const { listUserGyms } = require('./auth.controller');

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID de sucursal inválido.');

function serializeGym(gym) {
  return {
    id: String(gym._id),
    name: gym.name,
    address: gym.address ?? '',
    timezone: gym.timezone,
    capacity: gym.capacity ?? null,
    joinCode: gym.joinCode ?? null,
  };
}

const timezoneSchema = z.string().trim().min(1).max(60).refine(isTimeZone, 'Zona horaria inválida. Usa un nombre IANA, por ejemplo America/Mexico_City.');
// Empty or null clears the limit.
const capacitySchema = z.union([z.coerce.number().int().min(1).max(100000), z.literal(''), z.null()])
  .transform((value) => (value === '' ? null : value));

function serializeDevice(device) {
  return {
    id: String(device._id),
    name: device.name,
    gymId: String(device.gymId),
    keyPreview: device.keyPreview,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt,
    createdAt: device.createdAt,
  };
}

// Any signed-in user can join; staff of the organization also become its clients.
async function joinGym(req, res) {
  const { code } = z.object({ code: z.string().trim().min(1).max(20) }).parse(req.body);
  const gym = await findGymByJoinCode(code);
  const { alreadyMember } = await withTransaction((session) => addClientToGym(req.user._id, gym, { session }));
  res.status(alreadyMember ? 200 : 201).json({
    gym: { id: String(gym._id), name: gym.name, organization: { id: String(gym.organizationId), name: gym.organization.name } },
    alreadyMember,
    gyms: await listUserGyms(req.user),
  });
}

// The request's gyms with their join codes, for reception to show or print,
// plus how many gyms the organization has open out of its limit.
async function listGyms(req, res) {
  const { organizationId, gymIds } = resolveTenant(req);
  const [gyms, organization, activeGyms] = await Promise.all([
    Gym.find({ _id: { $in: gymIds }, isActive: true }).sort({ createdAt: 1 }).lean(),
    Organization.findById(organizationId).select('gymLimit').lean(),
    Gym.countDocuments({ organizationId, isActive: true }),
  ]);
  res.json({
    gyms: gyms.map(serializeGym),
    limits: { activeGyms, gymLimit: organization?.gymLimit ?? Organization.DEFAULT_GYM_LIMIT },
  });
}

// Only the owner opens gyms, up to the limit SIRID set for the organization.
async function createGym(req, res) {
  const { organizationId } = resolveTenant(req);
  if (!isOwner(req.tenantContext.member)) throw new HttpError(403, 'Solo el propietario puede abrir sucursales.');
  const input = z.object({
    name: z.string().trim().min(2).max(120),
    address: z.string().trim().max(200).transform((value) => value || undefined).optional(),
    timezone: timezoneSchema.default('America/Mexico_City'),
    capacity: capacitySchema.optional(),
  }).parse(req.body);

  const [organization, activeGyms] = await Promise.all([
    Organization.findById(organizationId).select('gymLimit').lean(),
    Gym.countDocuments({ organizationId, isActive: true }),
  ]);
  const gymLimit = organization?.gymLimit ?? Organization.DEFAULT_GYM_LIMIT;
  if (activeGyms >= gymLimit) {
    throw new HttpError(409, `Tu plan permite ${gymLimit} sucursales. Contacta a SIRID para ampliarlo.`, { code: 'gym_limit_reached', gymLimit });
  }
  if (await Gym.exists({ organizationId, name: input.name })) throw new HttpError(409, 'Ya existe una sucursal con ese nombre.');

  const gym = await Gym.create({ ...input, organizationId });
  res.status(201).json({ gym: serializeGym(gym), gyms: await listUserGyms(req.user) });
}

// Owners edit any gym of the organization; managers the gyms they run. The time zone sets the gym's days and hours
// for plan schedules and attendance, so it changes how both are counted from now on.
async function updateGym(req, res) {
  const gymId = resolveTargetGym(req, objectIdSchema.parse(req.params.id));
  const input = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    address: z.string().trim().max(200).optional(),
    timezone: timezoneSchema.optional(),
    capacity: capacitySchema.optional(),
  }).parse(req.body);

  const gym = await Gym.findOne({ _id: gymId, organizationId: resolveTenant(req).organizationId, isActive: true });
  if (!gym) throw new HttpError(404, 'Sucursal no encontrada.');
  if (input.name && input.name !== gym.name && await Gym.exists({ organizationId: gym.organizationId, name: input.name, _id: { $ne: gym._id } })) {
    throw new HttpError(409, 'Ya existe una sucursal con ese nombre.');
  }
  for (const field of ['name', 'timezone', 'capacity']) {
    if (input[field] !== undefined) gym[field] = input[field];
  }
  if (input.address !== undefined) gym.address = input.address || undefined;
  await gym.save();
  res.json({ gym: serializeGym(gym), gyms: await listUserGyms(req.user) });
}

// The old code stops working at once; clients who already joined are not affected.
async function regenerateJoinCode(req, res) {
  const gymId = resolveTargetGym(req, objectIdSchema.parse(req.params.id));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const gym = await Gym.findByIdAndUpdate(gymId, { $set: { joinCode: generateJoinCode() } }, { new: true }).lean();
      return res.json({ gym: serializeGym(gym) });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  throw new HttpError(503, 'No se pudo generar un código nuevo. Intenta otra vez.');
}

async function listDevices(req, res) {
  const devices = await AccessDevice.find(gymFilter(req)).sort({ revokedAt: 1, createdAt: -1 }).lean();
  res.json({ devices: devices.map(serializeDevice) });
}

// The key is returned only here; the API keeps its hash.
async function createDevice(req, res) {
  const input = z.object({
    name: z.string().trim().min(2).max(80),
    gymId: z.union([objectIdSchema, z.literal('')]).transform((value) => value || undefined).optional(),
  }).parse(req.body);
  const key = generateDeviceKey();
  const device = await AccessDevice.create({
    name: input.name,
    keyHash: hashDeviceKey(key),
    keyPreview: key.slice(0, 16),
    createdBy: req.user._id,
    organizationId: resolveTenant(req).organizationId,
    gymId: resolveTargetGym(req, input.gymId),
  });
  res.status(201).json({ device: serializeDevice(device), key });
}

async function revokeDevice(req, res) {
  const device = await AccessDevice.findOneAndUpdate(
    { _id: objectIdSchema.parse(req.params.id), ...gymFilter(req), revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true },
  ).lean();
  if (!device) throw new HttpError(404, 'Dispositivo no encontrado o ya revocado.');
  res.json({ device: serializeDevice(device) });
}

module.exports = { joinGym, listGyms, createGym, updateGym, regenerateJoinCode, listDevices, createDevice, revokeDevice };
