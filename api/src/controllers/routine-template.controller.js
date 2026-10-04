const { z } = require('zod');
const RoutineTemplate = require('../models/routine-template.model');
const Routine = require('../models/routine.model');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');
const {
  routineBaseSchema,
  scheduleRefinement,
  ensureEligibleBlocks,
  normalizeBlocks,
  legacyExercisesFromBlocks,
} = require('./routine.controller');

const templateBaseSchema = routineBaseSchema.omit({ assignedTo: true, status: true });
const templateSchema = templateBaseSchema.superRefine(scheduleRefinement);

function assertId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'ID inválido.');
}

async function findOwnedTemplate(req) {
  assertId(req.params.id);
  const template = await RoutineTemplate.findById(req.params.id)
    .populate('blocks.exercises.equipmentId', 'name zone status type')
    .populate({ path: 'exercises.equipmentId', select: 'name zone status type', strictPopulate: false });
  if (!template) throw new HttpError(404, 'Plantilla no encontrada.');
  if (req.user.role !== 'Admin' && String(template.createdBy) !== req.user.id) {
    throw new HttpError(403, 'Solo el autor o un Admin puede usar esta plantilla.');
  }
  return template;
}

function templateResponse(template) {
  const value = template.toObject ? template.toObject() : template;
  const blocks = normalizeBlocks(value);
  return { ...value, blocks, exercises: legacyExercisesFromBlocks(blocks) };
}

function cloneBlocks(blocks) {
  return blocks.map((block, order) => {
    const { _id, ...values } = block;
    return {
      ...values,
      order,
      exercises: values.exercises.map((exercise, exerciseOrder) => {
        const { _id: exerciseId, ...exerciseValues } = exercise;
        return { ...exerciseValues, order: exerciseOrder };
      }),
    };
  });
}

async function listTemplates(req, res) {
  const filter = req.user.role === 'Admin' ? {} : { createdBy: req.user.id };
  const templates = await RoutineTemplate.find(filter)
    .populate('blocks.exercises.equipmentId', 'name zone status type')
    .populate({ path: 'exercises.equipmentId', select: 'name zone status type', strictPopulate: false })
    .sort({ updatedAt: -1 })
    .lean();
  res.json({ templates: templates.map(templateResponse) });
}

async function getTemplate(req, res) {
  const template = await findOwnedTemplate(req);
  res.json({ template: templateResponse(template) });
}

async function createTemplate(req, res) {
  const input = templateSchema.parse(req.body);
  await ensureEligibleBlocks(input.blocks);
  const template = await RoutineTemplate.create({ ...input, createdBy: req.user.id });
  res.status(201).json({ template: templateResponse(template) });
}

async function updateTemplate(req, res) {
  const input = templateBaseSchema.partial().parse(req.body);
  const template = await findOwnedTemplate(req);
  if (input.blocks) await ensureEligibleBlocks(input.blocks);

  const blocks = input.blocks ?? normalizeBlocks(template.toObject());
  const scheduleDays = input.scheduleDays ?? template.scheduleDays;
  const daysPerWeek = input.daysPerWeek ?? template.daysPerWeek;
  if ((input.blocks || input.scheduleDays || input.daysPerWeek)
    && (new Set(scheduleDays).size !== scheduleDays.length || scheduleDays.length !== daysPerWeek)) {
    throw new HttpError(400, 'Los días programados deben ser únicos y coincidir con la frecuencia semanal.');
  }
  if ((input.blocks || input.scheduleDays) && blocks.some((block) => !scheduleDays.includes(block.day))) {
    throw new HttpError(400, 'Cada bloque debe asignarse a uno de los días programados.');
  }

  if (input.blocks && template.exercises) template.set('exercises', undefined);
  Object.assign(template, input);
  await template.save();
  res.json({ template: templateResponse(template) });
}

async function deleteTemplate(req, res) {
  const template = await findOwnedTemplate(req);
  await template.deleteOne();
  res.status(204).end();
}

async function assignTemplate(req, res) {
  const { clientId } = z.object({ clientId: z.string().regex(/^[a-f\d]{24}$/i) }).parse(req.body);
  const template = await findOwnedTemplate(req);
  const client = await User.findOne({ _id: clientId, role: 'Cliente', isActive: true });
  if (!client) throw new HttpError(404, 'El cliente no existe o está inactivo.');
  if (req.user.role === 'Coach' && String(client.assignedCoach) !== req.user.id) {
    throw new HttpError(403, 'Solo puedes asignar rutinas a tus clientes.');
  }

  const plain = template.toObject();
  const blocks = normalizeBlocks(plain).map((block) => ({ ...block, exercises: block.exercises.map((exercise) => ({
    ...exercise,
    equipmentId: exercise.equipmentId && String(exercise.equipmentId._id ?? exercise.equipmentId),
  })) }));
  await ensureEligibleBlocks(blocks);

  const routine = await Routine.create({
    title: plain.title,
    description: plain.description,
    goal: plain.goal,
    level: plain.level,
    durationWeeks: plain.durationWeeks,
    daysPerWeek: plain.daysPerWeek,
    scheduleDays: plain.scheduleDays,
    blocks: cloneBlocks(blocks),
    assignedTo: client.id,
    createdBy: req.user.id,
    sourceTemplate: template.id,
    status: 'active',
  });
  res.status(201).json({ routine });
}

module.exports = { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, assignTemplate };
