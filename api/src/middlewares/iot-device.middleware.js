const AccessDevice = require('../models/access-device.model');
const Gym = require('../models/gym.model');
const Organization = require('../models/organization.model');
const HttpError = require('../utils/http-error');
const asyncHandler = require('../utils/async-handler');
const { hashDeviceKey } = require('../utils/access-codes');
const { organizationHasFeature } = require('../utils/saas-plans');
const { subscriptionState } = require('../utils/subscription');

// Sets req.accessPoint to the gym where the entry happens. Each device has its own key bound to one gym,
// and stops working while its organization is not active.
const authenticateIotDevice = asyncHandler(async (req, res, next) => {
  const suppliedKey = req.get('x-device-key') ?? '';
  const device = await AccessDevice.findOne({ keyHash: hashDeviceKey(suppliedKey), revokedAt: null }).lean();
  const [gymIsActive, organization] = device
    ? await Promise.all([
      Gym.exists({ _id: device.gymId, organizationId: device.organizationId, isActive: true }),
      Organization.findOne({ _id: device.organizationId, status: 'active' }).select('subscription').lean(),
    ])
    : [];
  if (!device || !gymIsActive || !organization) throw new HttpError(401, 'Dispositivo IoT no autenticado.');
  // Turnstiles are part of the Pro plan, and close with the rest of the gym once the grace period ends.
  if (!await organizationHasFeature(organization, 'iot') || subscriptionState(organization).phase === 'expired') {
    throw new HttpError(403, 'El plan del gimnasio no incluye torniquetes o no está pagado.', { code: 'feature_not_in_plan', feature: 'iot' });
  }

  await AccessDevice.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date() } });
  req.accessPoint = { organizationId: device.organizationId, gymId: device.gymId, deviceId: device._id, deviceName: device.name };
  return next();
});

module.exports = authenticateIotDevice;
