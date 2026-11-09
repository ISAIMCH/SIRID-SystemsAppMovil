const SaasPlan = require('../models/saas-plan.model');

const TAX_RATE = 0.16;
const PLAN_CACHE_MS = 60 * 1000;

const FEATURE_LABELS = {
  iot: 'torniquetes IoT',
  occupancy: 'aforo en vivo y bitácora de accesos',
  documents: 'documentos y expedientes',
  historyShare: 'historial compartido entre gimnasios',
};

// Inserted on startup only when missing: SIRID's later edits in the database are never overwritten.
const DEFAULT_PLANS = [
  {
    code: 'esencial',
    name: 'Esencial',
    description: 'Todo lo necesario para operar un gimnasio.',
    priceMxn: 699,
    priceYearlyMxn: 6990,
    gymLimit: 1,
    features: [],
    highlights: [
      '1 sucursal',
      'App para clientes y coaches con rutinas',
      'Membresías, cobros en recepción y tienda',
      'Acceso con QR desde la cámara de recepción',
      'Soporte por correo',
    ],
    selfService: true,
    featured: false,
    sortOrder: 1,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Para gimnasios que quieren automatizar el acceso y crecer.',
    priceMxn: 1299,
    priceYearlyMxn: 12990,
    gymLimit: 3,
    features: ['iot', 'occupancy', 'documents', 'historyShare'],
    highlights: [
      'Hasta 3 sucursales',
      'Todo lo de Esencial',
      'Torniquetes IoT (software)',
      'Aforo en vivo y bitácora de accesos',
      'Documentos y expedientes del personal',
      'Historial compartido entre gimnasios',
      'Soporte prioritario',
    ],
    selfService: true,
    featured: true,
    sortOrder: 2,
  },
  {
    code: 'cadena',
    name: 'Cadena',
    description: 'Para cadenas con varias sucursales, hardware e implementación a la medida.',
    priceMxn: null,
    priceYearlyMxn: null,
    gymLimit: 10,
    features: ['iot', 'occupancy', 'documents', 'historyShare'],
    highlights: [
      'Sucursales a la medida',
      'Todo lo de Pro',
      'Hardware IoT con instalación',
      'Migración de datos y soporte dedicado',
    ],
    selfService: false,
    featured: false,
    sortOrder: 3,
  },
];

let cache = null;

async function ensureSaasPlans() {
  await Promise.all(DEFAULT_PLANS.map((plan) => SaasPlan.updateOne({ code: plan.code }, { $setOnInsert: plan }, { upsert: true })));
  cache = null;
}

async function loadPlans() {
  if (cache && Date.now() - cache.loadedAt < PLAN_CACHE_MS) return cache.plans;
  const plans = await SaasPlan.find().sort({ sortOrder: 1, priceMxn: 1 }).lean();
  cache = { plans, loadedAt: Date.now() };
  return plans;
}

// Tests set the plans directly instead of reading the database.
function setPlanCache(plans) {
  cache = plans ? { plans, loadedAt: Infinity } : null;
}

async function listPlans() {
  return (await loadPlans()).filter((plan) => plan.isActive !== false);
}

async function getPlan(code) {
  return code ? (await loadPlans()).find((plan) => plan.code === code) ?? null : null;
}

// What the owner pays, IVA included, in cents (Stripe) for the chosen period.
function planAmountCents(plan, interval) {
  const base = interval === 'year' ? plan.priceYearlyMxn : plan.priceMxn;
  if (base === null || base === undefined) return null;
  return Math.round(base * (1 + TAX_RATE) * 100);
}

function serializePlan(plan) {
  const price = (interval) => {
    const cents = planAmountCents(plan, interval);
    const base = interval === 'year' ? plan.priceYearlyMxn : plan.priceMxn;
    return cents === null ? null : { subtotal: base, tax: Math.round(base * TAX_RATE * 100) / 100, total: cents / 100 };
  };
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description ?? '',
    currency: 'MXN',
    taxRate: TAX_RATE,
    monthly: price('month'),
    yearly: price('year'),
    gymLimit: plan.gymLimit,
    features: plan.features ?? [],
    highlights: plan.highlights ?? [],
    selfService: Boolean(plan.selfService),
    featured: Boolean(plan.featured),
  };
}

// Organizations created before billing (no plan) keep every feature.
async function organizationHasFeature(organization, feature) {
  const planCode = organization?.subscription?.planCode;
  if (!planCode) return true;
  const plan = await getPlan(planCode);
  return Boolean(plan?.features?.includes(feature));
}

module.exports = {
  TAX_RATE,
  FEATURE_LABELS,
  DEFAULT_PLANS,
  ensureSaasPlans,
  setPlanCache,
  listPlans,
  getPlan,
  planAmountCents,
  serializePlan,
  organizationHasFeature,
};
