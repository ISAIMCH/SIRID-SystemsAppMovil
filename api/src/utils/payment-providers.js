const Stripe = require('stripe');
const env = require('../config/env');
const HttpError = require('./http-error');

let stripeClient = null;

function isStripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

function getStripe() {
  if (!isStripeConfigured()) throw new HttpError(503, 'Los pagos con Stripe no están configurados.', { code: 'payments_unavailable' });
  stripeClient ??= Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return stripeClient;
}

// Tests replace the client with a fake.
function setStripeClient(client) {
  stripeClient = client;
}

// Stripe explains invalid requests (e.g. OXXO not enabled on the account); anything else stays a server error.
async function stripeCall(work) {
  try {
    return await work();
  } catch (error) {
    if (error.type === 'StripeInvalidRequestError' || error.type === 'StripeCardError') {
      throw new HttpError(400, `Stripe rechazó la operación: ${error.message}`, { code: 'stripe_error' });
    }
    throw error;
  }
}

function isPaypalConfigured() {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

const paypalBaseUrl = () => (env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
let paypalToken = null;

async function paypalAccessToken() {
  if (paypalToken && paypalToken.expiresAt > Date.now() + 60_000) return paypalToken.value;
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`PayPal rechazó las credenciales (HTTP ${response.status}).`);
  const data = await response.json();
  paypalToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return paypalToken.value;
}

async function paypalRequest(path, { method = 'POST', body } = {}) {
  if (!isPaypalConfigured()) throw new HttpError(503, 'Los pagos con PayPal no están configurados.', { code: 'payments_unavailable' });
  const response = await fetch(`${paypalBaseUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await paypalAccessToken()}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const issue = data.details?.[0]?.issue ?? data.name ?? `HTTP ${response.status}`;
    throw new HttpError(response.status >= 500 ? 502 : 400, `PayPal rechazó la operación (${issue}).`, { code: 'paypal_error', issue });
  }
  return data;
}

module.exports = {
  isStripeConfigured,
  getStripe,
  setStripeClient,
  stripeCall,
  isPaypalConfigured,
  paypalRequest,
};
