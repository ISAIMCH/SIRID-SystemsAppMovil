const { z } = require('zod');
const Equipment = require('../models/managed-equipment.model');
const HttpError = require('../utils/http-error');

const equipmentSchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  status: z.enum(['operational', 'maintenance', 'broken']).default('operational'),
  lastMaintenance: z.coerce.date().optional(),
  nextMaintenance: z.coerce.date().optional(),
});

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de equipo inválido.');
}

async function getEquipment(req, res) {
  const equipment = await Equipment.find({}).sort({ name: 1 }).lean();
  res.json({ equipment });
}

async function createEquipment(req, res) {
  const equipment = await Equipment.create(equipmentSchema.parse(req.body));
  res.status(201).json({ equipment });
}

async function updateEquipment(req, res) {
  assertId(req.params.id);
  const input = equipmentSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const equipment = await Equipment.findByIdAndUpdate(req.params.id, input, {
    new: true,
    runValidators: true,
  }).lean();
  if (!equipment) throw new HttpError(404, 'Equipo no encontrado.');
  res.json({ equipment });
}

async function deleteEquipment(req, res) {
  assertId(req.params.id);
  const equipment = await Equipment.findByIdAndDelete(req.params.id);
  if (!equipment) throw new HttpError(404, 'Equipo no encontrado.');
  res.status(204).end();
}

module.exports = { getEquipment, createEquipment, updateEquipment, deleteEquipment };
