const mongoose = require('mongoose');
const { z } = require('zod');
const Routine = require('../models/routine.model');
const User = require('../models/user.model');
const Equipment = require('../models/equipment.model');
const HttpError = require('../utils/http-error');

const exerciseSchema = z.object({
  _id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  name: z.string().trim().min(1).max(120),
  muscleGroup: z.string().trim().min(1).max(80),
  equipment: z.string().trim().max(100).optional(),
  equipmentId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  gifUrl: z.string().url().max(500).optional(),
  bodyweight: z.boolean().default(false),
  metricType: z.enum(['strength', 'cardio']).optional(),
  reps: z.string().trim().min(1).max(30).optional(),
  suggestedWeight: z.number().min(0).max(1000).optional(),
  targetDurationMinutes: z.number().int().min(1).max(600).optional(),
  targetDistanceKm: z.number().min(0.01).max(1000).optional(),
  targetLevel: z.number().int().min(1).max(100).optional(),
  order: z.number().int().min(0),
}).refine((exercise) => exercise.bodyweight || exercise.equipmentId || exercise.equipment, {
  path: ['equipmentId'],
  message: 'Selecciona un equipo del inventario o un equipo del catálogo.',
});

const blockSchema = z.object({
  _id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  day: z.number().int().min(0).max(6),
  blockType: z.enum(['single', 'superset', 'circuit']),
  sets: z.number().int().min(1).max(50),
  restSeconds: z.number().int().min(0).max(3600),
  order: z.number().int().min(0),
  exercises: z.array(exerciseSchema).min(1).max(20),
}).superRefine((block, context) => {
  if (block.blockType === 'single' && block.exercises.length !== 1) {
    context.addIssue({ code: 'custom', path: ['exercises'], message: 'Un bloque individual requiere exactamente un ejercicio.' });
  }
  if (block.blockType !== 'single' && block.exercises.length < 2) {
    context.addIssue({ code: 'custom', path: ['exercises'], message: 'Un superset o circuito requiere al menos dos ejercicios.' });
  }
});

const routineBaseSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  goal: z.string().trim().max(120).optional(),
  level: z.enum(['principiante', 'intermedio', 'avanzado']),
  durationWeeks: z.number().int().min(1).max(52).default(4),
  daysPerWeek: z.number().int().min(1).max(7),
  scheduleDays: z.array(z.number().int().min(0).max(6)).max(7),
  assignedTo: z.string().regex(/^[a-f\d]{24}$/i),
  status: z.enum(['active', 'paused']).default('active'),
  blocks: z.array(blockSchema).min(1).max(100),
});

function scheduleRefinement(routine, context) {
  if (new Set(routine.scheduleDays).size !== routine.scheduleDays.length) {
    context.addIssue({ code: 'custom', path: ['scheduleDays'], message: 'No repitas días de entrenamiento.' });
  }
  if (routine.scheduleDays.length !== routine.daysPerWeek) {
    context.addIssue({ code: 'custom', path: ['scheduleDays'], message: 'Los días programados deben coincidir con la frecuencia semanal.' });
  }
  routine.blocks.forEach((block, index) => {
    if (!routine.scheduleDays.includes(block.day)) {
      context.addIssue({ code: 'custom', path: ['blocks', index, 'day'], message: 'El bloque debe estar en un día programado.' });
    }
  });
}

const routineSchema = routineBaseSchema.superRefine(scheduleRefinement);

function normalizeBlocks(source) {
  if (source.blocks?.length) return source.blocks;
  return (source.exercises ?? []).map((exercise, order) => {
    const equipmentType = typeof exercise.equipmentId === 'object' ? exercise.equipmentId.type : undefined;
    const metricType = exercise.metricType ?? equipmentType ?? 'strength';
    const migratedExercise = { ...exercise, metricType, order: exercise.order ?? 0 };
    if (metricType === 'cardio') {
      delete migratedExercise.reps;
      delete migratedExercise.suggestedWeight;
    }
    return {
      _id: exercise._id ?? new mongoose.Types.ObjectId(),
      day: exercise.day ?? 0,
      blockType: 'single',
      sets: exercise.sets ?? 3,
      restSeconds: exercise.restSeconds ?? 60,
      order,
      exercises: [migratedExercise],
    };
  });
}

