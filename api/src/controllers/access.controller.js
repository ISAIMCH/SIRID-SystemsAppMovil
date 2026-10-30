const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/user.model');
const AccessIoT = require('../models/access-iot.model');
const Membership = require('../models/membership.model');
const OrganizationMember = require('../models/organization-member.model');
const Gym = require('../models/gym.model');
const env = require('../config/env');
const HttpError = require('../utils/http-error');
const { hasActiveMembership, membershipCoversGym } = require('../utils/membership');
const { resolveTenant } = require('../utils/tenant');

// The QR names the client and the organization; the gym comes from the device or the staff member who scans it.
// `gym` (the gym selected in the app) is only read by devices that still use the deprecated shared key.
async function createQrToken(req, res) {
  const { role, organizationId, gymId } = resolveTenant(req);
  if (role !== 'Cliente') throw new HttpError(403, 'El QR solo está disponible para clientes.');
  const membership = await Membership.findOne({ userId: req.user._id, organizationId }).lean();
  if (!hasActiveMembership(membership)) throw new HttpError(403, 'Tu membresía no está activa.');

  const issuedAt = Math.floor(Date.now() / 1000);
  const jti = randomUUID();
  // iat is set here so exp matches the expiresAt returned. jsonwebtoken reads notBefore as seconds from now, not a timestamp.
  const qrToken = jwt.sign({ typ: 'gym-access', jti, org: String(organizationId), gym: String(gymId), iat: issuedAt }, env.QR_TOKEN_SECRET, {
    subject: req.user.id,
    issuer: 'gymgo-api',
    audience: 'gymgo-iot',
    expiresIn: env.QR_TOKEN_TTL_SECONDS,
  });

  res.status(201).json({
    qrToken,
    expiresAt: new Date((issuedAt + env.QR_TOKEN_TTL_SECONDS) * 1000).toISOString(),
  });
}

// The entry toggles only at the same gym: arriving at another gym is always a check-in.
function nextAccessEvent(lastAccess, gymId) {
  return lastAccess?.event === 'check-in' && String(lastAccess.gymId) === String(gymId) ? 'check-out' : 'check-in';
}

// A check-in at another gym that was never closed: it is closed automatically when the client enters elsewhere,
// so that gym stops counting them as inside.
function openCheckInElsewhere(lastAccess, gymId) {
  return lastAccess?.event === 'check-in' && String(lastAccess.gymId) !== String(gymId) ? lastAccess : null;
}

// Staff scanning by hand register the entry at their selected gym; with several gyms they must name one.
function staffAccessGym(tenant, gymId) {
  if (gymId) {
    const gym = tenant.gymIds.find((id) => String(id) === String(gymId));
    if (!gym) throw new HttpError(403, 'No tienes acceso a esa sucursal.');
    return gym;
  }
  if (tenant.gymIds.length !== 1) throw new HttpError(400, 'Elige la sucursal donde estás registrando el acceso.');
  return tenant.gymIds[0];
}

// The organization and gym where the QR is being used, from the device, the staff member or (deprecated) the QR.
async function resolveAccessPoint(req, payload, gymId) {
  if (req.accessPoint && !req.accessPoint.legacy) return req.accessPoint;
  if (req.tenant) {
    return { organizationId: req.tenant.organizationId, gymId: staffAccessGym(req.tenant, gymId), deviceId: null, validatedBy: req.user._id };
  }
  const legacyGymId = gymId ?? payload.gym;
  const gym = legacyGymId && await Gym.findOne({ _id: legacyGymId, organizationId: payload.org, isActive: true }).select('_id organizationId').lean();
  if (!gym) throw new HttpError(400, 'El dispositivo debe indicar su sucursal. Regístralo en el dashboard para obtener su propia llave.');
  return { organizationId: gym.organizationId, gymId: gym._id, deviceId: null };
}

async function registerQrAccess(req, res) {
  const input = z.object({
    qrToken: z.string().min(1).max(4096),
    deviceId: z.string().trim().min(1).max(100).optional(),
    gymId: z.string().regex(/^[a-f\d]{24}$/i, 'Sucursal inválida.').optional(),
  }).parse(req.body);

  let payload;
  try {
    payload = jwt.verify(input.qrToken, env.QR_TOKEN_SECRET, {
      issuer: 'gymgo-api',
      audience: 'gymgo-iot',
    });
  } catch {
    throw new HttpError(401, 'El código QR es inválido o expiró.');
  }
  if (payload.typ !== 'gym-access' || !payload.sub || !payload.jti || !payload.org) {
    throw new HttpError(401, 'El código QR no es válido para acceso.');
  }
  const accessPoint = await resolveAccessPoint(req, payload, input.gymId);
  if (String(accessPoint.organizationId) !== String(payload.org)) {
    throw new HttpError(403, 'Este código QR es de otro gimnasio.');
  }

  const session = await User.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      if (await AccessIoT.exists({ qrJti: payload.jti }).session(session)) {
        throw new HttpError(409, 'Este código QR ya fue utilizado.');
      }

      // Operations in one transaction run one after another.
      const user = await User.findOne({ _id: payload.sub, isActive: true }).session(session);
      const member = await OrganizationMember.exists({ userId: payload.sub, organizationId: payload.org, roles: 'Cliente', isActive: true }).session(session);
      const membership = await Membership.findOne({ userId: payload.sub, organizationId: payload.org }).session(session);
      if (!user || !member) throw new HttpError(403, 'La cuenta no está habilitada para ingresar.');
      if (!hasActiveMembership(membership)) throw new HttpError(403, 'La membresía no está vigente.');
      if (!membershipCoversGym(membership, accessPoint.gymId)) throw new HttpError(403, 'El plan del cliente no incluye esta sucursal.');

      const lastAccess = await AccessIoT.findOne({ user: user._id }).sort({ occurredAt: -1 }).select('event organizationId gymId').session(session).lean();
      const event = nextAccessEvent(lastAccess, accessPoint.gymId);
      const openCheckIn = openCheckInElsewhere(lastAccess, accessPoint.gymId);
      if (openCheckIn) {
        await AccessIoT.create([{
          organizationId: openCheckIn.organizationId,
          gymId: openCheckIn.gymId,
          user: user.id,
          event: 'check-out',
          source: 'auto',
        }], { session });
      }
      // Writing the user serializes concurrent scans of the same client: the transaction retries on conflict.
      await User.updateOne({ _id: user.id }, { $set: { currentlyInside: event === 'check-in' } }, { session });

      const [access] = await AccessIoT.create([{
        organizationId: accessPoint.organizationId,
        gymId: accessPoint.gymId,
        user: user.id,
        event,
        source: 'qr',
        deviceId: input.deviceId ?? accessPoint.deviceName,
        accessDevice: accessPoint.deviceId,
        validatedBy: accessPoint.validatedBy ?? null,
        qrJti: payload.jti,
      }], { session });

      result = {
        event: access.event,
        occurredAt: access.occurredAt,
        gymId: String(access.gymId),
        userId: user.id,
        userName: user.name,
      };
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({ accepted: true, access: result });
}

module.exports = { createQrToken, registerQrAccess, nextAccessEvent, openCheckInElsewhere, staffAccessGym };
