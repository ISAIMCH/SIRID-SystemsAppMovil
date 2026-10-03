const { z } = require('zod');
const RoutineTemplate = require('../models/routine-template.model');
const Routine = require('../models/routine.model');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');
const {
  routineBaseSchema,
  scheduleRefinement,
  ensureEligibleEquipment,
} = require('./routine.controller');

const templateBaseSchema = routineBaseSchema.omit({ assignedTo: true, status: true });
const templateSchema = templateBaseSchema.superRefine(scheduleRefinement);

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID inválido.');
}

async function findOwnedTemplate(req) {
  assertId(req.params.id);
  const template = await RoutineTemplate.findById(req.params.id);
  if (!template) throw new HttpError(404, 'Plantilla no encontrada.');
  if (req.user.role !== 'Admin' && String(template.createdBy) !== req.user.id) {
    throw new HttpError(403, 'Solo el autor o un Admin puede usar esta plantilla.');
  }
  return template;
}

function stripIds(exercises) {
  return exercises.map(({ _id, ...exercise }) => exercise);
}

async function listTemplates(req, res) {
  const filter = req.user.role === 'Admin' ? {} : { createdBy: req.user.id };
  const templates = await RoutineTemplate.find(filter)
    .populate('exercises.equipmentId', 'name zone')
    .sort({ updatedAt: -1 })
    .lean();
  res.json({ templates });
}

async function getTemplate(req, res) {
  const template = await findOwnedTemplate(req);
  res.json({ template });
}

async function createTemplate(req, res) {
  const input = templateSchema.parse(req.body);
  await ensureEligibleEquipment(input.exercises);
  const template = await RoutineTemplate.create({
    ...input,
    exercises: stripIds(input.exercises),
    createdBy: req.user.id,
  });
  res.status(201).json({ template });
}

async function updateTemplate(req, res) {
  const input = templateBaseSchema.partial().parse(req.body);
  const template = await findOwnedTemplate(req);

  if (input.exercises) await ensureEligibleEquipment(input.exercises);
  const scheduleDays = input.scheduleDays ?? template.scheduleDays;
  const daysPerWeek = input.daysPerWeek ?? template.daysPerWeek;
  const exercises = input.exercises ?? template.exercises;
  if (new Set(scheduleDays).size !== scheduleDays.length || scheduleDays.length !== daysPerWeek) {
    throw new HttpError(400, 'Los días programados deben ser únicos y coincidir con la frecuencia semanal.');
  }
  if (exercises.some((exercise) => !scheduleDays.includes(exercise.day))) {
    throw new HttpError(400, 'Cada ejercicio debe asignarse a uno de los días programados.');
  }

  Object.assign(template, input);
  await template.save();
  res.json({ template });
}

async function deleteTemplate(req, res) {
  const template = await findOwnedTemplate(req);
  await template.deleteOne();
  res.status(204).end();
}

// La copia es independiente: editarla después no modifica la plantilla.
async function assignTemplate(req, res) {
  const { clientId } = z.object({ clientId: z.string().regex(/^[a-f\d]{24}$/i) }).parse(req.body);
  const template = await findOwnedTemplate(req);

  const client = await User.findOne({ _id: clientId, role: 'Cliente', isActive: true });
  if (!client) throw new HttpError(404, 'El cliente no existe o está inactivo.');
  if (req.user.role === 'Coach' && String(client.assignedCoach) !== req.user.id) {
    throw new HttpError(403, 'Solo puedes asignar rutinas a tus clientes.');
  }

  const plain = template.toObject();
  await ensureEligibleEquipment(plain.exercises.map((exercise) => ({ ...exercise, equipmentId: exercise.equipmentId && String(exercise.equipmentId) })));

  const routine = await Routine.create({
    title: plain.title,
    description: plain.description,
    goal: plain.goal,
    level: plain.level,
    durationWeeks: plain.durationWeeks,
    daysPerWeek: plain.daysPerWeek,
    scheduleDays: plain.scheduleDays,
    exercises: stripIds(plain.exercises),
    assignedTo: client.id,
    createdBy: req.user.id,
    sourceTemplate: template.id,
    status: 'active',
  });
  res.status(201).json({ routine });
}

module.exports = { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, assignTemplate };
