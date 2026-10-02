const { authenticate, authorize } = require('./auth.middleware');
const authenticateIotDevice = require('./iot-device.middleware');

function authenticateIotDeviceOrAdmin(req, res, next) {
  if (req.get('x-device-key')) return authenticateIotDevice(req, res, next);

  return authenticate(req, res, (error) => {
    if (error) return next(error);
    return authorize('Admin')(req, res, next);
  });
}

module.exports = authenticateIotDeviceOrAdmin;