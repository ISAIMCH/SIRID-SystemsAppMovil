const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/user.model');
const AccessIoT = require('../models/access-iot.model');
const env = require('../config/env');
const HttpError = require('../utils/http-error');
const hasActiveMembership = require('../utils/membership');

async function createQrToken(req, res) {
  if (req.user.role !== 'Cliente') throw new HttpError(403, 'El QR solo está disponible para clientes.');
  if (!hasActiveMembership(req.user)) throw new HttpError(403, 'Tu membresía no está activa.');

  const issuedAt = Math.floor(Date.now() / 1000);
  const jti = randomUUID();
  const qrToken = jwt.sign({ typ: 'gym-access', jti }, env.QR_TOKEN_SECRET, {
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
  if (payload.typ !== 'gym-access' || !payload.sub || !payload.jti) {
    throw new HttpError(401, 'El código QR no es válido para acceso.');
  }

  const session = await User.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      if (await AccessIoT.exists({ qrJti: payload.jti }).session(session)) {
        throw new HttpError(409, 'Este código QR ya fue utilizado.');
      }

      const user = await User.findOne({ _id: payload.sub, role: 'Cliente', isActive: true }).session(session);
      if (!user) throw new HttpError(403, 'La cuenta no está habilitada para ingresar.');
      if (!hasActiveMembership(user)) throw new HttpError(403, 'La membresía no está vigente.');

      const wasInside = user.currentlyInside;
      const update = await User.updateOne(
        { _id: user.id, currentlyInside: wasInside },
        { $set: { currentlyInside: !wasInside } },
        { session },
      );
      if (update.modifiedCount !== 1) throw new HttpError(409, 'Vuelve a generar el QR e intenta otra vez.');

      const [access] = await AccessIoT.create([{
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