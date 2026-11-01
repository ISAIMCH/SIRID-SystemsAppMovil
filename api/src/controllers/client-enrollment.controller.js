const { z } = require('zod');
const User = require('../models/user.model');
const Gym = require('../models/gym.model');
const OrganizationMember = require('../models/organization-member.model');
const HttpError = require('../utils/http-error');
const withTransaction = require('../utils/transaction');
const { addClientToGym } = require('../utils/join-gym');
const { belongsOnlyTo, findClientMember } = require('../utils/members');
const { resolveTargetGym, resolveTenant } = require('../utils/tenant');
const { createActivation, isActivationUsable, verifyActivationCode, unusablePassword } = require('../utils/client-activation');
const { authResponse, credentialsSchema, membershipsByUser, phoneSchema, serializeDirectoryUser, DIRECTORY_FIELDS } = require('./auth.controller');

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido.');

async function directoryEntry(req, userId) {
  const { organizationId, gymIds } = resolveTenant(req);
  const [user, member, memberships] = await Promise.all([
    User.findById(userId).select(DIRECTORY_FIELDS).lean(),
    OrganizationMember.findOne({ userId, organizationId }).populate('assignedCoach', 'name email').lean(),
    membershipsByUser([userId], organizationId),
  ]);
  return serializeDirectoryUser(user, member, gymIds, {
    canEditCredentials: await belongsOnlyTo(user, organizationId),
    membership: memberships.get(String(userId)),
  });
}

function activationBody({ code, expiresAt }) {
  return { code, expiresAt };
}

// Reception registers a client who came without the app, so a plan can be sold right away. A new account gets a
// one-time activation code for the app; an existing GymGo account is linked and its holder sees a notice in the app.
async function enrollClient(req, res) {
  const input = z.object({
    name: z.string().trim().min(2).max(100),
    lastName: z.string().trim().max(50).optional(),
    email: credentialsSchema.shape.email,
    phone: phoneSchema,
    // The client's home gym; defaults to the selected or main gym.
    gymId: z.union([objectIdSchema, z.literal('')]).transform((value) => value || undefined).optional(),
  }).parse(req.body);
  const { organizationId } = resolveTenant(req);
  const gym = await Gym.findOne({ _id: resolveTargetGym(req, input.gymId), organizationId, isActive: true });
  if (!gym) throw new HttpError(404, 'Sucursal no encontrada.');

  const existing = await User.findOne({ email: input.email });
  if (!existing) {
    const activation = await createActivation();
    const user = new User({
      name: input.name,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      role: 'Cliente',
      membership: { status: 'pending' },
      pendingActivation: true,
      activation: activation.activation,
    });
    await user.setPassword(unusablePassword());
    await withTransaction(async (session) => {
      await user.save({ session });
      await addClientToGym(user._id, gym, { session });
    });
    return res.status(201).json({ user: await directoryEntry(req, user._id), linkedExisting: false, activation: activationBody(activation) });
  }

  const member = await OrganizationMember.findOne({ userId: existing._id, organizationId }).lean();
  if (member && !member.isActive) throw new HttpError(409, 'Esa cuenta está desactivada en este gimnasio; pide a un gerente que la reactive.');
  if (member && !member.roles.includes('Cliente')) throw new HttpError(409, 'Esa cuenta es parte del staff de este gimnasio.');
  if (member) return res.json({ user: await directoryEntry(req, existing._id), alreadyClient: true, linkedExisting: true, activation: null });

  // An account another gym opened and nobody activated yet gets a new code; the previous one stops working.
  const activation = existing.pendingActivation ? await createActivation() : null;
  await withTransaction(async (session) => {
    await addClientToGym(existing._id, gym, { session });
    if (activation) {
      await User.updateOne({ _id: existing._id }, { $set: { activation: activation.activation } }, { session });
    } else {
      await OrganizationMember.updateOne(
        { userId: existing._id, organizationId },
        { $set: { enrollmentNotice: { gymId: gym._id, createdAt: new Date(), seenAt: null } } },
        { session },
      );
    }
  });
  if (!activation) req.app?.get('io')?.to(`user:${existing._id}`).emit('client-enrollment:created', { organizationId: String(organizationId), gymId: String(gym._id) });
  res.status(201).json({
    user: await directoryEntry(req, existing._id),
    linkedExisting: true,
    activation: activation ? activationBody(activation) : null,
  });
}

// A new code for a client who lost theirs or let it expire; only while the account is not activated.
async function regenerateActivationCode(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de usuario inválido.');
  await findClientMember(req, req.params.id);
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Cliente no encontrado.');
  if (!user.pendingActivation) throw new HttpError(409, 'La cuenta ya está activada.');
  const activation = await createActivation();
  user.activation = activation.activation;
  await user.save();
  res.json({ activation: activationBody(activation) });
}

// The client opens the account reception created: email, the code and a password of their own. Signs them in.
async function activateAccount(req, res) {
  const input = credentialsSchema.extend({ code: z.string().trim().min(1).max(20) }).parse(req.body);
  const user = await User.findOne({ email: input.email }).select('+activation');
  const invalid = new HttpError(400, 'Correo o código incorrectos.');
  if (!user?.pendingActivation || !user.activation || !user.isActive) throw invalid;
  if (!isActivationUsable(user.activation)) {
    throw new HttpError(400, 'El código ya no es válido. Pide uno nuevo en recepción.', { code: 'activation_code_expired' });
  }
  if (!await verifyActivationCode(user.activation, input.code)) {
    await User.updateOne({ _id: user._id }, { $inc: { 'activation.failedAttempts': 1 } });
    throw invalid;
  }

  await user.setPassword(input.password);
  user.pendingActivation = false;
  user.activation = null;
  await user.save();
  res.json(await authResponse(user));
}

// Gyms whose reception added this account as a client and the holder has not been told yet.
async function listEnrollmentNotices(req, res) {
  const members = await OrganizationMember.find({
    userId: req.user._id,
    isActive: true,
    'enrollmentNotice.gymId': { $exists: true },
    'enrollmentNotice.seenAt': null,
  }).populate('organizationId', 'name status').lean();
  const active = members.filter((member) => member.organizationId?.status === 'active');
  const gyms = await Gym.find({ _id: { $in: active.map((member) => member.enrollmentNotice.gymId) } }).select('name').lean();
  const gymNames = new Map(gyms.map((gym) => [String(gym._id), gym.name]));
  res.json({
    notices: active.map((member) => ({
      organization: { id: String(member.organizationId._id), name: member.organizationId.name },
      gym: { id: String(member.enrollmentNotice.gymId), name: gymNames.get(String(member.enrollmentNotice.gymId)) ?? '' },
      createdAt: member.enrollmentNotice.createdAt,
    })),
  });
}

async function dismissEnrollmentNotice(req, res) {
  const organizationId = objectIdSchema.parse(req.params.organizationId);
  await OrganizationMember.updateOne(
    { userId: req.user._id, organizationId, 'enrollmentNotice.gymId': { $exists: true }, 'enrollmentNotice.seenAt': null },
    { $set: { 'enrollmentNotice.seenAt': new Date() } },
  );
  res.status(204).end();
}

module.exports = { enrollClient, regenerateActivationCode, activateAccount, listEnrollmentNotices, dismissEnrollmentNotice };
