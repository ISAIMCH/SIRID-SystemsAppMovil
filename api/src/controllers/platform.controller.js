const { z } = require('zod');
const Organization = require('../models/organization.model');
const OrganizationMember = require('../models/organization-member.model');
const Gym = require('../models/gym.model');
const Membership = require('../models/membership.model');
const HttpError = require('../utils/http-error');
const { subscriptionState, emitSubscriptionUpdate } = require('../utils/subscription');
const { getPlan } = require('../utils/saas-plans');

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ID de organización inválido.');

// What SIRID can do with an organization in each status; a rejected one comes back only when its owner signs up again.
const STATUS_TRANSITIONS = {
  pending: ['active', 'rejected'],
  active: ['suspended'],
  suspended: ['active'],
  rejected: [],
};

// The plan without payment details: SIRID sees whether the organization is paid, not its cards.
function subscriptionSummary(organization) {
  const subscription = organization.subscription ?? {};
  const { phase, graceEndsAt } = subscriptionState(organization);
  return {
    planCode: subscription.planCode ?? null,
    status: subscription.status ?? 'manual',
    phase,
    method: subscription.method ?? null,
    renews: Boolean(subscription.renews),
    trialEndsAt: subscription.trialEndsAt ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    graceEndsAt: graceEndsAt ?? null,
  };
}

const countBy = (rows) => new Map(rows.map((row) => [String(row._id), row]));

// SIRID only sees how big each organization is, never the people in it: counts plus the owner's contact.
async function organizationSummaries(organizations) {
  const organizationIds = organizations.map((organization) => organization._id);
  const [gyms, members, memberships, owners] = await Promise.all([
    Gym.aggregate([
      { $match: { organizationId: { $in: organizationIds }, isActive: true } },
      { $group: { _id: '$organizationId', count: { $sum: 1 } } },
    ]),
    OrganizationMember.aggregate([
      { $match: { organizationId: { $in: organizationIds }, isActive: true } },
      { $group: {
        _id: '$organizationId',
        staff: { $sum: { $cond: [{ $gt: [{ $size: '$gyms' }, 0] }, 1, 0] } },
        clients: { $sum: { $cond: [{ $in: ['Cliente', '$roles'] }, 1, 0] } },
      } },
    ]),
    Membership.aggregate([
      { $match: { organizationId: { $in: organizationIds }, status: 'active' } },
      { $group: { _id: '$organizationId', count: { $sum: 1 } } },
    ]),
    OrganizationMember.find({ organizationId: { $in: organizationIds }, roles: 'Propietario' })
      .sort({ createdAt: 1 })
      .populate('userId', 'name lastName email phone')
      .lean(),
  ]);
  const [gymCounts, memberCounts, membershipCounts] = [countBy(gyms), countBy(members), countBy(memberships)];

  return organizations.map((organization) => {
    const id = String(organization._id);
    const owner = owners.find((member) => String(member.organizationId) === id)?.userId;
    return {
      id,
      name: organization.name,
      slug: organization.slug,
      legalName: organization.legalName ?? null,
      rfc: organization.rfc ?? null,
      status: organization.status,
      statusReason: organization.statusReason ?? null,
      gymLimit: organization.gymLimit ?? Organization.DEFAULT_GYM_LIMIT,
      allowedTransitions: STATUS_TRANSITIONS[organization.status] ?? [],
      subscription: subscriptionSummary(organization),
      createdAt: organization.createdAt,
      approvedAt: organization.approvedAt,
      owner: owner ? { name: owner.name, lastName: owner.lastName ?? '', email: owner.email, phone: owner.phone ?? null } : null,
      counts: {
        gyms: gymCounts.get(id)?.count ?? 0,
        staff: memberCounts.get(id)?.staff ?? 0,
        clients: memberCounts.get(id)?.clients ?? 0,
        activeMemberships: membershipCounts.get(id)?.count ?? 0,
      },
    };
  });
}

async function findOrganization(id) {
  const organization = await Organization.findById(objectIdSchema.parse(id));
  if (!organization) throw new HttpError(404, 'Organización no encontrada.');
  return organization;
}

async function listOrganizations(req, res) {
  const { status, search } = z.object({
    status: z.enum(Organization.ORGANIZATION_STATUSES).optional(),
    search: z.string().trim().max(120).optional(),
  }).parse(req.query);
  const escaped = search?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const organizations = await Organization.find({
    ...(status ? { status } : {}),
    ...(escaped ? { $or: [{ name: new RegExp(escaped, 'i') }, { legalName: new RegExp(escaped, 'i') }, { rfc: new RegExp(escaped, 'i') }] } : {}),
  }).sort({ createdAt: -1 }).limit(500).lean();
  const statusCounts = await Organization.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  res.json({
    organizations: await organizationSummaries(organizations),
    statusCounts: Object.fromEntries(Organization.ORGANIZATION_STATUSES.map((item) => [item, statusCounts.find((row) => row._id === item)?.count ?? 0])),
  });
}

