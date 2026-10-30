const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/user.model');
const AccessIoT = require('../models/access-iot.model');
const Membership = require('../models/membership.model');
const OrganizationMember = require('../models/organization-member.model');
const env = require('../config/env');
const HttpError = require('../utils/http-error');
const { hasActiveMembership } = require('../utils/membership');
const { resolveTenant } = require('../utils/tenant');

// The QR names the client's gym; the turnstile will check it against its own gym and the plan in etapa 3.
async function createQrToken(req, res) {
  const { role, organizationId, gymId } = resolveTenant(req);
  if (role !== 'Cliente') throw new HttpError(403, 'El QR solo está disponible para clientes.');
  const membership = await Membership.findOne({ userId: req.user._id, organizationId }).lean();
  if (!hasActiveMembership(membership)) throw new HttpError(403, 'Tu membresía no está activa.');

  const issuedAt = Math.floor(Date.now() / 1000);
  const jti = randomUUID();
  const qrToken = jwt.sign({ typ: 'gym-access', jti, org: String(organizationId), gym: String(gymId) }, env.QR_TOKEN_SECRET, {
    subject: req.user.id,
    issuer: 'gymgo-api',
    audience: 'gymgo-iot',
    expiresIn: env.QR_TOKEN_TTL_SECONDS,
    notBefore: issuedAt,
  });

  res.status(201).json({
    qrToken,
    expiresAt: new Date((issuedAt + env.QR_TOKEN_TTL_SECONDS) * 1000).toISOString(),
  });
}

async function registerQrAccess(req, res) {
  const input = z.object({
    qrToken: z.string().min(1).max(4096),
    deviceId: z.string().trim().min(1).max(100).optional(),
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
  if (payload.typ !== 'gym-access' || !payload.sub || !payload.jti || !payload.org || !payload.gym) {
    throw new HttpError(401, 'El código QR no es válido para acceso.');
  }
  // Staff validating by hand may only admit clients to their own gyms; turnstiles get a gym of their own in etapa 3.
  if (req.tenant && !req.tenant.gymIds.some((gymId) => String(gymId) === payload.gym)) {
    throw new HttpError(403, 'Este código QR es de otra sucursal.');
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

      const wasInside = user.currentlyInside;
      const update = await User.updateOne(
        { _id: user.id, currentlyInside: wasInside },
        { $set: { currentlyInside: !wasInside } },
        { session },
      );
      if (update.modifiedCount !== 1) throw new HttpError(409, 'Vuelve a generar el QR e intenta otra vez.');

      const [access] = await AccessIoT.create([{
        organizationId: payload.org,
        gymId: payload.gym,
        user: user.id,
        event: wasInside ? 'check-out' : 'check-in',
        source: 'qr',
        deviceId: input.deviceId,
        qrJti: payload.jti,
      }], { session });

      result = {
        event: access.event,
        occurredAt: access.occurredAt,
        userId: user.id,
        userName: user.name,
      };
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({ accepted: true, access: result });
}

module.exports = { createQrToken, registerQrAccess };