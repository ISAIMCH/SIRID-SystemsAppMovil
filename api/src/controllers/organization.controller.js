const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');
const { z } = require('zod');
const User = require('../models/user.model');
const Organization = require('../models/organization.model');
const OrganizationMember = require('../models/organization-member.model');
const Gym = require('../models/gym.model');
const HttpError = require('../utils/http-error');
const withTransaction = require('../utils/transaction');
const { registrationSchema } = require('./auth.controller');

const optionalText = (max) => z.string().trim().max(max).transform((value) => value || undefined).optional();

const signupSchema = registrationSchema.pick({ name: true, lastName: true, email: true, password: true }).extend({
  // Without email notifications, SIRID calls the owner to confirm the request.
  phone: registrationSchema.shape.phone.unwrap(),
  organizationName: z.string().trim().min(2).max(120),
  legalName: optionalText(200),
  rfc: z.string().trim().toUpperCase()
    .refine((value) => value === '' || /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(value), 'El RFC no es válido.')
    .transform((value) => value || undefined)
    .optional(),
  gymName: z.string().trim().min(2).max(120),
  gymAddress: optionalText(200),
  timezone: z.string().trim().min(1).max(60).default('America/Mexico_City'),
});

function slugify(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'gimnasio';
}

async function uniqueSlug(name) {
  const base = slugify(name);
  if (!await Organization.exists({ slug: base })) return base;
  return `${base}-${randomBytes(3).toString('hex')}`;
}

// An existing GymGo account signs up with its current password, so a client or coach keeps one account.
async function findSignupUser(input) {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user) return null;
  if (!user.isActive || !await bcrypt.compare(input.password, user.passwordHash)) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo. Usa la contraseña de esa cuenta para registrar tu gimnasio.');
  }
  return user;
}

async function findOwnedOrganization(userId) {
  const members = await OrganizationMember.find({ userId, roles: 'Propietario' }).populate('organizationId').lean();
  return members.map((member) => member.organizationId).find(Boolean) ?? null;
}

function serializeApplication(organization) {
  return { id: String(organization._id), name: organization.name, status: organization.status };
}

// Public signup: the owner, the organization and its first gym wait as pending until SIRID approves them.
// A rejected owner signs up again with the same account and the request goes back to review.
async function signupOwner(req, res) {
  const input = signupSchema.parse(req.body);
  const existingUser = await findSignupUser(input);
  const owned = existingUser && await findOwnedOrganization(existingUser._id);
  if (owned?.status === 'pending') throw new HttpError(409, 'Tu solicitud ya está en revisión.');
  if (owned && owned.status !== 'rejected') throw new HttpError(409, 'Tu cuenta ya tiene una organización registrada.');

  const organizationData = { name: input.organizationName, legalName: input.legalName, rfc: input.rfc };
  const gymData = { name: input.gymName, address: input.gymAddress, timezone: input.timezone };

  const organization = await withTransaction(async (session) => {
    if (owned) {
      const reopened = await Organization.findById(owned._id).session(session);
      reopened.set({ ...organizationData, status: 'pending', statusReason: null });
      await reopened.save({ session });
      const firstGym = await Gym.findOne({ organizationId: owned._id }).sort({ createdAt: 1 }).session(session);
      if (firstGym) {
        firstGym.set(gymData);
        await firstGym.save({ session });
      } else {
        await Gym.create([{ ...gymData, organizationId: owned._id }], { session });
      }
      return reopened;
    }

    let user = existingUser;
    if (!user) {
      user = new User({ name: input.name, lastName: input.lastName, email: input.email, phone: input.phone, role: 'Admin', membership: { status: 'active' } });
      await user.setPassword(input.password);
      await user.save({ session });
    }
    const [created] = await Organization.create([{ ...organizationData, slug: await uniqueSlug(input.organizationName) }], { session });
    await Gym.create([{ ...gymData, organizationId: created._id }], { session });
    await OrganizationMember.create([{ userId: user._id, organizationId: created._id, roles: ['Propietario'] }], { session });
    return created;
  });

  res.status(201).json({
    organization: serializeApplication(organization),
    existingAccount: Boolean(existingUser),
    message: 'Recibimos tu solicitud. Inicia sesión más tarde para ver si SIRID ya la aprobó.',
  });
}

module.exports = { signupSchema, slugify, signupOwner };
