const { timingSafeEqual } = require('node:crypto');
const env = require('../config/env');
const HttpError = require('../utils/http-error');

function authenticateIotDevice(req, res, next) {
  const suppliedKey = req.get('x-device-key') ?? '';
  const expectedKey = env.IOT_DEVICE_API_KEY;
  const suppliedBuffer = Buffer.from(suppliedKey);
  const expectedBuffer = Buffer.from(expectedKey);

  if (suppliedBuffer.length !== expectedBuffer.length
      || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return next(new HttpError(401, 'Dispositivo IoT no autenticado.'));
  }

  return next();
}

module.exports = authenticateIotDevice;