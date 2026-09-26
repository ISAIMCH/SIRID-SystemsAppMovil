const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { timingSafeEqual } = require('node:crypto');
const { z } = require('zod');
const User = require('../models/user.model');
const env = require('../config/env');
const HttpError = require('../utils/http-error');

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()),
  password: z.string().min(10).max(72).refine((password) => Buffer.byteLength(password, 'utf8') <= 72),
});

const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).optional(),
  goal: z.string().trim().max(120).optional(),
  experienceLevel: z.enum(['principiante', 'intermedio', 'avanzado']).optional(),
});

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
    membershipStatus: z.enum(['pending', 'active', 'suspended', 'expired']).optional(),
    membershipStartsAt: z.coerce.date().optional(),
    membershipExpiresAt: z.coerce.date().optional(),
    assignedCoach: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  }).superRefine((data, context) => {
    if (data.membershipStatus === 'active' && !data.membershipExpiresAt) {
      context.addIssue({ code: 'custom', path: ['membershipExpiresAt'], message: 'La membresía activa requiere vencimiento.' });
    }
    if (data.membershipStartsAt && data.membershipExpiresAt && data.membershipStartsAt >= data.membershipExpiresAt) {
      context.addIssue({ code: 'custom', path: ['membershipExpiresAt'], message: 'El vencimiento debe ser posterior al inicio.' });
    }
  }).parse(req.body);

  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
  }
  if (input.role === 'Coach' && input.assignedCoach) {
    throw new HttpError(400, 'No se puede asignar un Coach a otro Coach.');
  }
  if (input.assignedCoach) {
    const coach = await User.findOne({ _id: input.assignedCoach, role: 'Coach', isActive: true });
    if (!coach) throw new HttpError(400, 'El Coach asignado no existe o está inactivo.');
  }

  const user = new User({
    ...input,
    membership: {
      status: input.membershipStatus ?? 'pending',
      startsAt: input.membershipStartsAt,
      expiresAt: input.membershipExpiresAt,
    },
  });
  await user.setPassword(input.password);
  await user.save();

  res.status(201).json({ user: user.toSafeJSON() });
}

async function updateMembership(req, res) {
  const input = z.object({
    status: z.enum(['pending', 'active', 'suspended', 'expired']),
    startsAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
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

  user.membership = { status: input.status, startsAt, expiresAt };
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

module.exports = {
  registerClient,
  bootstrapAdmin,
  createManagedUser,
  updateMembership,
  login,
  getCurrentUser,
};