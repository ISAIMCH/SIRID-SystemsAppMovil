const { z } = require('zod');
const Equipment = require('../models/equipment.model');
const Routine = require('../models/routine.model');
const WorkoutSession = require('../models/workout-session.model');
const HttpError = require('../utils/http-error');
const { inferEquipmentCategory } = require('../constants/equipment-families');
const { resolveTenant, resolveTargetGym, organizationFilter, gymFilter } = require('../utils/tenant');

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID de sucursal inválido.');

const MAX_IMAGE_LENGTH = 4 * 1024 * 1024;
const equipmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  zone: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(80).optional(),
  imageUrl: z.string().trim().max(MAX_IMAGE_LENGTH).default(''),
  type: z.enum(['strength', 'cardio']),
  totalQuantity: z.number().int().min(1).max(500),
  maintenanceQuantity: z.number().int().min(0).max(500),
  equipmentCategory: z.string().trim().max(40).optional(),
  // The gym the equipment is in; defaults to the selected or main gym and does not change afterwards.
  gymId: z.union([objectIdSchema, z.literal('')]).transform((value) => value || undefined).optional(),
});

// Los equipos anteriores no tienen cantidades; se completan al leerlos.
function serializeEquipment(item) {
  const legacyOut = item.totalQuantity === undefined && item.status === 'out_of_service';
  const totalQuantity = item.totalQuantity ?? 1;
  const maintenanceQuantity = item.maintenanceQuantity ?? (legacyOut ? 1 : 0);
  return {
    _id: item._id,
    gymId: item.gymId,
    name: item.name,
    zone: item.zone,
    brand: item.brand,
    imageUrl: item.imageUrl ?? '',
    type: item.type ?? (/^cardio$/i.test(item.zone) ? 'cardio' : 'strength'),
    totalQuantity,
    maintenanceQuantity,
    status: totalQuantity - maintenanceQuantity > 0 ? 'available' : 'out_of_service',
    equipmentCategory: item.equipmentCategory ?? inferEquipmentCategory(item),
  };
}

async function listEquipment(req, res) {
  const equipment = await Equipment.find({ ...gymFilter(req), isDeleted: { $ne: true } }).sort({ zone: 1, name: 1 }).lean();
  res.json({ equipment: equipment.map(serializeEquipment) });
}

function currentTrainingTimeSlot(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Mañana';
  if (hour < 18) return 'Tarde';
  return 'Noche';
}

