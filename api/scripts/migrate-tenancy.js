// Etapas 1 y 2 de varios gimnasios: crea la organización y la sucursal predeterminadas, les asigna los datos existentes
// y pasa el stock de cada producto a su sucursal (ProductStock).
// Uso: npm run migrate:tenancy --dry-run   (o: node scripts/migrate-tenancy.js --dry-run)
// Se puede ejecutar varias veces: solo completa lo que falta y no modifica lo que ya existe.
require('dotenv').config();
const mongoose = require('mongoose');
const Organization = require('../src/models/organization.model');
const Gym = require('../src/models/gym.model');
const OrganizationMember = require('../src/models/organization-member.model');
const Membership = require('../src/models/membership.model');
const User = require('../src/models/user.model');
const MembershipPlan = require('../src/models/membership-plan.model');
const Product = require('../src/models/product.model');
const ProductStock = require('../src/models/product-stock.model');
const Promotion = require('../src/models/promotion.model');
const Exercise = require('../src/models/exercise.model');
const RoutineTemplate = require('../src/models/routine-template.model');
const Routine = require('../src/models/routine.model');
const Equipment = require('../src/models/equipment.model');
const AccessIoT = require('../src/models/access-iot.model');
const MaintenanceReport = require('../src/models/maintenance-report.model');
const StoreOrder = require('../src/models/store-order.model');
const Payment = require('../src/models/payment.model');

// PowerShell drops `--` in `npm run x -- --dry-run`, so npm keeps the flag and exposes it as npm_config_dry_run.
const DRY_RUN = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';
const DEFAULT_ORGANIZATION = { name: 'GymGo Demo', slug: 'gymgo-demo' };
const DEFAULT_GYM = { name: 'Sucursal Principal', timezone: 'America/Mexico_City' };
// Old StoreOrder documents point to a placeholder gym id; they are moved to the default gym.
const TENANT_MODELS = [MembershipPlan, Product, Promotion, Exercise, RoutineTemplate, Routine, Equipment, AccessIoT, MaintenanceReport, StoreOrder, Payment];
const NEW_MODELS = [Organization, Gym, OrganizationMember, Membership, ProductStock];
// Etapa 2: the catalog is shared by the organization, so these indexes on the old gymId are dropped.
const OBSOLETE_INDEXES = [
  [Product, 'gymId_1_category_1'],
  [Promotion, 'gymId_1'],
  [Exercise, 'gymId_1_muscleGroup_1_name_1'],
  [Payment, 'user_pending_unique'],
];

function memberFromUser(user, tenant) {
  if (user.role === 'Admin') return { roles: ['Propietario'], gyms: [] };
  if (user.role === 'Coach') return { roles: [], gyms: [{ gymId: tenant.gymId, roles: ['Coach'] }] };
  return { roles: ['Cliente'], gyms: [] };
}

function membershipFromUser(user, tenant, plan) {
  const current = user.membership ?? {};
  return {
    userId: user._id,
    organizationId: tenant.organizationId,
    planId: plan?._id ?? null,
    homeGymId: tenant.gymId,
    gymAccess: plan?.gymAccess?.scope ? plan.gymAccess : { scope: 'all', gymIds: [] },
    status: current.status ?? 'pending',
    startsAt: current.startsAt,
    expiresAt: current.expiresAt,
    planName: current.planName,
    price: current.price,
    currency: current.currency ?? 'MXN',
    durationDays: current.durationDays ?? 30,
    autoRenew: current.autoRenew ?? false,
  };
}

async function ensureDefaultTenant() {
  let organization = await Organization.findOne({ isDefault: true });
  if (organization) {
    console.log(`Organización predeterminada: "${organization.name}" ya existe.`);
  } else {
    console.log(`Organización predeterminada: se crea "${DEFAULT_ORGANIZATION.name}".`);
    organization = DRY_RUN
      ? new Organization(DEFAULT_ORGANIZATION)
      : await Organization.create({ ...DEFAULT_ORGANIZATION, status: 'active', approvedAt: new Date(), isDefault: true });
  }

  let gym = organization.isNew ? null : await Gym.findOne({ organizationId: organization._id }).sort({ createdAt: 1 });
  if (gym) {
    console.log(`Sucursal: "${gym.name}" ya existe.`);
  } else {
    console.log(`Sucursal: se crea "${DEFAULT_GYM.name}" (${DEFAULT_GYM.timezone}).`);
    gym = DRY_RUN ? new Gym({ ...DEFAULT_GYM, organizationId: organization._id }) : await Gym.create({ ...DEFAULT_GYM, organizationId: organization._id });
  }
  return { organizationId: organization._id, gymId: gym._id };
}

