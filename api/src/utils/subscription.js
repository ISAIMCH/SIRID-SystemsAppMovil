const Organization = require('../models/organization.model');
const SubscriptionPayment = require('../models/subscription-payment.model');
const HttpError = require('./http-error');
const { getPlan } = require('./saas-plans');

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 14;
const GRACE_DAYS = 3;
const TRIAL_PLAN = 'esencial';

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

function addInterval(date, interval) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + (interval === 'year' ? 12 : 1));
  return next;
}

// When the organization stopped being paid for: end of the trial, end of a period paid once (OXXO, PayPal,
// a renewal turned off), or the moment a renewal failed. null while it is paid.
function lapseDate(subscription) {
  switch (subscription.status) {
    case 'trialing': return subscription.trialEndsAt ?? null;
    case 'active': return subscription.renews ? null : subscription.currentPeriodEnd ?? null;
    default: return subscription.lapsedAt ?? subscription.currentPeriodEnd ?? new Date(0);
  }
}

// ok: everyone works. grace: the owner only sees billing, staff and clients keep working for GRACE_DAYS.
// expired: the grace period ended, only the owner gets in (to pay).
function subscriptionState(organization, now = new Date()) {
  const subscription = organization?.subscription;
  if (!subscription?.status || subscription.status === 'manual') return { phase: 'ok', lapsedAt: null, graceEndsAt: null };
  const lapsedAt = lapseDate(subscription);
  const graceEndsAt = lapsedAt && addDays(lapsedAt, GRACE_DAYS);
  if (!lapsedAt || now < lapsedAt) return { phase: 'ok', lapsedAt, graceEndsAt };
  return { phase: now < graceEndsAt ? 'grace' : 'expired', lapsedAt, graceEndsAt };
}

async function serializeSubscription(organization, now = new Date()) {
  const subscription = organization?.subscription ?? {};
  const plan = await getPlan(subscription.planCode);
  const { phase, lapsedAt, graceEndsAt } = subscriptionState(organization, now);
  return {
    planCode: subscription.planCode ?? null,
    planName: plan?.name ?? null,
    // Without a plan, SIRID manages the organization outside of billing.
    status: subscription.status ?? 'manual',
    phase,
    interval: subscription.interval ?? null,
    method: subscription.method ?? null,
    renews: Boolean(subscription.renews),
    trialEndsAt: subscription.trialEndsAt ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    lapsedAt: lapsedAt ?? null,
    graceEndsAt: graceEndsAt ?? null,
    daysLeft: lapsedAt && now < lapsedAt ? Math.ceil((lapsedAt - now) / DAY_MS) : null,
    gymLimit: organization?.gymLimit ?? null,
    features: plan?.features ?? null,
    pendingPayment: subscription.pendingPayment?.method ? {
      method: subscription.pendingPayment.method,
      planCode: subscription.pendingPayment.planCode,
      interval: subscription.pendingPayment.interval,
      voucherUrl: subscription.pendingPayment.voucherUrl ?? null,
      expiresAt: subscription.pendingPayment.expiresAt ?? null,
    } : null,
    hasStripeCustomer: Boolean(subscription.stripeCustomerId),
  };
}

// Owners sign up with a 14-day trial of Esencial, one per email and per phone; without it they pay first.
async function trialAvailable({ email, phone }) {
  return !await Organization.exists({ $or: [{ 'subscription.trialEmail': email }, { 'subscription.trialPhone': phone }] });
}

function initialSubscription({ email, phone, trial, now = new Date() }) {
  return trial
    ? { planCode: TRIAL_PLAN, status: 'trialing', renews: false, trialEndsAt: addDays(now, TRIAL_DAYS), trialEmail: email, trialPhone: phone }
    : { planCode: TRIAL_PLAN, status: 'incomplete', renews: false, lapsedAt: now };
}

// Staff and clients of an organization whose grace period ended see it as suspended (the app already handles
// that code); the payment details are only for the owner.
function subscriptionLapsedError(organization) {
  return new HttpError(403, 'Este gimnasio no está disponible temporalmente. Acude a recepción para más información.', {
    code: 'organization_suspended',
    organization: organization && { id: String(organization._id), name: organization.name, status: 'suspended', reason: null },
  });
}

async function subscriptionRequiredError(organization) {
  return new HttpError(402, 'Tu plan de GymGo no está pagado. Elige un plan para seguir usando el dashboard.', {
    code: 'subscription_required',
    subscription: await serializeSubscription(organization),
  });
}

function emitSubscriptionUpdate(io, organization) {
  if (!io || !organization) return;
  const id = String(organization._id);
  io.to([`org:${id}:owners`, `org:${id}:staff`]).emit('subscription:updated', {
    organizationId: id,
    planCode: organization.subscription?.planCode ?? null,
    status: organization.subscription?.status ?? null,
    phase: subscriptionState(organization).phase,
  });
}

