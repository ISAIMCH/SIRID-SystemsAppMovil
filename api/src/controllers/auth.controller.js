const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { timingSafeEqual } = require('node:crypto');
const { z } = require('zod');
const User = require('../models/user.model');
const MembershipPlan = require('../models/membership-plan.model');
const Membership = require('../models/membership.model');
const OrganizationMember = require('../models/organization-member.model');
const { GYM_ROLES } = require('../models/organization-member.model');
const Gym = require('../models/gym.model');
const Organization = require('../models/organization.model');
const env = require('../config/env');
const HttpError = require('../utils/http-error');
const withTransaction = require('../utils/transaction');
const {
  ROUTE_ROLES,
  getDefaultTenant,
  legacyRole,
  loadTenantContext,
  platformMember,
  resolveAccess,
  resolveTargetGym,
  resolveTenant,
} = require('../utils/tenant');
const { MIRRORED_FIELDS, planAccessRules, saveMembership } = require('../utils/membership');
const { findGymByJoinCode, addClientToGym } = require('../utils/join-gym');
const {
  applyRoles,
  assertCanManage,
  belongsOnlyTo,
  setMemberActive,
  hasGymRole,
  isAssignedCoach,
  canSeeMember,
  findVisibleMember,
  findClientMember,
  assertCoachInGyms,
} = require('../utils/members');
const { storeLegacyUploads, applyLegacyDocumentList } = require('../utils/documents');

const phoneSchema = z.string().trim()
  .transform((value) => value.replace(/[\s()+-]/g, ''))
  .refine((value) => /^\d{10}$/.test(value), 'El teléfono debe tener 10 dígitos.');

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()),
  password: z.string().min(10).max(72).refine((password) => Buffer.byteLength(password, 'utf8') <= 72),
});

// On edits an empty password keeps the current one; a new one follows the registration rules.
const optionalPasswordSchema = z.string().trim()
  .refine((password) => password === '' || password.length >= 10, 'La contraseña debe tener al menos 10 caracteres.')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'La contraseña es demasiado larga.')
  .optional();

const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(100),
  lastName: z.string().trim().max(50).optional(),
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

// Cliente stands alone for the whole organization; staff roles combine freely in one gym.
const assignableRolesSchema = z.array(z.enum(['Cliente', ...GYM_ROLES])).min(1)
  .refine((roles) => new Set(roles).size === roles.length, 'No repitas roles.')
  .refine((roles) => !roles.includes('Cliente') || roles.length === 1, 'El rol Cliente no se combina con roles del staff.');

// The single role older clients send, as roles.
const LEGACY_ROLES = { Admin: ['Gerente'], Coach: ['Coach'], Cliente: ['Cliente'] };

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
  if (typeof body.roles === 'string') body.roles = parseJsonArrayField(body.roles);
  if (body.isActive === 'true') body.isActive = true;
  if (body.isActive === 'false') body.isActive = false;
  return body;
}

function createUserToken(user) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    issuer: 'gymgo-api',
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

// Every gym the user works in, across organizations, for the gym switchers of the dashboard and the app.
// SIRID staff get every gym of every organization.
async function listUserGyms(user) {
  const members = user.isPlatformAdmin
    ? (await Organization.find().select('name status').lean()).map((organization) => ({ ...platformMember(user, organization._id), organizationId: organization }))
    : (await OrganizationMember.find({ userId: user._id, isActive: true }).populate('organizationId', 'name status').lean())
      .filter((member) => member.organizationId?.status === 'active');
  const gyms = await Gym.find({ organizationId: { $in: members.map((member) => member.organizationId._id) }, isActive: true })
    .sort({ createdAt: 1 })
    .select('_id name organizationId')
    .lean();
  return gyms.flatMap((gym) => {
    const member = members.find((item) => String(item.organizationId._id) === String(gym.organizationId));
    const gymRoles = member.gyms.find((assignment) => String(assignment.gymId) === String(gym._id))?.roles ?? [];
    const roles = [...member.roles, ...gymRoles];
    if (roles.length === 0) return [];
    return [{ id: String(gym._id), name: gym.name, organization: { id: String(member.organizationId._id), name: member.organizationId.name }, roles }];
  });
}

