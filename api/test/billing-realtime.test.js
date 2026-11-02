const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Payment = require('../src/models/payment.model');
const { updatePaymentStatus } = require('../src/controllers/billing.controller');

const id = () => new mongoose.Types.ObjectId();

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

test('a payment confirmed or cancelled at reception goes live to the gym staff and the client', async () => {
  const [organizationId, gymId, clientId] = [id(), id(), id()];
  const payment = {
    _id: id(), user: clientId, gymId, status: 'pending', save: async () => {},
    toObject() { return { _id: this._id, user: this.user, status: this.status }; },
  };
  const emitted = [];
  const io = { to: (rooms) => ({ emit: (event, payload) => emitted.push({ rooms, event, payload }) }) };
  const restore = [
    stub(Payment, 'startSession', async () => ({ withTransaction: (work) => work(), endSession: async () => {} })),
    stub(Payment, 'findOne', () => ({ session: async () => payment })),
  ];
  try {
    await updatePaymentStatus({
      params: { id: String(payment._id) },
      body: { status: 'cancelled' },
      user: { id: String(id()) },
      tenant: { organizationId, gymIds: [gymId], gymId },
      app: { get: () => io },
    }, { json() {} });
  } finally {
    restore.forEach((undo) => undo());
  }

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, 'payment-updated');
  assert.equal(emitted[0].payload.payment.status, 'cancelled');
  assert.ok(emitted[0].rooms.includes(`gym:${gymId}:reception`));
  assert.ok(emitted[0].rooms.includes(`user:${clientId}`));
});