function routineResponse(routine) {
  const value = routine.toObject ? routine.toObject() : routine;
  const blocks = normalizeBlocks(value);
  const exercises = blocks.flatMap((block) => block.exercises.map((exercise) => ({
    ...exercise,
    day: block.day,
    sets: block.sets,
    restSeconds: block.restSeconds,
  })));
  return { ...value, blocks, exercises };
}

function legacyExercisesFromBlocks(blocks) {
  return blocks.flatMap((block) => block.exercises.map((exercise) => ({
    ...exercise,
    day: block.day,
    sets: block.sets,
    restSeconds: block.restSeconds,
  })));
}

async function ensureEligibleBlocks(blocks) {
  const exercises = blocks.flatMap((block) => block.exercises);
  const equipmentIds = [...new Set(exercises.filter((exercise) => exercise.equipmentId && !exercise.bodyweight).map((exercise) => String(exercise.equipmentId)))];
  const equipment = equipmentIds.length
    ? await Equipment.find({ _id: { $in: equipmentIds }, status: { $ne: 'out_of_service' } }).select('_id type zone').lean()
    : [];
  if (equipment.length !== equipmentIds.length) {
    throw new HttpError(400, 'Selecciona equipos existentes que no estén fuera de servicio en el inventario.');
  }
  const byId = new Map(equipment.map((item) => [String(item._id), {
    ...item,
    type: item.type ?? (/^cardio$/i.test(item.zone) ? 'cardio' : 'strength'),
  }]));
  for (const exercise of exercises) {
    if (!exercise.bodyweight && !exercise.equipmentId && !exercise.equipment) {
      throw new HttpError(400, 'Cada ejercicio requiere equipo o la opción de peso corporal.');
    }
    const metricType = exercise.bodyweight
      ? 'strength'
      : byId.get(String(exercise.equipmentId))?.type ?? exercise.metricType ?? 'strength';
    if (exercise.metricType && exercise.metricType !== metricType) throw new HttpError(400, 'Las métricas deben coincidir con el tipo de equipo.');
    if (metricType === 'cardio') {
      if (!exercise.targetDurationMinutes && !exercise.targetDistanceKm && !exercise.targetLevel) {
        throw new HttpError(400, 'El cardio requiere duración, distancia o nivel/inclinación.');
      }
      if (exercise.reps || exercise.suggestedWeight !== undefined) throw new HttpError(400, 'El cardio no utiliza repeticiones ni peso sugerido.');
    } else {
      if (!exercise.reps) throw new HttpError(400, 'Los ejercicios de fuerza requieren repeticiones.');
      if (exercise.targetDurationMinutes || exercise.targetDistanceKm || exercise.targetLevel) {
        throw new HttpError(400, 'Tiempo, distancia y nivel solo aplican a cardio.');
      }
    }
    exercise.metricType = metricType;
  }
}

async function listRoutines(req, res) {
  let filter = {};
  if (req.user.role === 'Cliente') filter = { assignedTo: req.user.id };
  if (req.user.role === 'Coach') {
    const clientIds = await User.find({ assignedCoach: req.user.id }).distinct('_id');
    filter = { assignedTo: { $in: clientIds } };
  }
  if (req.user.role !== 'Cliente' && /^[a-f\d]{24}$/i.test(String(req.query.clientId ?? ''))) {
    const clientId = String(req.query.clientId);
    const isAssigned = req.user.role === 'Admin' || filter.assignedTo.$in.some((id) => String(id) === clientId);
    filter = isAssigned ? { assignedTo: clientId } : { _id: null };
  }
  const routines = await Routine.find(filter)
    .populate('assignedTo', 'name email')
    .populate('blocks.exercises.equipmentId', 'name zone status type')
    .populate({ path: 'exercises.equipmentId', select: 'name zone status type', strictPopulate: false })
    .sort({ updatedAt: -1 })
    .lean();
  res.json({ routines: routines.map(routineResponse) });
}