async function assignTenantFields(tenant) {
  const gymIds = await Gym.distinct('_id');
  console.log('\nDocumentos sin organización o sucursal:');
  for (const Model of TENANT_MODELS) {
    const collection = Model.collection;
    const withoutOrganization = { organizationId: { $exists: false } };
    // Covers documents without gymId and those pointing to the old placeholder gym.
    const withoutGym = Model.schema.path('gymId') ? { gymId: { $nin: gymIds } } : null;
    const organizationCount = await collection.countDocuments(withoutOrganization);
    const gymCount = withoutGym ? await collection.countDocuments(withoutGym) : 0;
    console.log(`- ${Model.modelName}: ${organizationCount} sin organización${withoutGym ? `, ${gymCount} sin sucursal` : ''}`);
    if (DRY_RUN) continue;
    if (organizationCount) await collection.updateMany(withoutOrganization, { $set: { organizationId: tenant.organizationId } });
    if (gymCount) await collection.updateMany(withoutGym, { $set: { gymId: tenant.gymId } });
  }

  // Existing plans stay valid in every gym, as they are today.
  const withoutGymAccess = { gymAccess: { $exists: false } };
  const planCount = await MembershipPlan.collection.countDocuments(withoutGymAccess);
  console.log(`- Planes sin sucursales definidas (quedan válidos en todas): ${planCount}`);
  if (!DRY_RUN && planCount) await MembershipPlan.collection.updateMany(withoutGymAccess, { $set: { gymAccess: { scope: 'all', gymIds: [] } } });
}

// Only users that belong to no organization join the default one, so users of other organizations are never moved.
async function createMembers(tenant) {
  const users = await User.find({ isPlatformAdmin: { $ne: true } }).select('role membership').lean();
  const existingMembers = new Set((await OrganizationMember.distinct('userId')).map(String));
  const existingMemberships = new Set((await Membership.distinct('userId')).map(String));
  const plans = await MembershipPlan.find({ $or: [{ organizationId: tenant.organizationId }, { organizationId: { $exists: false } }] }).lean();
  const plansByName = new Map(plans.map((plan) => [plan.name, plan]));

  const members = users.filter((user) => !existingMembers.has(String(user._id)))
    .map((user) => ({ userId: user._id, organizationId: tenant.organizationId, ...memberFromUser(user, tenant) }));
  const memberships = users.filter((user) => user.role === 'Cliente' && !existingMembers.has(String(user._id)) && !existingMemberships.has(String(user._id)))
    .map((user) => membershipFromUser(user, tenant, plansByName.get(user.membership?.planName)));

  console.log(`\nMiembros de la organización por crear: ${members.length}`);
  console.log(`Membresías de clientes por crear: ${memberships.length}`);
  if (DRY_RUN) return;
  if (members.length) await OrganizationMember.insertMany(members);
  if (memberships.length) await Membership.insertMany(memberships);
}

// Etapa 2: each product's old `stock` becomes the stock of its gym; the catalog fields stop carrying a gym.
async function moveStockToGyms(tenant) {
  const gymIds = new Set((await Gym.distinct('_id')).map(String));
  const stocked = new Set((await ProductStock.distinct('productId')).map(String));
  const products = await Product.collection.find({}, { projection: { organizationId: 1, gymId: 1, stock: 1 } }).toArray();
  const stocks = products.filter((product) => !stocked.has(String(product._id))).map((product) => ({
    productId: product._id,
    organizationId: product.organizationId ?? tenant.organizationId,
    gymId: gymIds.has(String(product.gymId)) ? product.gymId : tenant.gymId,
    quantity: Math.max(0, Number(product.stock) || 0),
  }));
  const withLegacyFields = { $or: [{ stock: { $exists: true } }, { gymId: { $exists: true } }] };
  const legacyCounts = await Promise.all([Product, Promotion, Exercise].map((Model) => Model.collection.countDocuments(withLegacyFields)));

  console.log('\nStock por sucursal:');
  console.log(`- Productos que pasan su stock a su sucursal: ${stocks.length}`);
  console.log(`- Productos, promociones y ejercicios con campos de sucursal antiguos: ${legacyCounts.join(', ')}`);
  if (DRY_RUN) return;
  if (stocks.length) await ProductStock.insertMany(stocks);
  for (const Model of [Product, Promotion, Exercise]) {
    await Model.collection.updateMany(withLegacyFields, { $unset: { stock: '', gymId: '' } });
  }
}

async function dropObsoleteIndexes() {
  console.log('\nÍndices antiguos:');
  for (const [Model, name] of OBSOLETE_INDEXES) {
    const exists = (await Model.collection.indexes().catch(() => [])).some((index) => index.name === name);
    console.log(`- ${Model.modelName}.${name}: ${exists ? 'se elimina' : 'no existe'}`);
    if (exists && !DRY_RUN) await Model.collection.dropIndex(name);
  }
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('Falta MONGO_URI.');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  console.log(DRY_RUN ? 'Modo prueba: no se escribirá nada.\n' : 'Aplicando la migración.\n');

  const tenant = await ensureDefaultTenant();
  await assignTenantFields(tenant);
  await createMembers(tenant);
  await moveStockToGyms(tenant);
  await dropObsoleteIndexes();

  if (DRY_RUN) {
    console.log('\nÍndices: se crearían al ejecutar sin --dry-run.');
  } else {
    for (const Model of [...NEW_MODELS, ...TENANT_MODELS]) await Model.createIndexes();
    console.log('\nÍndices creados.');
  }
}

if (require.main === module) {
  main()
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error('La migración falló:', error.message);
      await mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = { memberFromUser, membershipFromUser };
