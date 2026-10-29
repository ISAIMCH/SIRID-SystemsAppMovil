const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const HttpError = require('../src/utils/http-error');
const { resolveOrderOwnership } = require('../src/controllers/store-order.controller');
const { getClientFitnessAnalytics } = require('../src/controllers/analytics.controller');
const { canReadDocument } = require('../src/controllers/document.controller');
const { errorHandler } = require('../src/middlewares/error.middleware');

const clientId = '64b000000000000000000001';
const otherUserId = '64b000000000000000000002';
const coachId = '64b000000000000000000003';

function createResponse() {
  return {
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('clients cannot set the status or owner of their store orders', () => {
  const client = { _id: clientId, role: 'Cliente' };
  assert.deepEqual(
    resolveOrderOwnership(client, { userId: otherUserId, status: 'paid' }),
    { userId: clientId, status: 'pending' },
  );
});

test('admins can create paid orders for other users', () => {
  const admin = { _id: coachId, role: 'Admin' };
  assert.deepEqual(resolveOrderOwnership(admin, { userId: clientId }), { userId: clientId, status: 'paid' });
  assert.deepEqual(resolveOrderOwnership(admin, { status: 'pending' }), { userId: coachId, status: 'pending' });
});

test('client analytics rejects invalid ids with a 400 HttpError', async () => {
  await assert.rejects(
    getClientFitnessAnalytics({ params: { clientId: 'not-an-id' }, query: {}, user: { role: 'Admin' } }, {}),
    (error) => error instanceof HttpError && error.statusCode === 400,
  );
});

test('documents are readable only by Admins, their owner or the assigned Coach', () => {
  const owner = { _id: clientId, assignedCoach: coachId };
  assert.equal(canReadDocument({ id: otherUserId, role: 'Admin' }, owner), true);
  assert.equal(canReadDocument({ id: clientId, role: 'Cliente' }, owner), true);
  assert.equal(canReadDocument({ id: coachId, role: 'Coach' }, owner), true);
  assert.equal(canReadDocument({ id: otherUserId, role: 'Cliente' }, owner), false);
  assert.equal(canReadDocument({ id: otherUserId, role: 'Coach' }, owner), false);
});

test('error handler hides internal error messages', (t) => {
  t.mock.method(console, 'error', () => {});
  const res = createResponse();
  errorHandler(new Error('connection string mongodb://secret'), {}, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Error interno del servidor.');
});

test('error handler maps CastError to 400', () => {
  const res = createResponse();
  errorHandler(new mongoose.Error.CastError('ObjectId', 'abc', '_id'), {}, res, () => {});
  assert.equal(res.statusCode, 400);
});