async function createRoutine(req, res) {
  const input = routineSchema.parse(req.body);
  await ensureEligibleBlocks(input.blocks);
  const client = await User.findOne({ _id: input.assignedTo, role: 'Cliente', isActive: true });
  if (!client) throw new HttpError(404, 'El cliente no existe o está inactivo.');
  if (req.user.role === 'Coach' && String(client.assignedCoach) !== req.user.id) {
    throw new HttpError(403, 'Solo puedes asignar rutinas a tus clientes.');
  }
  const routine = await Routine.create({ ...input, createdBy: req.user.id });
  res.status(201).json({ routine: routineResponse(routine) });
}

async function getRoutine(req, res) {
  const routine = await Routine.findById(req.params.id)
    .populate('blocks.exercises.equipmentId', 'name zone status type')
    .populate({ path: 'exercises.equipmentId', select: 'name zone status type', strictPopulate: false });
  if (!routine) throw new HttpError(404, 'Rutina no encontrada.');
  const isAdmin = req.user.role === 'Admin';
  const isAssignedClient = req.user.role === 'Cliente' && String(routine.assignedTo) === req.user.id;
  const isAssignedCoach = req.user.role === 'Coach'
    && String(routine.createdBy) === req.user.id
    && await User.exists({ _id: routine.assignedTo, assignedCoach: req.user.id });
  if (!isAdmin && !isAssignedClient && !isAssignedCoach) throw new HttpError(403, 'No tienes permisos para consultar esta rutina.');
  res.json({ routine: routineResponse(routine) });
}

async function updateRoutine(req, res) {
  const input = routineBaseSchema.partial().omit({ assignedTo: true }).parse(req.body);
  const routine = await Routine.findById(req.params.id);
  if (!routine) throw new HttpError(404, 'Rutina no encontrada.');
  const isAssignedCoach = req.user.role === 'Coach'
    && String(routine.createdBy) === req.user.id
    && await User.exists({ _id: routine.assignedTo, assignedCoach: req.user.id });
  if (req.user.role !== 'Admin' && !isAssignedCoach) throw new HttpError(403, 'Solo el autor o un Admin puede modificar esta rutina.');
  if (input.blocks) await ensureEligibleBlocks(input.blocks);

  const blocks = input.blocks ?? normalizeBlocks(routine.toObject());
  const scheduleDays = input.scheduleDays ?? routine.scheduleDays;
  const daysPerWeek = input.daysPerWeek ?? routine.daysPerWeek;
  if ((input.blocks || input.scheduleDays || input.daysPerWeek)
    && (new Set(scheduleDays).size !== scheduleDays.length || scheduleDays.length !== daysPerWeek)) {
    throw new HttpError(400, 'Los días programados deben ser únicos y coincidir con la frecuencia semanal.');
  }
  if ((input.blocks || input.scheduleDays) && blocks.some((block) => !scheduleDays.includes(block.day))) {
    throw new HttpError(400, 'Cada bloque debe asignarse a un día programado.');
  }

  if (input.blocks && routine.exercises) routine.set('exercises', undefined);
  Object.assign(routine, input);
  await routine.save();
  res.json({ routine: routineResponse(routine) });
}

async function deleteRoutine(req, res) {
  const routine = await Routine.findById(req.params.id);
  if (!routine) throw new HttpError(404, 'Rutina no encontrada.');
  const isAssignedCoach = req.user.role === 'Coach'
    && String(routine.createdBy) === req.user.id
    && await User.exists({ _id: routine.assignedTo, assignedCoach: req.user.id });
  if (req.user.role !== 'Admin' && !isAssignedCoach) throw new HttpError(403, 'Solo el autor o un Admin puede eliminar esta rutina.');
  await routine.deleteOne();
  res.status(204).end();
}

module.exports = {
  listRoutines,
  createRoutine,
  getRoutine,
  updateRoutine,
  deleteRoutine,
  routineSchema,
  routineBaseSchema,
  exerciseSchema,
  blockSchema,
  scheduleRefinement,
  ensureEligibleBlocks,
  normalizeBlocks,
  legacyExercisesFromBlocks,
  routineResponse,
};
