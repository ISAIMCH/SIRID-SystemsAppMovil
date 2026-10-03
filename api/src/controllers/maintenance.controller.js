const { z } = require('zod');
const Equipment = require('../models/equipment.model');
const MaintenanceReport = require('../models/maintenance-report.model');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');

const reportInputSchema = z.object({
  equipmentId: z.string().regex(/^[a-f\d]{24}$/i),
  description: z.string().trim().min(5).max(1500),
});

async function createReport(req, res) {
  const input = reportInputSchema.parse(req.body);
  const equipment = await Equipment.findById(input.equipmentId).select('_id');
  if (!equipment) throw new HttpError(404, 'El equipo no existe en el inventario.');

  const report = await MaintenanceReport.create({
    equipment: equipment.id,
    reportedBy: req.user.id,
    description: input.description,
  });
  res.status(201).json({ report });
}

async function listReports(req, res) {
  const query = z.object({ status: z.enum(['pending', 'in_progress', 'resolved']).optional() }).parse(req.query);
  const reports = await MaintenanceReport.find(query.status ? { status: query.status } : {})
    .populate('equipment', 'name zone brand status')
    .populate('reportedBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ reports });
}

async function updateReport(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de reporte inválido.');
  const input = z.object({
    status: z.enum(['in_progress', 'resolved']),
    equipmentStatus: z.enum(['available', 'out_of_service']).optional(),
    adminNote: z.string().trim().max(1000).optional(),
  }).parse(req.body);

  const session = await User.startSession();
  let updatedReport;
  try {
    await session.withTransaction(async () => {
      const report = await MaintenanceReport.findById(req.params.id).session(session);
      if (!report) throw new HttpError(404, 'Reporte no encontrado.');
      if (report.status === 'resolved') throw new HttpError(409, 'El reporte ya está resuelto.');

      const equipmentStatus = input.equipmentStatus
        ?? (input.status === 'resolved' ? 'available' : undefined);
      if (equipmentStatus) {
        const equipment = await Equipment.findById(report.equipment).session(session);
        if (equipment) {
          const delta = equipmentStatus === 'out_of_service' ? 1 : -1;
          equipment.maintenanceQuantity = Math.min(
            equipment.totalQuantity,
            Math.max(0, equipment.maintenanceQuantity + delta),
          );
          await equipment.save({ session });
        }
      }

      report.status = input.status;
      report.adminNote = input.adminNote;
      if (input.status === 'resolved') report.resolvedAt = new Date();
      await report.save({ session });
      updatedReport = report;
    });
  } finally {
    await session.endSession();
  }

  const report = await MaintenanceReport.findById(updatedReport.id)
    .populate('equipment', 'name zone brand status')
    .populate('reportedBy', 'name email')
    .lean();
  res.json({ report });
}

module.exports = { createReport, listReports, updateReport };