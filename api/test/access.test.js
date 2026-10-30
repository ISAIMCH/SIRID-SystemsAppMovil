const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// The controllers read the environment when they load.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'IOT_DEVICE_API_KEY', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const env = require('../src/config/env');
const HttpError = require('../src/utils/http-error');
const AccessDevice = require('../src/models/access-device.model');
const Gym = require('../src/models/gym.model');
const { membershipCoversGym } = require('../src/utils/membership');
const { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, generateJoinCode, normalizeJoinCode, generateDeviceKey, hashDeviceKey } = require('../src/utils/access-codes');
const { findGymByJoinCode } = require('../src/utils/join-gym');
const { resolveAccess } = require('../src/utils/tenant');
const authenticateIotDevice = require('../src/middlewares/iot-device.middleware');
const { registerQrAccess, nextAccessEvent, openCheckInElsewhere, staffAccessGym } = require('../src/controllers/access.controller');

const id = () => new mongoose.Types.ObjectId();
const [mainGym, northGym, southGym] = [id(), id(), id()];

function qrToken(claims) {
  return jwt.sign({ typ: 'gym-access', jti: String(id()), ...claims }, env.QR_TOKEN_SECRET, {
    subject: String(id()), issuer: 'gymgo-api', audience: 'gymgo-iot', expiresIn: 60,
  });
}

// Runs a middleware or handler and resolves with the error it passes on or throws (undefined if none).
function run(handler, req) {
  return new Promise((resolve) => {
    Promise.resolve(handler(req, {}, resolve)).catch(resolve);
  });
}

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

const lean = (value) => ({ lean: async () => value, select() { return this; } });
const deviceRequest = (key) => ({ get: (header) => (header === 'x-device-key' ? key : undefined) });

test('a plan for every gym lets the client in at any gym of the organization', () => {
  assert.equal(membershipCoversGym({ gymAccess: { scope: 'all', gymIds: [] } }, northGym), true);
  assert.equal(membershipCoversGym({}, northGym), true);
});

test('a home plan only lets the client in at the gym where it was sold', () => {
  const membership = { homeGymId: mainGym, gymAccess: { scope: 'home', gymIds: [] } };
  assert.equal(membershipCoversGym(membership, mainGym), true);
  assert.equal(membershipCoversGym(membership, northGym), false);
  assert.equal(membershipCoversGym({ homeGymId: null, gymAccess: { scope: 'home' } }, mainGym), false);
});

test('a list plan only lets the client in at the listed gyms', () => {
  const membership = { homeGymId: mainGym, gymAccess: { scope: 'list', gymIds: [northGym, southGym] } };
  assert.equal(membershipCoversGym(membership, southGym), true);
  assert.equal(membershipCoversGym(membership, mainGym), false);
});

test('scanning at the gym the client is inside checks them out; anywhere else checks them in', () => {
  assert.equal(nextAccessEvent(null, mainGym), 'check-in');
  assert.equal(nextAccessEvent({ event: 'check-in', gymId: mainGym }, mainGym), 'check-out');
  assert.equal(nextAccessEvent({ event: 'check-in', gymId: mainGym }, northGym), 'check-in');
  assert.equal(nextAccessEvent({ event: 'check-out', gymId: mainGym }, mainGym), 'check-in');
});

test('entering another gym closes the check-in left open at the previous one', () => {
  const openAtMain = { event: 'check-in', gymId: mainGym };
  assert.equal(openCheckInElsewhere(openAtMain, northGym), openAtMain);
  assert.equal(openCheckInElsewhere(openAtMain, mainGym), null);
  assert.equal(openCheckInElsewhere({ event: 'check-out', gymId: mainGym }, northGym), null);
  assert.equal(openCheckInElsewhere(null, northGym), null);
});

test('staff scanning with one gym use it; with several they must choose one of theirs', () => {
  assert.equal(staffAccessGym({ gymIds: [northGym] }), northGym);
  assert.equal(String(staffAccessGym({ gymIds: [mainGym, northGym] }, String(northGym))), String(northGym));
  assert.throws(() => staffAccessGym({ gymIds: [mainGym, northGym] }), (error) => error.statusCode === 400);
  assert.throws(() => staffAccessGym({ gymIds: [mainGym] }, String(southGym)), (error) => error.statusCode === 403);
});