// The detail adds the gyms (name and address only) so SIRID can confirm the request by phone.
async function getOrganization(req, res) {
  const organization = await findOrganization(req.params.id);
  const [[summary], gyms] = await Promise.all([
    organizationSummaries([organization.toObject()]),
    Gym.find({ organizationId: organization._id }).sort({ createdAt: 1 }).select('name address timezone isActive createdAt').lean(),
  ]);
  res.json({
    organization: {
      ...summary,
      gyms: gyms.map((gym) => ({ id: String(gym._id), name: gym.name, address: gym.address ?? '', timezone: gym.timezone, isActive: gym.isActive, createdAt: gym.createdAt })),
    },
  });
}

// Approving opens the organization at once; rejecting or suspending needs a reason the owner sees when logging in.
async function updateOrganizationStatus(req, res) {
  const input = z.object({
    status: z.enum(['active', 'rejected', 'suspended']),
    reason: z.string().trim().max(500).optional(),
  }).superRefine((data, context) => {
    if (data.status !== 'active' && !data.reason) context.addIssue({ code: 'custom', path: ['reason'], message: 'Indica el motivo.' });
  }).parse(req.body);

  const organization = await findOrganization(req.params.id);
  if (!(STATUS_TRANSITIONS[organization.status] ?? []).includes(input.status)) {
    throw new HttpError(409, `No se puede pasar de "${organization.status}" a "${input.status}".`);
  }
  organization.set({ status: input.status, statusReason: input.status === 'active' ? null : input.reason });
  if (input.status === 'active' && !organization.approvedAt) organization.set({ approvedAt: new Date(), approvedBy: req.user._id });
  await organization.save();

  const [summary] = await organizationSummaries([organization.toObject()]);
  res.json({ organization: summary });
}

// A lower limit never closes gyms that are already open; it only stops new ones.
async function updateOrganization(req, res) {
  const { gymLimit } = z.object({ gymLimit: z.coerce.number().int().min(1).max(100) }).parse(req.body);
  const organization = await findOrganization(req.params.id);
  organization.set({ gymLimit });
  await organization.save();

  const [summary] = await organizationSummaries([organization.toObject()]);
  res.json({ organization: summary });
}

const subscriptionUpdateSchema = z.discriminatedUnion('status', [
  // Sold by SIRID's team (Cadena, hardware IoT): no expiry until SIRID changes it.
  z.object({ status: z.literal('manual'), planCode: z.string().trim().toLowerCase(), gymLimit: z.coerce.number().int().min(1).max(100).optional() }),
  // Paid outside the web until a date.
  z.object({ status: z.literal('active'), planCode: z.string().trim().toLowerCase(), currentPeriodEnd: z.coerce.date(), gymLimit: z.coerce.number().int().min(1).max(100).optional() }),
  // A longer (or new) trial.
  z.object({ status: z.literal('trialing'), trialEndsAt: z.coerce.date() }),
]);

// SIRID activates what it sells outside the web. A card that renews by itself is cancelled in Stripe first,
// so the owner is never billed twice.
async function updateOrganizationSubscription(req, res) {
  const input = subscriptionUpdateSchema.parse(req.body);
  const organization = await findOrganization(req.params.id);
  const current = organization.subscription ?? {};
  if (current.method === 'card' && current.renews && current.status === 'active') {
    throw new HttpError(409, 'La organización paga con tarjeta y se renueva sola: cancela su suscripción en Stripe antes de cambiar el plan a mano.', { code: 'subscription_active' });
  }
  if (input.status === 'trialing' && input.trialEndsAt <= new Date()) throw new HttpError(400, 'La prueba debe terminar en el futuro.');
  if (input.status === 'active' && input.currentPeriodEnd <= new Date()) throw new HttpError(400, 'El periodo pagado debe terminar en el futuro.');

  const set = { 'subscription.status': input.status, 'subscription.renews': false };
  const unset = { 'subscription.lapsedAt': '' };
  if (input.status === 'trialing') {
    set['subscription.trialEndsAt'] = input.trialEndsAt;
  } else {
    const plan = await getPlan(input.planCode);
    if (!plan) throw new HttpError(404, 'Ese plan no existe.');
    Object.assign(set, {
      'subscription.planCode': plan.code,
      'subscription.provider': 'manual',
      'subscription.method': 'manual',
      gymLimit: input.gymLimit ?? plan.gymLimit,
    });
    if (input.status === 'active') set['subscription.currentPeriodEnd'] = input.currentPeriodEnd;
    else unset['subscription.currentPeriodEnd'] = '';
  }
  const updated = await Organization.findByIdAndUpdate(organization._id, { $set: set, $unset: unset }, { new: true });
  emitSubscriptionUpdate(req.app.get('io'), updated);

  const [summary] = await organizationSummaries([updated.toObject()]);
  res.json({ organization: summary });
}

module.exports = { STATUS_TRANSITIONS, listOrganizations, getOrganization, updateOrganizationStatus, updateOrganization, updateOrganizationSubscription };