// A period paid once (OXXO, PayPal): it starts when the current paid period ends, or now.
// Returns the updated organization, or null when this payment had already been applied.
async function applyPrepaidPayment({ organizationId, planCode, interval, provider, method, reference, amount, now = new Date() }) {
  const [organization, plan] = await Promise.all([Organization.findById(organizationId), getPlan(planCode)]);
  if (!organization || !plan) throw new HttpError(404, 'No se encontró la organización o el plan del pago.');
  const current = organization.subscription ?? {};
  const periodStart = current.status === 'active' && current.currentPeriodEnd > now ? current.currentPeriodEnd : now;
  const periodEnd = addInterval(periodStart, interval);

  try {
    await SubscriptionPayment.create({ organizationId, provider, method, reference, planCode, interval, amount, periodStart, periodEnd, paidAt: now });
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }

  return Organization.findByIdAndUpdate(organizationId, {
    $set: {
      'subscription.planCode': planCode,
      'subscription.status': 'active',
      'subscription.interval': interval,
      'subscription.provider': provider,
      'subscription.method': method,
      'subscription.renews': false,
      'subscription.currentPeriodEnd': periodEnd,
      gymLimit: plan.gymLimit,
    },
    $unset: { 'subscription.lapsedAt': '', 'subscription.pendingPayment': '' },
  }, { new: true });
}

// Stripe moved the billing period to the subscription items (API 2025-03-31); older objects keep it on top.
function stripePeriodEnd(stripeSubscription) {
  const ends = (stripeSubscription.items?.data ?? []).map((item) => item.current_period_end).filter(Boolean);
  const end = ends.length ? Math.max(...ends) : stripeSubscription.current_period_end;
  return end ? new Date(end * 1000) : null;
}

function stripeInvoiceSubscriptionId(invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
  return typeof subscription === 'string' ? subscription : subscription?.id ?? null;
}

// Mirrors a Stripe card subscription on its organization. Events can arrive late or out of order, so callers
// pass the subscription as Stripe has it now. Returns { organization, replacedSubscriptionId } or null.
async function syncStripeSubscription(stripeSubscription, now = new Date()) {
  const organizationId = stripeSubscription.metadata?.organizationId;
  const organization = organizationId
    ? await Organization.findById(organizationId)
    : await Organization.findOne({ 'subscription.stripeSubscriptionId': stripeSubscription.id });
  if (!organization) return null;
  const current = organization.subscription ?? {};
  const isCurrent = current.stripeSubscriptionId === stripeSubscription.id && current.method === 'card';
  const isLive = ['active', 'trialing'].includes(stripeSubscription.status);
  // A subscription that is no longer the organization's (replaced, or the owner moved to OXXO/PayPal) only
  // matters again if it becomes active.
  if (!isCurrent && !isLive) return null;

  const periodEnd = stripePeriodEnd(stripeSubscription);
  const planCode = stripeSubscription.metadata?.planCode ?? current.planCode;
  const set = {};
  const unset = {};
  if (isLive) {
    const plan = await getPlan(planCode);
    if (!plan) throw new HttpError(404, `El plan ${planCode} no existe.`);
    Object.assign(set, {
      'subscription.planCode': planCode,
      'subscription.status': 'active',
      'subscription.interval': stripeSubscription.metadata?.interval ?? current.interval ?? 'month',
      'subscription.provider': 'stripe',
      'subscription.method': 'card',
      'subscription.renews': !stripeSubscription.cancel_at_period_end && !stripeSubscription.cancel_at,
      'subscription.stripeSubscriptionId': stripeSubscription.id,
      gymLimit: plan.gymLimit,
    });
    const customer = stripeSubscription.customer;
    if (customer) set['subscription.stripeCustomerId'] = typeof customer === 'string' ? customer : customer.id;
    if (periodEnd) set['subscription.currentPeriodEnd'] = periodEnd;
    unset['subscription.lapsedAt'] = '';
  } else if (['past_due', 'unpaid'].includes(stripeSubscription.status)) {
    Object.assign(set, { 'subscription.status': 'past_due', 'subscription.lapsedAt': current.lapsedAt ?? now });
  } else if (['canceled', 'incomplete_expired'].includes(stripeSubscription.status)) {
    const endedAt = stripeSubscription.ended_at ? new Date(stripeSubscription.ended_at * 1000) : now;
    Object.assign(set, { 'subscription.status': 'canceled', 'subscription.renews': false, 'subscription.lapsedAt': current.lapsedAt ?? endedAt });
  } else {
    return null;
  }

  const updated = await Organization.findByIdAndUpdate(organization._id, {
    $set: set,
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  }, { new: true });
  const replaced = isLive && current.stripeSubscriptionId && current.stripeSubscriptionId !== stripeSubscription.id
    ? current.stripeSubscriptionId
    : null;
  return { organization: updated, replacedSubscriptionId: replaced };
}

module.exports = {
  TRIAL_DAYS,
  GRACE_DAYS,
  TRIAL_PLAN,
  addDays,
  addInterval,
  subscriptionState,
  serializeSubscription,
  trialAvailable,
  initialSubscription,
  subscriptionLapsedError,
  subscriptionRequiredError,
  emitSubscriptionUpdate,
  applyPrepaidPayment,
  stripePeriodEnd,
  stripeInvoiceSubscriptionId,
  syncStripeSubscription,
};
