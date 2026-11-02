const { z } = require('zod');
const Equipment = require('../models/equipment.model');
const MaintenanceReport = require('../models/maintenance-report.model');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');
const { emitToGymCoaches, emitToGymManagers } = require('../utils/realtime');
const { gymFilter, organizationFilter } = require('../utils/tenant');

const REPORT_EQUIPMENT_FIELDS = 'name zone brand status';

function populatedReport(id) {
  return MaintenanceReport.findById(id)
    .populate('equipment', REPORT_EQUIPMENT_FIELDS)
    .populate('reportedBy', 'name email')
    .lean();
}

// Owners and the gym's managers see every report live; the client who reported it follows its status.
// Coaches get the same report with the reporter's name only, as GET /reports gives it to them.
function emitReportUpdate(req, action, report) {
  emitToGymManagers(req, report.organizationId, report.gymId, 'maintenance-updated', { action, report }, [report.reportedBy?._id ?? report.reportedBy]);
  const reporter = report.reportedBy && typeof report.reportedBy === 'object' ? { _id: report.reportedBy._id, name: report.reportedBy.name } : report.reportedBy;
  emitToGymCoaches(req, report.gymId, 'maintenance-updated', { action, report: { ...report, reportedBy: reporter } });
}

const reportInputSchema = z.object({
  equipmentId: z.string().regex(/^[a-f\d]{24}$/i),
  description: z.string().trim().min(5).max(1500),
});

async function createReport(req, res) {
  const input = reportInputSchema.parse(req.body);
  const equipment = await Equipment.findOne({ _id: input.equipmentId, ...gymFilter(req), isDeleted: { $ne: true } }).select('_id organizationId gymId');
  if (!equipment) throw new HttpError(404, 'El equipo no existe en el inventario.');

  const report = await MaintenanceReport.create({
    organizationId: equipment.organizationId,
    gymId: equipment.gymId,
    equipment: equipment.id,
    reportedBy: req.user.id,
    description: input.description,
  });
  emitReportUpdate(req, 'created', await populatedReport(report.id));
  res.status(201).json({ report });
}

async function listReports(req, res) {
  const query = z.object({ status: z.enum(['pending', 'in_progress', 'resolved']).optional() }).parse(req.query);
  // A coach sees who reported it, not their contact details.
  const reporterFields = req.tenant.role === 'Admin' ? 'name email' : 'name';
  const reports = await MaintenanceReport.find({ ...gymFilter(req), ...(query.status ? { status: query.status } : {}) })
    .populate('equipment', REPORT_EQUIPMENT_FIELDS)
    .populate('reportedBy', reporterFields)
    .sort({ createdAt: -1 })
    .lean();
  res.json({ reports });
}

// The client's own reports in the active organization, so they can follow what happened with them.
async function listMyReports(req, res) {
  const reports = await MaintenanceReport.find({ ...organizationFilter(req), reportedBy: req.user.id })
    .populate('equipment', REPORT_EQUIPMENT_FIELDS)
    .sort({ createdAt: -1 })
    .limit(50)
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
      const report = await MaintenanceReport.findOne({ _id: req.params.id, ...gymFilter(req) }).session(session);
      if (!report) throw new HttpError(404, 'Reporte no encontrado.');
      if (report.status === 'resolved') throw new HttpError(409, 'El reporte ya está resuelto.');

      // Each report takes one unit out of service at most and gives back only the unit it took; resolving
      // always gives it back.
      const equipmentStatus = input.status === 'resolved' ? 'available' : input.equipmentStatus;
      const outOfService = equipmentStatus ? equipmentStatus === 'out_of_service' : report.equipmentOutOfService;
      if (outOfService !== report.equipmentOutOfService) {
        const equipment = await Equipment.findOne({ _id: report.equipment, gymId: report.gymId }).session(session);
        if (equipment) {
          equipment.maintenanceQuantity = Math.min(
            equipment.totalQuantity,
            Math.max(0, equipment.maintenanceQuantity + (outOfService ? 1 : -1)),
          );
          await equipment.save({ session });
        }
        report.equipmentOutOfService = outOfService;
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

  const report = await populatedReport(updatedReport.id);
  emitReportUpdate(req, 'updated', report);
  res.json({ report });
}

module.exports = { createReport, listReports, listMyReports, updateReport };