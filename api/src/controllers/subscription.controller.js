const { z } = require('zod');
const env = require('../config/env');
const Organization = require('../models/organization.model');
const SubscriptionPayment = require('../models/subscription-payment.model');
const HttpError = require('../utils/http-error');
const { resolveTenant } = require('../utils/tenant');
const { TRIAL_DAYS, GRACE_DAYS, serializeSubscription, subscriptionState, emitSubscriptionUpdate, applyPrepaidPayment, syncStripeSubscription, stripeInvoiceSubscriptionId, addDays } = require('../utils/subscription');
const { listPlans, getPlan, planAmountCents, serializePlan } = require('../utils/saas-plans');
// isPaypalConfigured y paypalRequest siguen en payment-providers para el flujo real comentado.
const { isStripeConfigured, getStripe, stripeCall } = require('../utils/payment-providers');

const OXXO_DAYS = 3;
const intervalSchema = z.enum(['month', 'year']).default('month');

function paymentOptions() {
  const stripe = isStripeConfigured();
  return {
    card: stripe,
    oxxo: stripe && env.STRIPE_ENABLE_OXXO,
    // PayPal simulado: el botón siempre aparece y no usa llaves (ver startPaypalDemo).
    paypal: true,
    paypalDemo: true,
    paypalClientId: null,
    testMode: env.STRIPE_SECRET_KEY.startsWith('sk_test_'),
  };
}

// Public: the pricing page of the web.
async function listSaasPlans(req, res) {
  res.json({
    plans: (await listPlans()).map(serializePlan),
    trialDays: TRIAL_DAYS,
    graceDays: GRACE_DAYS,
    payments: paymentOptions(),
  });
}

async function loadOrganization(req) {
  const organization = await Organization.findById(resolveTenant(req).organizationId);
  if (!organization) throw new HttpError(404, 'Organización no encontrada.');
  return organization;
}

async function getMySubscription(req, res) {
  const organization = await loadOrganization(req);
  res.json({
    organization: { id: String(organization._id), name: organization.name },
    subscription: await serializeSubscription(organization),
    plans: (await listPlans()).map(serializePlan),
    payments: paymentOptions(),
  });
}

async function listMyPayments(req, res) {
  const { organizationId } = resolveTenant(req);
  const payments = await SubscriptionPayment.find({ organizationId }).sort({ paidAt: -1 }).limit(100).lean();
  res.json({
    payments: payments.map((payment) => ({
      id: String(payment._id),
      provider: payment.provider,
      method: payment.method,
      reference: payment.reference,
      planCode: payment.planCode,
      interval: payment.interval,
      amount: payment.amount,
      currency: payment.currency,
      periodStart: payment.periodStart,
      periodEnd: payment.periodEnd,
      paidAt: payment.paidAt,
    })),
  });
}

// Stripe sends the owner back to the web or the dashboard, never to a site outside CORS_ORIGINS.
function assertReturnUrl(req, value) {
  const url = new URL(value);
  const allowed = req.app.get('allowedOrigins') ?? [];
  const isHttp = url.protocol === 'https:' || url.protocol === 'http:';
  if (!isHttp || (allowed.length > 0 && !allowed.includes(url.origin))) {
    throw new HttpError(400, 'La URL de regreso no pertenece a GymGo.');
  }
  return url.toString();
}

// Plans sold by SIRID's team and organizations SIRID manages by hand are not bought online, and a card
// subscription that renews by itself changes plan from Stripe's portal (no double charge).
async function assertCanBuy(organization, planCode) {
  const plan = await getPlan(planCode);
  if (!plan || plan.isActive === false) throw new HttpError(404, 'Ese plan no existe.');
  if (!plan.selfService || planAmountCents(plan, 'month') === null) {
    throw new HttpError(409, 'Este plan se contrata con nuestro equipo de ventas.', { code: 'plan_requires_sales' });
  }
  const current = organization.subscription ?? {};
  if (current.status === 'manual') throw new HttpError(409, 'SIRID administra el plan de tu organización. Contáctanos para cambiarlo.', { code: 'subscription_manual' });
  if (current.status === 'active' && current.method === 'card' && current.renews) {
    throw new HttpError(409, 'Tu plan ya se renueva con tarjeta. Cámbialo o cancélalo desde el portal de pagos.', { code: 'subscription_active' });
  }
  return plan;
}

