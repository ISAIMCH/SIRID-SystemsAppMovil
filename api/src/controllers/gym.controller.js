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
const { listUserGyms } = require('./auth.controller');

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID de sucursal inválido.');

function serializeGym(gym) {
  return { id: String(gym._id), name: gym.name, address: gym.address ?? '', timezone: gym.timezone, joinCode: gym.joinCode ?? null };
}

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

// The request's gyms with their join codes, for reception to show or print.
async function listGyms(req, res) {
  const gyms = await Gym.find({ _id: { $in: resolveTenant(req).gymIds }, isActive: true }).sort({ createdAt: 1 }).lean();
  res.json({ gyms: gyms.map(serializeGym) });
}

// Only the owner opens gyms, up to the limit SIRID set for the organization.
async function createGym(req, res) {
  const { organizationId } = resolveTenant(req);
  if (!isOwner(req.tenantContext.member)) throw new HttpError(403, 'Solo el propietario puede abrir sucursales.');
  const input = z.object({
    name: z.string().trim().min(2).max(120),
    address: z.string().trim().max(200).transform((value) => value || undefined).optional(),
    timezone: z.string().trim().min(1).max(60).default('America/Mexico_City'),
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

module.exports = { joinGym, listGyms, createGym, regenerateJoinCode, listDevices, createDevice, revokeDevice };
