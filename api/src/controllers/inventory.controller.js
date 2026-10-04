const { z } = require('zod');
const Equipment = require('../models/equipment.model');
const HttpError = require('../utils/http-error');

const equipmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  zone: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(80).optional(),
  type: z.enum(['strength', 'cardio']),
  totalQuantity: z.number().int().min(1).max(500),
  maintenanceQuantity: z.number().int().min(0).max(500),
});

// Los equipos anteriores no tienen cantidades; se completan al leerlos.
function serializeEquipment(item) {
  const legacyOut = item.totalQuantity === undefined && item.status === 'out_of_service';
  const totalQuantity = item.totalQuantity ?? 1;
  const maintenanceQuantity = item.maintenanceQuantity ?? (legacyOut ? 1 : 0);
  return {
    _id: item._id,
    name: item.name,
    zone: item.zone,
    brand: item.brand,
    type: item.type ?? (/^cardio$/i.test(item.zone) ? 'cardio' : 'strength'),
    totalQuantity,
    maintenanceQuantity,
    status: totalQuantity - maintenanceQuantity > 0 ? 'available' : 'out_of_service',
  };
}

async function listEquipment(req, res) {
  const equipment = await Equipment.find({}).sort({ zone: 1, name: 1 }).lean();
  res.json({ equipment: equipment.map(serializeEquipment) });
}

async function createEquipment(req, res) {
  const input = equipmentSchema.parse(req.body);
  if (input.maintenanceQuantity > input.totalQuantity) {
    throw new HttpError(400, 'Las unidades en mantenimiento no pueden superar el total.');
  }
  const equipment = await Equipment.create(input);
  res.status(201).json({ equipment: serializeEquipment(equipment.toObject()) });
}

async function updateEquipment(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de equipo inválido.');
  const input = equipmentSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const equipment = await Equipment.findById(req.params.id);
  if (!equipment) throw new HttpError(404, 'Equipo no encontrado.');

  const raw = await Equipment.findById(req.params.id).lean();
  const normalized = serializeEquipment(raw);
  equipment.set({
    ...input,
    totalQuantity: input.totalQuantity ?? normalized.totalQuantity,
    maintenanceQuantity: input.maintenanceQuantity ?? normalized.maintenanceQuantity,
  });
  await equipment.save();
  res.json({ equipment: serializeEquipment(equipment.toObject()) });
}

module.exports = { listEquipment, createEquipment, updateEquipment };
