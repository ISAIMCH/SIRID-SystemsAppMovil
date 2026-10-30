const { authenticate, authorize } = require('./auth.middleware');
const authenticateIotDevice = require('./iot-device.middleware');

// Turnstiles authenticate with their key; without one, Admin or Recepcion scan the QR from the dashboard or the app.
function authenticateIotDeviceOrAdmin(req, res, next) {
  if (req.get('x-device-key')) return authenticateIotDevice(req, res, next);

  return authenticate(req, res, (error) => {
    if (error) return next(error);
    return authorize('Admin', 'Recepcion')(req, res, next);
  });
}

module.exports = authenticateIotDeviceOrAdmin;