function normalizedValue(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function routineEquipmentReferences(routine, day) {
  const blocks = routine.blocks?.length
    ? routine.blocks.filter((block) => block.day === day)
    : [{ exercises: (routine.exercises ?? []).filter((exercise) => (exercise.day ?? 0) === day) }];
  return blocks.flatMap((block) => block.exercises ?? []).map((exercise) => ({
    id: exercise.equipmentId?._id ?? exercise.equipmentId,
    name: exercise.equipment ?? '',
  }));
}

function equipmentMatches(reference, equipment) {
  return (reference.id && String(reference.id) === String(equipment._id))
    || (reference.name && normalizedValue(reference.name) === normalizedValue(equipment.name));
}

function sessionEquipmentReferences(session) {
  return (session.blocks ?? []).flatMap((block) => block.sets ?? []).flatMap((set) => set.exercises ?? []).map((exercise) => ({
    id: exercise.equipmentId,
    name: '',
  }));
}

async function getEquipmentTraffic(req, res) {
  const now = new Date();
  const today = now.getDay();
  const slot = currentTrainingTimeSlot(now);
  const ninetyMinutesAgo = new Date(now.getTime() - 90 * 60 * 1000);
  const fortyFiveMinutesAgo = new Date(now.getTime() - 45 * 60 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [equipment, routines, sessions] = await Promise.all([
    Equipment.find({ ...gymFilter(req), isDeleted: { $ne: true } }).sort({ zone: 1, name: 1 }).lean(),
    Routine.find({ ...organizationFilter(req), status: 'active', assignedTo: { $ne: null } })
      .populate('assignedTo', 'role isActive currentlyInside preferredTrainingTime availableTrainingDays')
      .lean(),
    WorkoutSession.find({ ...gymFilter(req), completedAt: { $gte: new Date(Math.max(startOfToday.getTime(), ninetyMinutesAgo.getTime())) } })
      .select('completedAt blocks')
      .lean(),
  ]);

  const recentSessions = sessions.filter((session) => session.completedAt >= fortyFiveMinutesAgo);
  return res.json({ traffic: equipment.map((rawEquipment) => {
    const item = serializeEquipment(rawEquipment);
    const usableUnits = Math.max(0, item.totalQuantity - item.maintenanceQuantity);
    if (usableUnits === 0 || item.status === 'out_of_service') {
      return {
        equipmentId: String(item._id), name: item.name, zone: item.zone, usableUnits,
        demandScore: 0, loadFactor: 99, trafficLevel: 'out_of_service', estimatedWaitMinutes: 0,
      };
    }

    let demandScore = 0;
    const insideClients = new Set();
    const preferredClients = new Set();
    for (const routine of routines) {
      const client = routine.assignedTo;
      if (!client || client.role !== 'Cliente' || client.isActive === false) continue;
      const references = routineEquipmentReferences(routine, today);
      if (!references.some((reference) => equipmentMatches(reference, item))) continue;
      const clientKey = String(client._id);
      if (client.currentlyInside && !insideClients.has(clientKey)) {
        insideClients.add(clientKey);
        demandScore += 2;
      }
      if (client.availableTrainingDays?.includes(today)
        && client.preferredTrainingTime === slot && !preferredClients.has(clientKey)) {
        preferredClients.add(clientKey);
        demandScore += 1;
      }
    }

    if (recentSessions.some((session) => sessionEquipmentReferences(session).some((reference) => equipmentMatches(reference, item)))) {
      demandScore += 1.5;
    }

    const loadFactor = demandScore / usableUnits;
    const trafficLevel = loadFactor < 0.8 ? 'free' : loadFactor < 1.6 ? 'moderate' : 'busy';
    const estimatedWaitMinutes = trafficLevel === 'free' ? 0 : trafficLevel === 'moderate' ? 3 : Math.min(15, Math.round(loadFactor * 4));
    return {
      equipmentId: String(item._id), name: item.name, zone: item.zone, usableUnits,
      demandScore, loadFactor, trafficLevel, estimatedWaitMinutes,
    };
  }) });
}

async function createEquipment(req, res) {
  const { gymId, ...input } = equipmentSchema.parse(req.body);
  if (input.maintenanceQuantity > input.totalQuantity) {
    throw new HttpError(400, 'Las unidades en mantenimiento no pueden superar el total.');
  }
  const equipment = await Equipment.create({
    ...input,
    organizationId: resolveTenant(req).organizationId,
    gymId: resolveTargetGym(req, gymId),
    equipmentCategory: inferEquipmentCategory(input),
  });
  res.status(201).json({ equipment: serializeEquipment(equipment.toObject()) });
}

async function updateEquipment(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de equipo inválido.');
  const { gymId: _gymId, ...input } = equipmentSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const equipment = await Equipment.findOne({ _id: req.params.id, ...gymFilter(req), isDeleted: { $ne: true } });
  if (!equipment) throw new HttpError(404, 'Equipo no encontrado.');

  const raw = await Equipment.findOne({ _id: equipment._id }).lean();
  const normalized = serializeEquipment(raw);
  equipment.set({
    ...input,
    equipmentCategory: input.equipmentCategory ?? inferEquipmentCategory({ ...normalized, ...input }),
    totalQuantity: input.totalQuantity ?? normalized.totalQuantity,
    maintenanceQuantity: input.maintenanceQuantity ?? normalized.maintenanceQuantity,
  });
  await equipment.save();
  res.json({ equipment: serializeEquipment(equipment.toObject()) });
}

module.exports = { listEquipment, getEquipmentTraffic, createEquipment, updateEquipment };