// The membership a client has with the organization, in the shape of the legacy User.membership copy.
async function membershipSummary(userId, organizationId) {
  const membership = await Membership.findOne({ userId, organizationId }).lean();
  if (!membership) return {};
  return { membership: Object.fromEntries(MIRRORED_FIELDS.map((field) => [field, membership[field]])) };
}

// Organizations the user owns that SIRID has not approved yet (or rejected/suspended), for a status banner.
async function listOwnerApplications(user) {
  if (user.isPlatformAdmin) return [];
  const members = await OrganizationMember.find({ userId: user._id, isActive: true, roles: 'Propietario' })
    .populate('organizationId', 'name status statusReason createdAt')
    .lean();
  return members
    .map((member) => member.organizationId)
    .filter((organization) => organization && organization.status !== 'active')
    .map((organization) => ({
      id: String(organization._id),
      name: organization.name,
      status: organization.status,
      reason: organization.statusReason ?? null,
      createdAt: organization.createdAt,
    }));
}

// The profile plus the organization and gyms of the session; `role` keeps the legacy value (Propietario/Gerente → Admin).
// With a selected gym (X-Gym-Id) the organization and the client's membership are those of that gym.
async function sessionResponse(user, requestedGymId = null) {
  const [context, gyms, organizationApplications] = await Promise.all([
    loadTenantContext(user, requestedGymId),
    listUserGyms(user),
    listOwnerApplications(user),
  ]);
  const access = context && resolveAccess(context, ROUTE_ROLES, requestedGymId);
  const membership = context?.member.roles.includes('Cliente') ? await membershipSummary(user._id, context.organizationId) : {};
  // The client's Coach is the one of the session's organization.
  const assignedCoach = context?.member.assignedCoach ? String(context.member.assignedCoach) : null;
  return {
    user: { ...user.toSafeJSON(), isPlatformAdmin: user.isPlatformAdmin, ...(context ? { role: legacyRole(context.member) } : {}), assignedCoach, ...membership },
    organization: context ? { id: String(context.organizationId), name: context.organization.name } : null,
    gyms,
    defaultGymId: access ? String(access.gymId) : null,
    organizationApplications,
  };
}

async function authResponse(user) {
  return { token: createUserToken(user), ...(await sessionResponse(user)) };
}


// The legacy role edits the member's roles in one gym: Admin is Gerente there, Coach is Coach; Cliente leaves staff.
function applyLegacyRole(member, role, gymId) {
  applyRoles(member, LEGACY_ROLES[role], gymId);
}

// The holder of an account shared with other organizations is the only one who changes its email or password.
async function assertCredentialsEditable(user, member, input) {
  const changesEmail = input.email && input.email !== user.email;
  if ((changesEmail || input.password?.trim()) && !await belongsOnlyTo(user, member.organizationId)) {
    throw new HttpError(403, 'Esta cuenta también se usa en otro gimnasio: solo su titular puede cambiar el correo o la contraseña.');
  }
}

async function changeRoles(req, user, member, roles, requestedGymId) {
  const gymId = resolveTargetGym(req, requestedGymId);
  applyRoles(member, roles, gymId);
  user.role = legacyRole(member);
  if (roles.includes('Cliente')) {
    await Membership.updateOne(
      { userId: user._id, organizationId: member.organizationId },
      { $setOnInsert: { homeGymId: gymId, status: 'pending' } },
      { upsert: true },
    );
  }
}

function safeStringEqual(value, expected) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length
    && timingSafeEqual(valueBuffer, expectedBuffer);
}

async function registerClient(req, res) {
  // Observations are staff notes kept per organization (OrganizationMember), never set by the client.
  const { joinCode, observations: _observations, ...input } = registrationSchema.extend({ joinCode: z.string().trim().max(20).optional() }).parse(req.body);
  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
  }

  // A client signs up without a gym and joins one by code, now (joinCode) or later from the app (POST /gyms/join).
  const gym = joinCode ? await findGymByJoinCode(joinCode) : null;
  const user = new User({
    ...input,
    role: 'Cliente',
    membership: { status: 'pending' },
  });
  await user.setPassword(input.password);
  await withTransaction(async (session) => {
    await user.save({ session });
    if (gym) await addClientToGym(user._id, gym, { session });
  });

  res.status(201).json(await authResponse(user));
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
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    role: 'Admin',
    membership: { status: 'active' },
  });
  await user.setPassword(input.password);
  const { organizationId } = getDefaultTenant();
  await withTransaction(async (session) => {
    await user.save({ session });
    await OrganizationMember.create([{ userId: user._id, organizationId, roles: ['Propietario'] }], { session });
  });

  res.status(201).json(await authResponse(user));
}

