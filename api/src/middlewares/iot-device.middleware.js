const AccessDevice = require('../models/access-device.model');
const Gym = require('../models/gym.model');
const Organization = require('../models/organization.model');
const HttpError = require('../utils/http-error');
const asyncHandler = require('../utils/async-handler');
const { hashDeviceKey } = require('../utils/access-codes');

// Sets req.accessPoint to the gym where the entry happens. Each device has its own key bound to one gym,
// and stops working while its organization is not active.
const authenticateIotDevice = asyncHandler(async (req, res, next) => {
  const suppliedKey = req.get('x-device-key') ?? '';
  const device = await AccessDevice.findOne({ keyHash: hashDeviceKey(suppliedKey), revokedAt: null }).lean();
  const [gymIsActive, organizationIsActive] = device
    ? await Promise.all([
      Gym.exists({ _id: device.gymId, organizationId: device.organizationId, isActive: true }),
      Organization.exists({ _id: device.organizationId, status: 'active' }),
    ])
    : [];
  if (!device || !gymIsActive || !organizationIsActive) throw new HttpError(401, 'Dispositivo IoT no autenticado.');

  await AccessDevice.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date() } });
  req.accessPoint = { organizationId: device.organizationId, gymId: device.gymId, deviceId: device._id, deviceName: device.name };
  return next();
});

module.exports = authenticateIotDevice;
