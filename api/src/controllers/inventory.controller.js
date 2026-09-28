const { z } = require('zod');
const Equipment = require('../models/equipment.model');
const HttpError = require('../utils/http-error');

const equipmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  zone: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(80).optional(),
  status: z.enum(['available', 'busy', 'out_of_service']).default('available'),
  usageFrequency: z.enum(['low', 'medium', 'high']).default('medium'),
});

async function listEquipment(req, res) {
  const equipment = await Equipment.find({}).sort({ zone: 1, name: 1 }).lean();
  res.json({ equipment });
}

async function createEquipment(req, res) {
  const input = equipmentSchema.parse(req.body);
  const equipment = await Equipment.create(input);
  res.status(201).json({ equipment });
}

async function updateEquipment(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de equipo inválido.');
  const input = equipmentSchema.partial().parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const equipment = await Equipment.findByIdAndUpdate(req.params.id, input, {
    new: true,
    runValidators: true,
  });
  if (!equipment) throw new HttpError(404, 'Equipo no encontrado.');
  res.json({ equipment });
}

module.exports = { listEquipment, createEquipment, updateEquipment };