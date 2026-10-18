const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { timingSafeEqual } = require('node:crypto');
const { z } = require('zod');
const User = require('../models/user.model');
const MembershipPlan = require('../models/membership-plan.model');
const env = require('../config/env');
const HttpError = require('../utils/http-error');

const phoneSchema = z.string().trim()
  .transform((value) => value.replace(/[\s()+-]/g, ''))
  .refine((value) => /^\d{10}$/.test(value), 'El teléfono debe tener 10 dígitos.');

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()),
  password: z.string().min(10).max(72).refine((password) => Buffer.byteLength(password, 'utf8') <= 72),
});

const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema.optional(),
  goal: z.string().trim().max(120).optional(),
  experienceLevel: z.union([z.enum(['principiante', 'intermedio', 'avanzado']), z.literal('')]).optional(),
  availableTrainingDays: z.array(z.number().int().min(0).max(6)).max(7)
    .refine((days) => new Set(days).size === days.length, 'No repitas los días disponibles.')
    .optional(),
  observations: z.string().trim().max(4000).optional(),
  documents: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  preferredTrainingTime: z.string().trim().max(80).optional(),
  restrictions: z.string().trim().max(1000).optional(),
  preferredZones: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

function parseJsonArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeMultipartBody(req) {
  const body = { ...(req.body ?? {}) };
  if (Object.prototype.hasOwnProperty.call(body, 'availableTrainingDays')) {
    body.availableTrainingDays = parseJsonArrayField(body.availableTrainingDays);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'documents')) {
    body.documents = parseJsonArrayField(body.documents);
  }
  if (body.isActive === 'true') body.isActive = true;
  if (body.isActive === 'false') body.isActive = false;

  const uploadedDocuments = (req.files ?? []).map((file) => `/uploads/documents/${file.filename}`);
  if (uploadedDocuments.length > 0) {
    body.documents = [...(body.documents ?? []), ...uploadedDocuments];
  }
  return body;
}

function createUserToken(user) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    issuer: 'gymgo-api',
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

function authResponse(user) {
  return { token: createUserToken(user), user: user.toSafeJSON() };
}

function safeStringEqual(value, expected) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length
    && timingSafeEqual(valueBuffer, expectedBuffer);
}

async function registerClient(req, res) {
  const input = registrationSchema.parse(req.body);
  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
  }

  const user = new User({
    ...input,
    role: 'Cliente',
    membership: { status: 'pending' },
  });
  await user.setPassword(input.password);
  await user.save();

  res.status(201).json(authResponse(user));
}

async function bootstrapAdmin(req, res) {
  if (!env.ENABLE_ADMIN_BOOTSTRAP) {
    throw new HttpError(404, 'Ruta no encontrada.');
  }

  const input = registrationSchema.pick({ name: true, email: true, password: true, phone: true }).extend({
    bootstrapKey: z.string().min(1),
  }).parse(req.body);

  if (!safeStringEqual(input.bootstrapKey, env.ADMIN_BOOTSTRAP_KEY)) {
    throw new HttpError(403, 'Clave de configuración inválida.');
  }
  if (await User.exists({ role: 'Admin' })) {
    throw new HttpError(409, 'La cuenta Admin inicial ya fue creada.');
  }
  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
  }

  const user = new User({
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: 'Admin',
    membership: { status: 'active' },
  });
  await user.setPassword(input.password);
  await user.save();

  res.status(201).json(authResponse(user));
}