test('join codes avoid ambiguous characters and are read as typed or printed', () => {
  const code = generateJoinCode();
  assert.equal(code.length, JOIN_CODE_LENGTH);
  assert.ok([...code].every((character) => JOIN_CODE_ALPHABET.includes(character)));
  assert.ok(!/[01OIL]/.test(JOIN_CODE_ALPHABET));
  assert.equal(normalizeJoinCode(' ab3d-ef 7h '), 'AB3DEF7H');
});

test('a code of the wrong length is rejected without looking it up', async () => {
  const restore = stub(Gym, 'findOne', () => { throw new Error('should not query'); });
  try {
    await assert.rejects(findGymByJoinCode('ABC'), (error) => error instanceof HttpError && error.statusCode === 404);
  } finally {
    restore();
  }
});

test('device keys are stored as a hash and are unique', () => {
  const key = generateDeviceKey();
  assert.match(key, /^gymgo_dev_[\w-]{43}$/);
  assert.notEqual(key, generateDeviceKey());
  assert.equal(hashDeviceKey(key), hashDeviceKey(key));
  assert.notEqual(hashDeviceKey(key), key);
});

test('a registered device enters at its own gym', async () => {
  const organizationId = id();
  const key = generateDeviceKey();
  const device = { _id: id(), name: 'Torniquete norte', organizationId, gymId: northGym };
  const restore = [
    stub(AccessDevice, 'findOne', (filter) => lean(filter.keyHash === hashDeviceKey(key) && filter.revokedAt === null ? device : null)),
    stub(AccessDevice, 'updateOne', async () => ({})),
    stub(Gym, 'exists', async () => ({ _id: northGym })),
  ];
  try {
    const req = deviceRequest(key);
    assert.equal(await run(authenticateIotDevice, req), undefined);
    assert.equal(req.accessPoint.gymId, northGym);
    assert.equal(req.accessPoint.legacy, false);
  } finally {
    restore.forEach((undo) => undo());
  }
});

test('a revoked or unknown device key is rejected', async () => {
  const restore = stub(AccessDevice, 'findOne', () => lean(null));
  try {
    const error = await run(authenticateIotDevice, deviceRequest(generateDeviceKey()));
    assert.equal(error.statusCode, 401);
  } finally {
    restore();
  }
});

test('the deprecated shared key still authenticates, without a gym of its own', async () => {
  const req = deviceRequest(env.IOT_DEVICE_API_KEY);
  assert.equal(await run(authenticateIotDevice, req), undefined);
  assert.deepEqual(req.accessPoint, { legacy: true, organizationId: null, gymId: null, deviceId: null });
});

test('a device does not accept the QR of a client of another organization', async () => {
  const req = {
    body: { qrToken: qrToken({ org: String(id()) }) },
    accessPoint: { legacy: false, organizationId: id(), gymId: northGym, deviceId: id() },
  };
  const error = await run(registerQrAccess, req);
  assert.equal(error.statusCode, 403);
  assert.match(error.message, /otro gimnasio/);
});

test('staff only register entries of clients of their own organization', async () => {
  const req = {
    body: { qrToken: qrToken({ org: String(id()) }) },
    user: { _id: id() },
    tenant: { organizationId: id(), gymIds: [mainGym] },
  };
  const error = await run(registerQrAccess, req);
  assert.equal(error.statusCode, 403);
});

test('a client of two organizations is only granted the gyms of the organization of the request', () => {
  const [ownGym, otherGym] = [{ _id: id() }, { _id: id() }];
  const context = { organizationId: id(), gyms: [ownGym], homeGymId: ownGym._id, member: { roles: ['Cliente'], gyms: [] } };
  assert.equal(String(resolveAccess(context, ['Cliente']).gymId), String(ownGym._id));
  assert.equal(resolveAccess({ ...context, requestedGymId: otherGym._id }, ['Cliente'], otherGym._id), null);
});
