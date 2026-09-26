const { z } = require('zod');
const Routine = require('../models/routine.model');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');

const routineSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  goal: z.string().trim().max(120).optional(),
  level: z.enum(['principiante', 'intermedio', 'avanzado']),
  durationWeeks: z.number().int().min(1).max(52).default(4),
  daysPerWeek: z.number().int().min(1).max(7),
  scheduleDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  assignedTo: z.string().regex(/^[a-f\d]{24}$/i),
  status: z.enum(['active', 'paused']).default('active'),
  exercises: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    muscleGroup: z.string().trim().min(1).max(80),
    equipment: z.string().trim().max(100).optional(),
    sets: z.number().int().min(1).max(50),
    reps: z.string().trim().min(1).max(30),
    suggestedWeight: z.number().min(0).max(1000).optional(),
    restSeconds: z.number().int().min(0).max(3600).default(60),
    order: z.number().int().min(0),
  })).min(1).max(100),
});

async function listRoutines(req, res) {
  let filter = {};
  if (req.user.role === 'Cliente') filter = { assignedTo: req.user.id };
  if (req.user.role === 'Coach') {
    const clientIds = await User.find({ assignedCoach: req.user.id }).distinct('_id');
    filter = { assignedTo: { $in: clientIds } };
  }
  const routines = await Routine.find(filter).sort({ updatedAt: -1 }).lean();
  res.json({ routines });
}

async function createRoutine(req, res) {
  const input = routineSchema.parse(req.body);
  const client = await User.findOne({ _id: input.assignedTo, role: 'Cliente', isActive: true });
  if (!client) throw new HttpError(404, 'El cliente no existe o está inactivo.');
  if (req.user.role === 'Coach' && String(client.assignedCoach) !== req.user.id) {
    throw new HttpError(403, 'Solo puedes asignar rutinas a tus clientes.');
  }

  const routine = await Routine.create({ ...input, createdBy: req.user.id });
  res.status(201).json({ routine });
}

async function getRoutine(req, res) {
  const routine = await Routine.findById(req.params.id);
  if (!routine) throw new HttpError(404, 'Rutina no encontrada.');

  const isAdmin = req.user.role === 'Admin';
  const isAssignedClient = req.user.role === 'Cliente'
    && String(routine.assignedTo) === req.user.id;
  const isAssignedCoach = req.user.role === 'Coach'
    && await User.exists({ _id: routine.assignedTo, assignedCoach: req.user.id });
  if (!isAdmin && !isAssignedClient && !isAssignedCoach) {
    throw new HttpError(403, 'No tienes permisos para consultar esta rutina.');
  }
  res.json({ routine });
}

async function updateRoutine(req, res) {
  const input = routineSchema.partial().omit({ assignedTo: true }).parse(req.body);
  const routine = await Routine.findById(req.params.id);
  if (!routine) throw new HttpError(404, 'Rutina no encontrada.');
  const isAssignedCoach = req.user.role === 'Coach'
    && String(routine.createdBy) === req.user.id
    && await User.exists({ _id: routine.assignedTo, assignedCoach: req.user.id });
  if (req.user.role !== 'Admin' && !isAssignedCoach) {
    throw new HttpError(403, 'Solo el autor o un Admin puede modificar esta rutina.');
  }

  Object.assign(routine, input);
  await routine.save();
  res.json({ routine });
}

async function deleteRoutine(req, res) {
  const routine = await Routine.findById(req.params.id);
  if (!routine) throw new HttpError(404, 'Rutina no encontrada.');
  const isAssignedCoach = req.user.role === 'Coach'
    && String(routine.createdBy) === req.user.id
    && await User.exists({ _id: routine.assignedTo, assignedCoach: req.user.id });
  if (req.user.role !== 'Admin' && !isAssignedCoach) {
    throw new HttpError(403, 'Solo el autor o un Admin puede eliminar esta rutina.');
  }
  await routine.deleteOne();
  res.status(204).end();
}

module.exports = { listRoutines, createRoutine, getRoutine, updateRoutine, deleteRoutine };