async function createManagedUser(req, res) {
  const input = registrationSchema.extend({
    role: z.enum(['Coach', 'Cliente']).optional(),
    roles: assignableRolesSchema.optional(),
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
    // The gym the new Coach works in or the client's home gym; defaults to the selected or main gym.
    gymId: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal('')]).transform((value) => value || undefined).optional(),
  }).superRefine((data, context) => {
    if (!data.role && !data.roles) {
      context.addIssue({ code: 'custom', path: ['roles'], message: 'Selecciona al menos un rol.' });
    }
    if (data.membershipStatus === 'active' && !data.membershipExpiresAt) {
      context.addIssue({ code: 'custom', path: ['membershipExpiresAt'], message: 'La membresía activa requiere vencimiento.' });
    }
    if (data.membershipStartsAt && data.membershipExpiresAt && data.membershipStartsAt >= data.membershipExpiresAt) {
      context.addIssue({ code: 'custom', path: ['membershipExpiresAt'], message: 'El vencimiento debe ser posterior al inicio.' });
    }
  }).parse(normalizeMultipartBody(req));

  if (input.planId && !input.membershipPlanId) input.membershipPlanId = input.planId;
  const { organizationId } = resolveTenant(req);
  const gymId = resolveTargetGym(req, input.gymId);
  const roles = input.roles ?? LEGACY_ROLES[input.role];
  const isClient = roles.includes('Cliente');
  assertCanManage(req, null, roles);

  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
  }
  if (!isClient && input.assignedCoach) {
    throw new HttpError(400, 'Solo los clientes pueden tener Coach asignado.');
  }
  if (isClient && input.address) {
    throw new HttpError(400, 'La dirección solo aplica al staff.');
  }
  let plan = null;
  if (isClient && input.membershipPlanId) {
    plan = await MembershipPlan.findOne({ _id: input.membershipPlanId, organizationId, isActive: true, isDeleted: { $ne: true } });
    if (!plan) throw new HttpError(400, 'El plan seleccionado no existe o está inactivo.');
    input.membershipPlanName = plan.name;
    input.membershipPrice = plan.price;
    input.membershipDurationDays = plan.durationInDays;
  }
  if (input.assignedCoach) await assertCoachInGyms(req, input.assignedCoach);

  const assignedCoach = isClient ? input.assignedCoach ?? null : null;
  const availableTrainingDays = input.availableTrainingDays ?? [];
  const memberRoles = isClient ? { roles: ['Cliente'], gyms: [] } : { roles: [], gyms: [{ gymId, roles }] };

  const user = new User({
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: legacyRole(memberRoles),
    goal: input.goal,
    experienceLevel: input.experienceLevel,
    availableTrainingDays,
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
  await withTransaction(async (session) => {
    await user.save({ session });
    await OrganizationMember.create([{ userId: user._id, organizationId, ...memberRoles, assignedCoach, observations: input.observations }], { session });
    if (!isClient) return;
    await Membership.create([{
      ...user.membership.toObject(),
      userId: user._id,
      organizationId,
      homeGymId: gymId,
      planId: plan?._id ?? null,
      ...(plan ? planAccessRules(plan) : {}),
    }], { session });
  });
  if (req.files?.length) {
    const ownerMember = await OrganizationMember.findOne({ userId: user._id, organizationId }).lean();
    user.documents.push(...await storeLegacyUploads(req, ownerMember));
    await user.save();
  }

  res.status(201).json({ user: { ...user.toSafeJSON(), assignedCoach: assignedCoach ? String(assignedCoach) : null, observations: input.observations ?? '' } });
}

// `member` is the user's OrganizationMember in the request's organization, with assignedCoach populated.
// `roles` adds the staff roles held in the gyms of the request (`gymIds`) to the organization roles.
// `isActive` is the person's status in this organization; `canEditCredentials` is false for accounts other organizations use.
function serializeDirectoryUser(user, member, gymIds, { canEditCredentials = true } = {}) {
  const coach = member?.assignedCoach?.name ? member.assignedCoach : null;
  const visibleGyms = new Set(gymIds.map(String));
  const gymRoles = (member?.gyms ?? [])
    .filter((assignment) => visibleGyms.has(String(assignment.gymId)))
    .map((assignment) => ({ gymId: String(assignment.gymId), roles: [...assignment.roles] }));
  return {
    id: String(user._id),
    name: user.name,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    address: user.address,
    documents: user.documents,
    role: member ? legacyRole(member) : user.role,
    roles: [...new Set([...(member?.roles ?? []), ...gymRoles.flatMap((assignment) => assignment.roles)])],
    gymRoles,
    isActive: user.isActive && (member?.isActive ?? true),
    canEditCredentials,
    goal: user.goal,
    experienceLevel: user.experienceLevel,
    availableTrainingDays: user.availableTrainingDays,
    observations: member?.observations ?? '',
    membership: user.membership,
    assignedCoach: coach ? {
      id: String(coach._id),
      name: coach.name,
      email: coach.email,
    } : null,
  };
}

const DIRECTORY_FIELDS = '_id name lastName email phone address documents role isActive goal experienceLevel availableTrainingDays membership';

// Admins see the organization's clients and the staff of their gyms; Coach and Recepcion see clients only.
async function listDirectoryUsers(req, res) {
  const input = z.object({ role: z.enum(['Cliente', 'Coach']).optional() }).parse(req.query);
  const { organizationId, role, gymIds } = resolveTenant(req);
  if (input.role === 'Coach' && role !== 'Admin') throw new HttpError(403, 'No tienes permiso para ver Coaches.');

  // Former staff stay in the full list for owners and managers, so they can be reactivated.
  const members = (await OrganizationMember.find({ organizationId }).populate('assignedCoach', 'name email').lean())
    .filter((member) => member.isActive || (role === 'Admin' && !input.role && !member.roles.includes('Cliente')))
    .filter((member) => canSeeMember(req, member))
    .filter((member) => role !== 'Coach' || isAssignedCoach(member, req.user.id))
    .filter((member) => {
      if (role !== 'Admin' || input.role === 'Cliente') return member.roles.includes('Cliente');
      if (input.role === 'Coach') return hasGymRole(member, 'Coach', gymIds);
      return true;
    });
  const users = await User.find({ _id: { $in: members.map((member) => member.userId) } })
    .select(DIRECTORY_FIELDS)
    .sort({ name: 1 })
    .lean();
  const memberByUser = new Map(members.map((member) => [String(member.userId), member]));
  // Only owners and managers edit users, so only they need to know which accounts other organizations use.
  const sharedIds = new Set(role !== 'Admin' ? [] : (await OrganizationMember.distinct('userId', {
    userId: { $in: users.map((user) => user._id) },
    organizationId: { $ne: organizationId },
    isActive: true,
  })).map(String));

  res.json({
    users: users.map((user) => serializeDirectoryUser(user, memberByUser.get(String(user._id)), gymIds, {
      canEditCredentials: !sharedIds.has(String(user._id)),
    })),
  });
}

async function getDirectoryUser(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de usuario inválido.');
  const { role, gymIds } = resolveTenant(req);
  const member = await findVisibleMember(req, req.params.id, undefined, { includeInactive: role === 'Admin' });
  const client = await User.findById(req.params.id)
    .select(DIRECTORY_FIELDS)
    .lean();

  if (!client) throw new HttpError(404, 'Usuario no encontrado.');
  if (role !== 'Admin' && !member.roles.includes('Cliente')) throw new HttpError(404, 'Usuario no encontrado.');
  if (role === 'Coach' && !isAssignedCoach(member, req.user.id)) {
    throw new HttpError(404, 'Usuario no encontrado.');
  }

  await member.populate('assignedCoach', 'name email');
  res.json({ user: serializeDirectoryUser(client, member, gymIds, { canEditCredentials: await belongsOnlyTo(client, member.organizationId) }) });
}

async function updateDirectoryUser(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de usuario inválido.');
  const input = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    lastName: z.string().trim().max(50).optional(),
    email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()).optional(),
    phone: z.union([phoneSchema, z.literal('')]).optional(),
    address: z.string().trim().max(200).optional(),
    documents: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
    isActive: z.boolean().optional(),
    password: optionalPasswordSchema,
    goal: z.string().trim().max(120).optional(),
    experienceLevel: z.union([z.enum(['principiante', 'intermedio', 'avanzado']), z.literal('')]).optional(),
    availableTrainingDays: z.array(z.number().int().min(0).max(6)).max(7)
      .refine((days) => new Set(days).size === days.length, 'No repitas los días disponibles.')
      .optional(),
    assignedCoach: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal(''), z.null()])
      .transform((value) => value || null)
      .optional(),
    observations: z.string().trim().max(4000).optional(),
    roles: assignableRolesSchema.optional(),
    // The gym whose staff roles `roles` replaces; defaults to the selected or main gym.
    gymId: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal('')]).transform((value) => value || undefined).optional(),
  }).parse(normalizeMultipartBody(req));
  const { gymId: requestedGymId, ...changes } = input;
  if (Object.keys(changes).length === 0 && !req.files?.length) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const member = await findVisibleMember(req, req.params.id, undefined, { includeInactive: true });
  assertCanManage(req, member, input.roles);
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Usuario no encontrado.');
  await assertCredentialsEditable(user, member, input);
  if (input.roles) await changeRoles(req, user, member, input.roles, requestedGymId);

  if (input.email && input.email !== user.email) {
    if (await User.exists({ email: input.email, _id: { $ne: user._id } })) {
      throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
    }
    user.email = input.email;
  }
  if (input.name) user.name = input.name;
  if (input.lastName !== undefined) user.lastName = input.lastName;
  if (input.phone !== undefined) user.phone = input.phone || undefined;
  if (input.documents !== undefined) await applyLegacyDocumentList(req, user, input.documents);
  if (req.files?.length) user.documents.push(...await storeLegacyUploads(req, member));
  if (input.isActive !== undefined && input.isActive !== (user.isActive && member.isActive)) await setMemberActive(user, member, input.isActive);
  if (input.password?.trim()) await user.setPassword(input.password.trim());
  if (input.goal !== undefined) user.goal = input.goal;
  if (input.experienceLevel !== undefined) user.experienceLevel = input.experienceLevel;
  if (input.availableTrainingDays !== undefined) user.availableTrainingDays = input.availableTrainingDays;
  if (input.observations !== undefined) member.observations = input.observations;
  if (input.address !== undefined) {
    if (member.roles.includes('Cliente')) throw new HttpError(400, 'La dirección solo aplica al staff.');
    user.address = input.address || undefined;
  }
  if (input.assignedCoach !== undefined) {
    if (!member.roles.includes('Cliente')) throw new HttpError(400, 'Solo los clientes pueden tener Coach asignado.');
    if (input.assignedCoach) await assertCoachInGyms(req, input.assignedCoach);
    member.assignedCoach = input.assignedCoach;
  }
  await withTransaction(async (session) => {
    await user.save({ session });
    if (member.isModified()) await member.save({ session });
  });

  const updated = await User.findById(user._id)
    .select(DIRECTORY_FIELDS)
    .lean();
  await member.populate('assignedCoach', 'name email');
  res.json({ user: serializeDirectoryUser(updated, member, resolveTenant(req).gymIds, { canEditCredentials: await belongsOnlyTo(updated, member.organizationId) }) });
}

