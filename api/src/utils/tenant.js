const mongoose = require('mongoose');
const Organization = require('../models/organization.model');
const Gym = require('../models/gym.model');
const OrganizationMember = require('../models/organization-member.model');
const Membership = require('../models/membership.model');
const HttpError = require('./http-error');

// Roles that routes authorize, strongest first. Propietario and Gerente act as the 'Admin' the dashboard knows.
const ROUTE_ROLES = ['Admin', 'Recepcion', 'Coach', 'Cliente'];

// Self-registered clients join this organization until they can join a gym by code (etapa 3).
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
  if (!defaultTenant) throw new HttpError(503, 'La organización del sistema no está configurada.');
  return defaultTenant;
}

function routeRolesAtGym(member, gymId) {
  const roles = new Set();
  if (member.roles.includes('Propietario')) roles.add('Admin');
  if (member.roles.includes('Cliente')) roles.add('Cliente');
  const assignment = member.gyms.find((gym) => String(gym.gymId) === String(gymId));
  for (const role of assignment?.roles ?? []) roles.add(role === 'Gerente' ? 'Admin' : role);
  return roles;
}

// The single role the API reports for a member, as the dashboard and the app expect it.
function legacyRole(member) {
  const roles = new Set([...member.roles, ...member.gyms.flatMap((gym) => gym.roles)]);
  if (roles.has('Propietario') || roles.has('Gerente')) return 'Admin';
  if (roles.has('Coach')) return 'Coach';
  if (roles.has('Recepcion')) return 'Recepcion';
  return 'Cliente';
}

// Picks the strongest allowed role the member holds and the gyms where it holds it.
// Staff without a selected gym read all of those gyms; a client always works with one gym.
function resolveAccess(context, allowedRoles, requestedGymId = null) {
  const { organizationId, member, gyms, homeGymId } = context;
  for (const role of ROUTE_ROLES.filter((routeRole) => allowedRoles.includes(routeRole))) {
    const granted = gyms.map((gym) => gym._id).filter((gymId) => routeRolesAtGym(member, gymId).has(role));
    if (granted.length === 0) continue;
    if (requestedGymId) {
      const requested = granted.find((gymId) => String(gymId) === String(requestedGymId));
      if (!requested) continue;
      return { organizationId, role, gymIds: [requested], gymId: requested, allGyms: false };
    }
    const home = role === 'Cliente' && granted.find((gymId) => String(gymId) === String(homeGymId));
    const gymId = home || granted[0];
    if (role === 'Cliente') return { organizationId, role, gymIds: [gymId], gymId, allGyms: false };
    return { organizationId, role, gymIds: granted, gymId, allGyms: true };
  }
  return null;
}

// SIRID staff belong to no organization: they act as owners of any of them, active or not.
function platformMember(user, organizationId) {
  return { userId: user._id, organizationId, roles: ['Propietario'], gyms: [], isActive: true };
}

async function findMember(user, organizationId) {
  if (!user.isPlatformAdmin) {
    return OrganizationMember.findOne({ userId: user._id, isActive: true, ...(organizationId ? { organizationId } : {}) })
      .sort({ createdAt: 1 })
      .lean();
  }
  const organization = organizationId
    ? { _id: organizationId }
    : await Organization.findOne().sort({ createdAt: 1 }).select('_id').lean();
  return organization && platformMember(user, organization._id);
}

// Loads the organization the request works in: the one of the X-Gym-Id gym, or the user's first one
// (for SIRID staff, the oldest organization).
async function loadTenantContext(user, requestedGymId = null) {
  let organizationId = null;
  if (requestedGymId) {
    if (!mongoose.isValidObjectId(requestedGymId)) throw new HttpError(400, 'Sucursal inválida.');
    const gym = await Gym.findOne({ _id: requestedGymId, isActive: true }).select('organizationId').lean();
    if (!gym) throw new HttpError(403, 'No tienes acceso a esa sucursal.');
    organizationId = gym.organizationId;
  }

  const member = await findMember(user, organizationId);
  if (!member) {
    if (requestedGymId) throw new HttpError(403, 'No tienes acceso a esa sucursal.');
    return null;
  }

  const [organization, gyms, membership] = await Promise.all([
    Organization.findById(member.organizationId).select('name status').lean(),
    Gym.find({ organizationId: member.organizationId, isActive: true }).sort({ createdAt: 1 }).select('_id name').lean(),
    member.roles.includes('Cliente')
      ? Membership.findOne({ userId: user._id, organizationId: member.organizationId }).select('homeGymId').lean()
      : null,
  ]);
  if (organization?.status !== 'active' && !user.isPlatformAdmin) throw new HttpError(403, 'La organización de tu cuenta no está activa.');

  return { organizationId: member.organizationId, organization, member, gyms, homeGymId: membership?.homeGymId ?? null, requestedGymId };
}

function resolveTenant(req) {
  if (!req.tenant) throw new HttpError(403, 'Tu cuenta no pertenece a ningún gimnasio.');
  return req.tenant;
}

// The gym a write goes to: the one the request names (it must be one of the user's), else the selected or main gym.
function resolveTargetGym(req, gymId) {
  const tenant = resolveTenant(req);
  if (!gymId) return tenant.gymId;
  const target = tenant.gymIds.find((id) => String(id) === String(gymId));
  if (!target) throw new HttpError(403, 'No tienes acceso a esa sucursal.');
  return target;
}

// Filters for organization-wide data and for data of the gyms the request can see.
function organizationFilter(req) {
  return { organizationId: resolveTenant(req).organizationId };
}

function gymFilter(req) {
  const tenant = resolveTenant(req);
  return { organizationId: tenant.organizationId, gymId: { $in: tenant.gymIds } };
}

module.exports = {
  ROUTE_ROLES,
  loadDefaultTenant,
  setDefaultTenant,
  getDefaultTenant,
  routeRolesAtGym,
  legacyRole,
  platformMember,
  resolveAccess,
  loadTenantContext,
  resolveTenant,
  resolveTargetGym,
  organizationFilter,
  gymFilter,
};