async function createManagedUser(req, res) {
  const input = registrationSchema.extend({
    role: z.enum(['Coach', 'Cliente']),
    address: z.string().trim().min(1).max(200).optional(),
    membershipPlanId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    planId: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal('')]).optional(),
    membershipStatus: z.enum(['pending', 'active', 'suspended', 'expired']).optional(),
    membershipStartsAt: z.coerce.date().optional(),
    membershipExpiresAt: z.coerce.date().optional(),
    membershipPlanName: z.string().trim().min(1).max(80).optional(),
    membershipPrice: z.coerce.number().min(0).max(1000000).optional(),
    membershipDurationDays: z.coerce.number().int().min(1).max(730).default(30),
    assignedCoach: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal('')]).transform((value) => value || null).optional(),
  }).superRefine((data, context) => {
    if (data.membershipStatus === 'active' && !data.membershipExpiresAt) {
      context.addIssue({ code: 'custom', path: ['membershipExpiresAt'], message: 'La membresía activa requiere vencimiento.' });
    }
    if (data.membershipStartsAt && data.membershipExpiresAt && data.membershipStartsAt >= data.membershipExpiresAt) {
      context.addIssue({ code: 'custom', path: ['membershipExpiresAt'], message: 'El vencimiento debe ser posterior al inicio.' });
    }
  }).parse(normalizeMultipartBody(req));

  if (input.planId && !input.membershipPlanId) input.membershipPlanId = input.planId;

  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
  }
  if (input.role === 'Coach' && input.assignedCoach) {
    throw new HttpError(400, 'No se puede asignar un Coach a otro Coach.');
  }
  if (input.role === 'Cliente' && input.address) {
    throw new HttpError(400, 'La dirección solo aplica a Coaches.');
  }
  if (input.role === 'Cliente' && input.membershipPlanId) {
    const plan = await MembershipPlan.findOne({ _id: input.membershipPlanId, isActive: true });
    if (!plan) throw new HttpError(400, 'El plan seleccionado no existe o está inactivo.');
    input.membershipPlanName = plan.name;
    input.membershipPrice = plan.price;
    input.membershipDurationDays = plan.durationInDays;
  }
  if (input.assignedCoach) {
    const coach = await User.findOne({ _id: input.assignedCoach, role: 'Coach', isActive: true });
    if (!coach) throw new HttpError(400, 'El Coach asignado no existe o está inactivo.');
  }

  const assignedCoach = input.assignedCoach ?? null;
  const availableTrainingDays = input.availableTrainingDays ?? [];

  const user = new User({
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: input.role,
    goal: input.goal,
    experienceLevel: input.experienceLevel,
    availableTrainingDays,
    assignedCoach,
    observations: input.observations,
    documents: input.documents,
    preferredTrainingTime: input.preferredTrainingTime,
    restrictions: input.restrictions,
    preferredZones: input.preferredZones,
    address: input.address,
    membership: {
      status: input.membershipStatus ?? 'pending',
      startsAt: input.membershipStartsAt,
      expiresAt: input.membershipExpiresAt,
      planName: input.membershipPlanName,
      price: input.membershipPrice,
      currency: 'MXN',
      durationDays: input.membershipDurationDays,
    },
  });
  await user.setPassword(input.password);
  await user.save();

  res.status(201).json({ user: user.toSafeJSON() });
}

function serializeDirectoryUser(user) {
  const coach = user.assignedCoach;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    documents: user.documents,
    role: user.role,
    isActive: user.isActive,
    goal: user.goal,
    experienceLevel: user.experienceLevel,
    availableTrainingDays: user.availableTrainingDays,
    observations: user.observations,
    membership: user.membership,
    assignedCoach: coach ? {
      id: String(coach._id),
      name: coach.name,
      email: coach.email,
    } : null,
  };
}

async function listDirectoryUsers(req, res) {
  const input = z.object({ role: z.enum(['Cliente', 'Coach']).optional() }).parse(req.query);
  if (input.role === 'Coach' && req.user.role !== 'Admin') throw new HttpError(403, 'No tienes permiso para ver Coaches.');
  const filter = {};
  if (input.role) filter.role = input.role;
  if (req.user.role === 'Coach') {
    filter.role = 'Cliente';
    filter.assignedCoach = req.user.id;
  }

  const users = await User.find(filter)
    .select('_id name email phone address documents role isActive goal experienceLevel availableTrainingDays observations membership assignedCoach')
    .populate('assignedCoach', 'name email')
    .sort({ name: 1 })
    .lean();

  res.json({ users: users.map(serializeDirectoryUser) });
}

async function getDirectoryUser(req, res) {
  const client = await User.findOne({ _id: req.params.id, role: { $in: ['Cliente', 'Coach'] } })
    .select('_id name email phone address documents role isActive goal experienceLevel availableTrainingDays observations membership assignedCoach')
    .populate('assignedCoach', 'name email')
    .lean();

  if (!client) throw new HttpError(404, 'Usuario no encontrado.');
  if (req.user.role === 'Coach' && (client.role !== 'Cliente' || String(client.assignedCoach?._id) !== req.user.id)) {
    throw new HttpError(404, 'Usuario no encontrado.');
  }

  res.json({ user: serializeDirectoryUser(client) });
}