async function ensureStripeCustomer(stripe, organization, user) {
  if (organization.subscription?.stripeCustomerId) return organization.subscription.stripeCustomerId;
  const customer = await stripeCall(() => stripe.customers.create({
    name: organization.name,
    email: user.email,
    metadata: { organizationId: String(organization._id) },
  }));
  await Organization.updateOne({ _id: organization._id }, { $set: { 'subscription.stripeCustomerId': customer.id } });
  return customer.id;
}

const checkoutSchema = z.object({
  planCode: z.string().trim().toLowerCase().min(2).max(30),
  interval: intervalSchema,
  method: z.enum(['card', 'oxxo']).default('card'),
  successUrl: z.string().url().max(500),
  cancelUrl: z.string().url().max(500),
});

// Card: a Stripe subscription that renews every period. OXXO: one period paid at the store (Stripe can't
// renew OXXO). Access changes only when Stripe's webhook confirms the payment.
async function createCheckout(req, res) {
  const input = checkoutSchema.parse(req.body);
  const successUrl = assertReturnUrl(req, input.successUrl);
  const cancelUrl = assertReturnUrl(req, input.cancelUrl);
  if (input.method === 'oxxo' && !env.STRIPE_ENABLE_OXXO) throw new HttpError(409, 'El pago en OXXO no está disponible.');
  const stripe = getStripe();
  const organization = await loadOrganization(req);
  const plan = await assertCanBuy(organization, input.planCode);
  const customer = await ensureStripeCustomer(stripe, organization, req.user);

  const metadata = { organizationId: String(organization._id), planCode: plan.code, interval: input.interval, method: input.method };
  const periodLabel = input.interval === 'year' ? 'anual' : 'mensual';
  const priceData = {
    currency: 'mxn',
    unit_amount: planAmountCents(plan, input.interval),
    product_data: { name: `GymGo ${plan.name} (${periodLabel})`, description: 'Incluye IVA 16%.' },
  };
  const separator = successUrl.includes('?') ? '&' : '?';
  const params = {
    customer,
    client_reference_id: String(organization._id),
    metadata,
    locale: 'es',
    success_url: `${successUrl}${separator}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  };

  if (input.method === 'card') {
    // A period already paid once (OXXO, PayPal) is honored: the card is first charged when it ends.
    const current = organization.subscription ?? {};
    const paidUntil = current.status === 'active' && current.currentPeriodEnd > addDays(new Date(), 2) ? current.currentPeriodEnd : null;
    Object.assign(params, {
      mode: 'subscription',
      line_items: [{ quantity: 1, price_data: { ...priceData, recurring: { interval: input.interval } } }],
      subscription_data: { metadata, ...(paidUntil ? { trial_end: Math.floor(paidUntil.getTime() / 1000) } : {}) },
    });
  } else {
    Object.assign(params, {
      mode: 'payment',
      // Stripe picks methods from the Dashboard (payment_method_types is no longer accepted); this session is the OXXO one.
      excluded_payment_method_types: ['card'],
      payment_method_options: { oxxo: { expires_after_days: OXXO_DAYS } },
      payment_intent_data: { metadata },
      line_items: [{ quantity: 1, price_data: priceData }],
    });
  }

  const session = await stripeCall(() => stripe.checkout.sessions.create(params));
  res.status(201).json({ url: session.url, sessionId: session.id });
}

// Stripe's own page to change card, switch plan or cancel the renewal.
async function createPortal(req, res) {
  const { returnUrl } = z.object({ returnUrl: z.string().url().max(500) }).parse(req.body);
  const stripe = getStripe();
  const organization = await loadOrganization(req);
  const customer = organization.subscription?.stripeCustomerId;
  if (!customer) throw new HttpError(409, 'Aún no tienes pagos con tarjeta.', { code: 'no_stripe_customer' });
  const session = await stripeCall(() => stripe.billingPortal.sessions.create({ customer, return_url: assertReturnUrl(req, returnUrl), locale: 'es' }));
  res.status(201).json({ url: session.url });
}

async function finishPayment(req, organization) {
  emitSubscriptionUpdate(req.app.get('io'), organization);
  return serializeSubscription(organization);
}

/* ===== PayPal (simulado) =====
 * Solo para la evaluación escolar: no hay cuenta de PayPal Developer y PayPal se quitará después.
 * El botón de la web no habla con PayPal; esta ruta da una prueba de 5 días del plan elegido, una vez por
 * organización y sin registrar ningún pago. El flujo real (crear y capturar órdenes) quedó comentado abajo.
 */
const PAYPAL_DEMO_DAYS = 5;

async function startPaypalDemo(req, res) {
  const { planCode } = z.object({ planCode: z.string().trim().toLowerCase().min(2).max(30) }).parse(req.body);
  const organization = await loadOrganization(req);
  const plan = await assertCanBuy(organization, planCode);
  const current = organization.subscription ?? {};
  if (current.demoTrialUsedAt) {
    throw new HttpError(409, 'Tu organización ya usó la prueba de PayPal. Paga con tarjeta u OXXO para continuar.', { code: 'paypal_demo_used' });
  }
  if (current.status === 'active' && subscriptionState(organization).phase === 'ok') {
    throw new HttpError(409, 'Tu plan ya está pagado; no necesitas la prueba de PayPal.', { code: 'subscription_active' });
  }
  const now = new Date();
  const updated = await Organization.findOneAndUpdate(
    { _id: organization._id, 'subscription.demoTrialUsedAt': { $exists: false } },
    {
      $set: {
        'subscription.planCode': plan.code,
        'subscription.status': 'trialing',
        'subscription.provider': 'paypal',
        'subscription.method': 'paypal',
        'subscription.renews': false,
        'subscription.trialEndsAt': addDays(now, PAYPAL_DEMO_DAYS),
        'subscription.demoTrialUsedAt': now,
      },
      $unset: { 'subscription.lapsedAt': '', 'subscription.currentPeriodEnd': '', 'subscription.interval': '' },
    },
    { new: true },
  );
  if (!updated) throw new HttpError(409, 'Tu organización ya usó la prueba de PayPal.', { code: 'paypal_demo_used' });
  res.json({ simulated: true, trialDays: PAYPAL_DEMO_DAYS, subscription: await finishPayment(req, updated) });
}

/* ===== PayPal real (desactivado; requiere PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET) ===== */
// /* ===== PayPal: the browser approves, the API captures and checks the order with PayPal. ===== */
//
// async function createPaypalOrder(req, res) {
//   const input = z.object({ planCode: z.string().trim().toLowerCase().min(2).max(30), interval: intervalSchema }).parse(req.body);
//   const organization = await loadOrganization(req);
//   const plan = await assertCanBuy(organization, input.planCode);
//   const total = (planAmountCents(plan, input.interval) / 100).toFixed(2);
//   const order = await paypalRequest('/v2/checkout/orders', {
//     body: {
//       intent: 'CAPTURE',
//       purchase_units: [{
//         reference_id: String(organization._id),
//         custom_id: `${organization._id}:${plan.code}:${input.interval}`,
//         description: `GymGo ${plan.name} (${input.interval === 'year' ? 'anual' : 'mensual'}), IVA incluido`,
//         amount: { currency_code: 'MXN', value: total },
//       }],
//       payment_source: { paypal: { experience_context: { brand_name: 'GymGo', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', locale: 'es-MX' } } },
//     },
//   });
//   res.status(201).json({ orderId: order.id });
// }
//
// async function capturePaypalOrder(req, res) {
//   const { orderId } = z.object({ orderId: z.string().regex(/^[A-Z0-9]{8,40}$/, 'Orden de PayPal inválida.') }).parse(req.params);
//   const organization = await loadOrganization(req);
//
//   let order;
//   try {
//     order = await paypalRequest(`/v2/checkout/orders/${orderId}/capture`, { body: {} });
//   } catch (error) {
//     // Captured on an earlier try (e.g. the browser lost the response): read it instead.
//     if (error.extra?.issue !== 'ORDER_ALREADY_CAPTURED') throw error;
//     order = await paypalRequest(`/v2/checkout/orders/${orderId}`, { method: 'GET' });
//   }
//
//   const unit = order.purchase_units?.[0];
//   const capture = unit?.payments?.captures?.find((item) => item.status === 'COMPLETED');
//   const [organizationId, planCode, interval] = String(capture?.custom_id ?? unit?.custom_id ?? '').split(':');
//   if (order.status !== 'COMPLETED' || !capture) throw new HttpError(402, 'PayPal no confirmó el pago.', { code: 'paypal_not_completed' });
//   if (organizationId !== String(organization._id)) throw new HttpError(403, 'Esa orden de PayPal no es de tu organización.');
//   const plan = await getPlan(planCode);
//   const expected = plan && (planAmountCents(plan, interval) / 100).toFixed(2);
//   if (!expected || capture.amount?.currency_code !== 'MXN' || capture.amount?.value !== expected) {
//     throw new HttpError(409, 'El monto pagado en PayPal no coincide con el plan.', { code: 'paypal_amount_mismatch' });
//   }
//
//   const updated = await applyPrepaidPayment({
//     organizationId: organization._id,
//     planCode,
//     interval,
//     provider: 'paypal',
//     method: 'paypal',
//     reference: capture.id,
//     amount: Number(capture.amount.value),
//   });
//   res.json({ subscription: await finishPayment(req, updated ?? await loadOrganization(req)) });
// }

/* ===== Stripe webhook ===== */

async function retrieveAndSync(stripe, subscriptionId) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const result = await syncStripeSubscription(subscription);
  // Buying a new plan with a card replaces the previous subscription instead of charging both.
  if (result?.replacedSubscriptionId) {
    await stripe.subscriptions.cancel(result.replacedSubscriptionId).catch((error) => {
      console.error(`No se pudo cancelar la suscripción reemplazada ${result.replacedSubscriptionId}:`, error.message);
    });
  }
  return result?.organization ?? null;
}

// OXXO: Stripe confirms the voucher was created now and the payment hours or days later.
async function handleCheckoutSession(stripe, session, type) {
  const organizationId = session.client_reference_id ?? session.metadata?.organizationId;
  if (!organizationId) return null;

  if (session.mode === 'subscription') {
    if (type !== 'checkout.session.completed' || !session.subscription) return null;
    return retrieveAndSync(stripe, typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
  }
  if (session.mode !== 'payment') return null;

  if (type === 'checkout.session.async_payment_failed') {
    return Organization.findOneAndUpdate(
      { _id: organizationId, 'subscription.pendingPayment.reference': session.id },
      { $unset: { 'subscription.pendingPayment': '' } },
      { new: true },
    );
  }
  const { planCode, interval } = session.metadata ?? {};
  if (session.payment_status === 'paid') {
    return applyPrepaidPayment({
      organizationId,
      planCode,
      interval,
      provider: 'stripe',
      method: session.metadata?.method === 'card' ? 'card' : 'oxxo',
      reference: session.id,
      amount: session.amount_total / 100,
    });
  }
  if (type !== 'checkout.session.completed') return null;

  let voucher = {};
  if (session.payment_intent) {
    const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
    const intent = await stripe.paymentIntents.retrieve(intentId).catch(() => null);
    const details = intent?.next_action?.oxxo_display_details;
    voucher = { voucherUrl: details?.hosted_voucher_url, expiresAt: details?.expires_after ? new Date(details.expires_after * 1000) : undefined };
  }
  return Organization.findByIdAndUpdate(organizationId, {
    $set: {
      'subscription.pendingPayment': {
        method: 'oxxo',
        reference: session.id,
        planCode,
        interval,
        voucherUrl: voucher.voucherUrl,
        expiresAt: voucher.expiresAt ?? addDays(new Date(), OXXO_DAYS),
      },
    },
  }, { new: true });
}

async function handleInvoice(stripe, invoice, type) {
  const subscriptionId = stripeInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return null;
  const organization = await retrieveAndSync(stripe, subscriptionId);
  if (organization && type === 'invoice.paid' && invoice.amount_paid > 0) {
    const line = invoice.lines?.data?.[0];
    await SubscriptionPayment.updateOne({ reference: invoice.id }, {
      $setOnInsert: {
        organizationId: organization._id,
        provider: 'stripe',
        method: 'card',
        planCode: organization.subscription.planCode,
        interval: organization.subscription.interval ?? 'month',
        amount: invoice.amount_paid / 100,
        currency: String(invoice.currency ?? 'mxn').toUpperCase(),
        periodStart: line?.period?.start ? new Date(line.period.start * 1000) : null,
        periodEnd: line?.period?.end ? new Date(line.period.end * 1000) : null,
        paidAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date(),
      },
    }, { upsert: true });
  }
  return organization;
}

async function handleStripeEvent(stripe, event) {
  const object = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
      return handleCheckoutSession(stripe, object, event.type);
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return handleInvoice(stripe, object, event.type);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return retrieveAndSync(stripe, object.id);
    default:
      return null;
  }
}

// Mounted with express.raw in app.js: the signature is computed over the exact bytes Stripe sent.
// Every handler is idempotent, so Stripe's retries (on any error here) are safe.
async function stripeWebhook(req, res) {
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature') ?? '', env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new HttpError(400, 'Firma de Stripe inválida.');
  }
  const organization = await handleStripeEvent(stripe, event);
  if (organization) emitSubscriptionUpdate(req.app.get('io'), organization);
  res.json({ received: true });
}

module.exports = {
  listSaasPlans,
  getMySubscription,
  listMyPayments,
  createCheckout,
  createPortal,
  startPaypalDemo,
  // createPaypalOrder,
  // capturePaypalOrder,
  handleStripeEvent,
  stripeWebhook,
};
