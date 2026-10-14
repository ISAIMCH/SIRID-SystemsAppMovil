const { z } = require('zod');
const Equipment = require('../models/equipment.model');
const MaintenanceReport = require('../models/maintenance-report.model');
const HttpError = require('../utils/http-error');

const equipmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  zone: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(80).optional(),
  type: z.enum(['strength', 'cardio']).default('strength'),
  totalQuantity: z.coerce.number().int().min(1).max(500).default(1),
  maintenanceQuantity: z.coerce.number().int().min(0).max(500).default(0),
  status: z.enum(['available', 'out_of_service']).default('available'),
});

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID de equipo inválido.');
}

function serializeEquipment(item, activeReportsCount = 0) {
  return {
    _id: item._id,
    name: item.name,
    zone: item.zone,
    brand: item.brand,
    type: item.type,
    totalQuantity: item.totalQuantity,
    maintenanceQuantity: item.maintenanceQuantity,
    status: item.status,
    usageFrequency: item.usageFrequency,
    activeReportsCount,
  };
}

async function getEquipment(req, res) {
  const equipment = await Equipment.find({}).sort({ name: 1 }).lean();
  const activeReports = await MaintenanceReport.aggregate([
    { $match: { status: { $in: ['pending', 'in_progress'] } } },
    { $group: { _id: '$equipment', activeReportsCount: { $sum: 1 } } },
  ]);
  const reportCounts = new Map(activeReports.map((item) => [item._id.toString(), item.activeReportsCount]));

  res.json({
    equipment: equipment.map((item) => ({
      ...serializeEquipment(item, reportCounts.get(item._id.toString()) ?? 0),
    })),
  });
}

async function createEquipment(req, res) {
  const equipment = await Equipment.create(equipmentSchema.parse(req.body));
  res.status(201).json({ equipment: serializeEquipment(equipment.toObject()) });
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
  res.json({ equipment: serializeEquipment(equipment) });
}

async function deleteEquipment(req, res) {
  assertId(req.params.id);
  const equipment = await Equipment.findByIdAndDelete(req.params.id);
  if (!equipment) throw new HttpError(404, 'Equipo no encontrado.');
  res.status(204).end();
}

module.exports = { getEquipment, createEquipment, updateEquipment, deleteEquipment };
