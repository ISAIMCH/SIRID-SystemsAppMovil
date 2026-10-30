const Organization = require('../models/organization.model');
const Gym = require('../models/gym.model');
const HttpError = require('./http-error');

// Until requests carry their own organization (etapa 2), everything belongs to the default tenant created by the migration.
let defaultTenant = null;

async function loadDefaultTenant() {
  const organization = await Organization.findOne({ isDefault: true }).select('_id').lean();
  const gym = organization && await Gym.findOne({ organizationId: organization._id }).sort({ createdAt: 1 }).select('_id').lean();
  if (!gym) throw new Error('No existe la organización predeterminada. Ejecuta: npm run migrate:tenancy');
  defaultTenant = { organizationId: organization._id, gymId: gym._id };
  return defaultTenant;
}

function setDefaultTenant(tenant) {
  defaultTenant = tenant;
}

function getDefaultTenant() {
  return defaultTenant;
}

// Takes the request so etapa 2 can read the organization and gym from it without changing callers.
// eslint-disable-next-line no-unused-vars
function resolveTenant(req) {
  if (!defaultTenant) throw new HttpError(503, 'La organización del sistema no está configurada.');
  return defaultTenant;
}

module.exports = { loadDefaultTenant, setDefaultTenant, getDefaultTenant, resolveTenant };
