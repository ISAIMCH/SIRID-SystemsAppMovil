const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const env = require('../config/env');
const HttpError = require('../utils/http-error');
const asyncHandler = require('../utils/async-handler');

const authenticate = asyncHandler(async (req, res, next) => {
  const authorization = req.get('authorization');
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Se requiere autenticación.');
  }

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

  req.user = user;
  next();
});

function authorize(...roles) {
  return function roleAuthorization(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'No tienes permisos para esta operación.'));
    }
    return next();
  };
}

module.exports = { authenticate, authorize };