async function updateDirectoryUser(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de usuario inválido.');
  const input = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()).optional(),
    phone: z.union([phoneSchema, z.literal('')]).optional(),
    address: z.string().trim().max(200).optional(),
    documents: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
    isActive: z.boolean().optional(),
    password: z.string().max(72).optional(),
    goal: z.string().trim().max(120).optional(),
    experienceLevel: z.union([z.enum(['principiante', 'intermedio', 'avanzado']), z.literal('')]).optional(),
    availableTrainingDays: z.array(z.number().int().min(0).max(6)).max(7)
      .refine((days) => new Set(days).size === days.length, 'No repitas los días disponibles.')
      .optional(),
    assignedCoach: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal(''), z.null()])
      .transform((value) => value || null)
      .optional(),
    observations: z.string().trim().max(4000).optional(),
  }).parse(normalizeMultipartBody(req));
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const user = await User.findOne({ _id: req.params.id, role: { $in: ['Cliente', 'Coach'] } });
  if (!user) throw new HttpError(404, 'Usuario no encontrado.');

  if (input.email && input.email !== user.email) {
    if (await User.exists({ email: input.email, _id: { $ne: user._id } })) {
      throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
    }
    user.email = input.email;
  }
  if (input.name) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone || undefined;
  if (input.documents !== undefined) user.documents = input.documents;
  if (input.isActive !== undefined) user.isActive = input.isActive;
  if (input.password?.trim()) await user.setPassword(input.password.trim());
  if (input.goal !== undefined) user.goal = input.goal;
  if (input.experienceLevel !== undefined) user.experienceLevel = input.experienceLevel;
  if (input.availableTrainingDays !== undefined) user.availableTrainingDays = input.availableTrainingDays;
  if (input.observations !== undefined) user.observations = input.observations;
  if (input.address !== undefined) {
    if (user.role !== 'Coach') throw new HttpError(400, 'La dirección solo aplica a Coaches.');
    user.address = input.address || undefined;
  }
  if (input.assignedCoach !== undefined) {
    if (user.role !== 'Cliente') throw new HttpError(400, 'Solo los clientes pueden tener Coach asignado.');
    if (input.assignedCoach) {
      const coach = await User.findOne({ _id: input.assignedCoach, role: 'Coach', isActive: true });
      if (!coach) throw new HttpError(400, 'El Coach asignado no existe o está inactivo.');
    }
    user.assignedCoach = input.assignedCoach;
  }
  await user.save();

  const updated = await User.findById(user._id)
    .select('_id name email phone address documents role isActive goal experienceLevel availableTrainingDays observations membership assignedCoach')
    .populate('assignedCoach', 'name email')
    .lean();
  res.json({ user: serializeDirectoryUser(updated) });
}

async function updateUser(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de usuario inválido.');
  const input = z.object({
    firstName: z.string().trim().min(1).max(50).optional(),
    lastName: z.string().trim().max(50).optional(),
    email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()).optional(),
    role: z.enum(['Admin', 'Coach', 'Cliente']).optional(),
    phone: z.union([phoneSchema, z.literal('')]).optional(),
    address: z.string().trim().max(200).optional(),
    documents: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
    isActive: z.boolean().optional(),
    password: z.string().max(72).optional(),
    goal: z.string().trim().max(120).optional(),
    experienceLevel: z.union([z.enum(['principiante', 'intermedio', 'avanzado']), z.literal('')]).optional(),
    availableTrainingDays: z.array(z.number().int().min(0).max(6)).max(7)
      .refine((days) => new Set(days).size === days.length, 'No repitas los días disponibles.')
      .optional(),
    assignedCoach: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal(''), z.null()])
      .transform((value) => value || null)
      .optional(),
    observations: z.string().trim().max(4000).optional(),
  }).parse(normalizeMultipartBody(req));
  if (Object.keys(input).length === 0) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Usuario no encontrado.');

  if (input.email && input.email !== user.email) {
    if (await User.exists({ email: input.email, _id: { $ne: user._id } })) {
      throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
    }
    user.email = input.email;
  }
  if (input.firstName !== undefined || input.lastName !== undefined) {
    const currentParts = user.name.trim().split(/\s+/);
    const currentFirstName = currentParts.shift() || '';
    const currentLastName = currentParts.join(' ');
    const firstName = input.firstName ?? currentFirstName;
    const lastName = input.lastName ?? currentLastName;
    user.name = [firstName, lastName].filter(Boolean).join(' ').slice(0, 100);
  }
  if (input.role !== undefined) user.role = input.role;
  if (input.phone !== undefined) user.phone = input.phone || undefined;
  if (input.address !== undefined) user.address = input.address || undefined;
  if (input.documents !== undefined) user.documents = input.documents;
  if (input.isActive !== undefined) user.isActive = input.isActive;
  if (input.password?.trim()) await user.setPassword(input.password.trim());
  if (input.goal !== undefined) user.goal = input.goal;
  if (input.experienceLevel !== undefined) user.experienceLevel = input.experienceLevel;
  if (input.availableTrainingDays !== undefined) user.availableTrainingDays = input.availableTrainingDays;
  if (input.assignedCoach !== undefined) {
    if (user.role !== 'Cliente') throw new HttpError(400, 'Solo los clientes pueden tener Coach asignado.');
    if (input.assignedCoach) {
      const coach = await User.findOne({ _id: input.assignedCoach, role: 'Coach', isActive: true });
      if (!coach) throw new HttpError(400, 'El Coach asignado no existe o está inactivo.');
    }
    user.assignedCoach = input.assignedCoach;
  }
  if (input.observations !== undefined) user.observations = input.observations;
  await user.save();

  res.json({ user: user.toSafeJSON() });
}