async function updateUser(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de usuario inválido.');
  const input = z.object({
    firstName: z.string().trim().min(1).max(50).optional(),
    lastName: z.string().trim().max(50).optional(),
    email: z.string().email().max(254).transform((email) => email.toLowerCase().trim()).optional(),
    role: z.enum(['Admin', 'Coach', 'Cliente']).optional(),
    roles: assignableRolesSchema.optional(),
    phone: z.union([phoneSchema, z.literal('')]).optional(),
    address: z.string().trim().max(200).optional(),
    documents: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
    isActive: z.boolean().optional(),
    password: optionalPasswordSchema,
    goal: z.string().trim().max(120).optional(),
    experienceLevel: z.union([z.enum(['principiante', 'intermedio', 'avanzado']), z.literal('')]).optional(),
    availableTrainingDays: z.array(z.number().int().min(0).max(6)).max(7)
      .refine((days) => new Set(days).size === days.length, 'No repitas los días disponibles.')
      .optional(),
    assignedCoach: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal(''), z.null()])
      .transform((value) => value || null)
      .optional(),
    observations: z.string().trim().max(4000).optional(),
    // The gym a new staff role applies to; defaults to the selected or main gym.
    gymId: z.union([z.string().regex(/^[a-f\d]{24}$/i), z.literal('')]).transform((value) => value || undefined).optional(),
  }).parse(normalizeMultipartBody(req));
  const { gymId: requestedGymId, ...changes } = input;
  if (Object.keys(changes).length === 0 && !req.files?.length) throw new HttpError(400, 'Envía al menos un campo para actualizar.');

  const member = await findVisibleMember(req, req.params.id, undefined, { includeInactive: true });
  const roles = input.roles ?? (input.role !== undefined && input.role !== legacyRole(member) ? LEGACY_ROLES[input.role] : undefined);
  assertCanManage(req, member, roles);
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Usuario no encontrado.');
  await assertCredentialsEditable(user, member, input);

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
    user.lastName = lastName;
  }
  if (roles) await changeRoles(req, user, member, roles, requestedGymId);
  if (input.phone !== undefined) user.phone = input.phone || undefined;
  if (input.address !== undefined) user.address = input.address || undefined;
  if (input.documents !== undefined) await applyLegacyDocumentList(req, user, input.documents);
  if (req.files?.length) user.documents.push(...await storeLegacyUploads(req, member));
  if (input.isActive !== undefined && input.isActive !== (user.isActive && member.isActive)) await setMemberActive(user, member, input.isActive);
  if (input.password?.trim()) await user.setPassword(input.password.trim());
  if (input.goal !== undefined) user.goal = input.goal;
  if (input.experienceLevel !== undefined) user.experienceLevel = input.experienceLevel;
  if (input.availableTrainingDays !== undefined) user.availableTrainingDays = input.availableTrainingDays;
  if (input.assignedCoach !== undefined) {
    if (!member.roles.includes('Cliente')) throw new HttpError(400, 'Solo los clientes pueden tener Coach asignado.');
    if (input.assignedCoach) await assertCoachInGyms(req, input.assignedCoach);
    member.assignedCoach = input.assignedCoach;
  }
  if (input.observations !== undefined) member.observations = input.observations;
  await withTransaction(async (session) => {
    await user.save({ session });
    if (member.isModified()) await member.save({ session });
  });

  res.json({ user: { ...user.toSafeJSON(), assignedCoach: member.assignedCoach ? String(member.assignedCoach) : null, observations: member.observations } });
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
  const member = await findClientMember(req, req.params.id);
  const membership = await Membership.findOne({ userId: member.userId, organizationId: member.organizationId });
  if (!membership) throw new HttpError(404, 'Cliente no encontrado.');

  const startsAt = input.startsAt ?? membership.startsAt;
  const expiresAt = input.expiresAt ?? membership.expiresAt;
  if (input.status === 'active' && !expiresAt) {
    throw new HttpError(400, 'Una membresía activa requiere fecha de vencimiento.');
  }
  if (startsAt && expiresAt && startsAt >= expiresAt) {
    throw new HttpError(400, 'El vencimiento debe ser posterior al inicio.');
  }

  membership.set({ ...input, startsAt, expiresAt });
  await saveMembership(membership);
  const user = await User.findById(member.userId);
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

  res.json(await authResponse(user));
}

async function getCurrentUser(req, res) {
  res.json(await sessionResponse(req.user, req.get('x-gym-id') || null));
}

async function getMyGyms(req, res) {
  res.json({ gyms: await listUserGyms(req.user), defaultGymId: req.tenant ? String(req.tenant.gymId) : null });
}

async function updatePhysicalProfile(req, res) {
  const input = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    lastName: z.string().trim().max(50).optional(),
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
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || undefined } : {}),
    },
  }, { new: true, runValidators: true });
  res.json({ user: user.toSafeJSON() });
}

module.exports = {
  credentialsSchema,
  registrationSchema,
  authResponse,
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
  getMyGyms,
  listUserGyms,
  updatePhysicalProfile,
  assignableRolesSchema,
  applyLegacyRole,
  serializeDirectoryUser,
};