const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const env = require('../config/env');
const HttpError = require('../utils/http-error');
const asyncHandler = require('../utils/async-handler');
const { ROUTE_ROLES, loadTenantContext, resolveAccess } = require('../utils/tenant');

async function resolveUserFromToken(token) {
  if (!token) throw new HttpError(401, 'Se requiere autenticación.');

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'gymgo-api' });
  } catch {
    throw new HttpError(401, 'Token inválido o expirado.');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new HttpError(401, 'La cuenta no está disponible.');
  }
  return user;
}

// Besides the user, loads the organization and gyms the request works in (see utils/tenant.js).
const authenticate = asyncHandler(async (req, res, next) => {
  const authorization = req.get('authorization');
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Se requiere autenticación.');
  }

  req.user = await resolveUserFromToken(token);
  const requestedGymId = req.get('x-gym-id') || null;
  req.tenantContext = await loadTenantContext(req.user, requestedGymId);
  req.tenant = req.tenantContext && resolveAccess(req.tenantContext, ROUTE_ROLES, requestedGymId);
  if (requestedGymId && !req.tenant) throw new HttpError(403, 'No tienes acceso a esa sucursal.');
  next();
});

// Roles are checked against the user's roles in the organization and gyms of the request,
// and the request is narrowed to the gyms where the user holds the matched role.
function authorize(...roles) {
  return function roleAuthorization(req, res, next) {
    const tenant = req.tenantContext && resolveAccess(req.tenantContext, roles, req.tenantContext.requestedGymId);
    if (!req.user || !tenant) {
      return next(new HttpError(403, 'No tienes permisos para esta operación.'));
    }
    req.tenant = tenant;
    return next();
  };
}

// SIRID staff only (User.isPlatformAdmin, granted by scripts/set-platform-admin.js).
function requirePlatformAdmin(req, res, next) {
  if (!req.user?.isPlatformAdmin) return next(new HttpError(403, 'No tienes permisos para esta operación.'));
  return next();
}

module.exports = { authenticate, authorize, requirePlatformAdmin, resolveUserFromToken };