async function updateMembership(req, res) {
  const input = z.object({
    status: z.enum(['pending', 'active', 'suspended', 'expired']),
    startsAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    planName: z.string().trim().min(1).max(80).optional(),
    price: z.number().min(0).max(1000000).optional(),
    durationDays: z.number().int().min(1).max(730).optional(),
    autoRenew: z.boolean().optional(),
  }).parse(req.body);
  const user = await User.findOne({ _id: req.params.id, role: 'Cliente' });
  if (!user) throw new HttpError(404, 'Cliente no encontrado.');

  const startsAt = input.startsAt ?? user.membership.startsAt;
  const expiresAt = input.expiresAt ?? user.membership.expiresAt;
  if (input.status === 'active' && !expiresAt) {
    throw new HttpError(400, 'Una membresía activa requiere fecha de vencimiento.');
  }
  if (startsAt && expiresAt && startsAt >= expiresAt) {
    throw new HttpError(400, 'El vencimiento debe ser posterior al inicio.');
  }

  user.membership = {
    ...user.membership.toObject(),
    status: input.status,
    startsAt,
    expiresAt,
    ...input,
  };
  await user.save();
  res.json({ user: user.toSafeJSON() });
}

async function login(req, res) {
  const input = credentialsSchema.parse(req.body);
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const validPassword = user
    ? await bcrypt.compare(input.password, user.passwordHash)
    : await bcrypt.compare(input.password, '$2b$12$LJ3m4ys3Lz0W9h8XyPzRzeB9oV0aU4wGj8K2nI9F7Yd4X1v5qP8aK');

  if (!user || !user.isActive || !validPassword) {
    throw new HttpError(401, 'Correo o contraseña incorrectos.');
  }

  res.json(authResponse(user));
}

async function getCurrentUser(req, res) {
  res.json({ user: req.user.toSafeJSON() });
}

async function updatePhysicalProfile(req, res) {
  const input = z.object({
    email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()).optional(),
    phone: z.union([phoneSchema, z.literal('')]).optional(),
    goal: z.string().trim().max(120).optional(),
    experienceLevel: z.enum(['principiante', 'intermedio', 'avanzado']).optional(),
    weightKg: z.number().min(20).max(400).optional(),
    heightCm: z.number().min(80).max(260).optional(),
  }).parse(req.body);

  if (input.email && await User.exists({ email: input.email, _id: { $ne: req.user._id } })) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
  }

  const user = await User.findByIdAndUpdate(req.user.id, {
    $set: {
      ...input,
      ...(input.phone !== undefined ? { phone: input.phone || undefined } : {}),
    },
  }, { new: true, runValidators: true });
  res.json({ user: user.toSafeJSON() });
}

module.exports = {
  registerClient,
  bootstrapAdmin,
  createManagedUser,
  listDirectoryUsers,
  getDirectoryUser,
  updateDirectoryUser,
  updateUser,
  updateMembership,
  login,
  getCurrentUser,
  updatePhysicalProfile,
};