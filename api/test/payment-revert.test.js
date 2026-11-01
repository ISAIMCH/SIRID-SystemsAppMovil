const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Payment = require('../src/models/payment.model');
const Membership = require('../src/models/membership.model');
const User = require('../src/models/user.model');
const { unusedPaymentTime, revertPaidPayment } = require('../src/utils/membership');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-06-01T12:00:00.000Z');
const at = (days) => new Date(now.getTime() + days * DAY);
const id = () => new mongoose.Types.ObjectId();

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

function query(value) {
  const chain = { session: () => chain };
  chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return chain;
}

// Stubs the membership of the payment's client and records what the revert writes.
function stubRevert({ membership, otherPaid = false }) {
  const writes = { shifts: [], saved: [] };
  const restore = [
    stub(Membership, 'findOne', () => query(membership)),
    stub(Payment, 'updateMany', async (filter, update) => { writes.shifts.push({ filter, update }); }),
    stub(Payment, 'exists', () => query(otherPaid ? { _id: id() } : null)),
    stub(User, 'updateOne', async () => {}),
  ];
  membership.save = async () => { writes.saved.push({ status: membership.status, expiresAt: membership.expiresAt }); };
  return { writes, restore: () => restore.forEach((undo) => undo()) };
}

function paidPayment(period, durationDays = 30) {
  return { _id: id(), user: id(), organizationId: id(), status: 'paid', durationDays, membershipPeriod: period };
}

test('only the part of the period not used yet comes back', () => {
  const membership = { expiresAt: at(60) };
  assert.equal(unusedPaymentTime(paidPayment({ startsAt: at(30), endsAt: at(60) }), membership, now).unusedMs, 30 * DAY);
  assert.equal(unusedPaymentTime(paidPayment({ startsAt: at(-10), endsAt: at(20) }), membership, now).unusedMs, 20 * DAY);
  assert.equal(unusedPaymentTime(paidPayment({ startsAt: at(-90), endsAt: at(-60) }), membership, now).unusedMs, 0);
});

test('a payment paid before periods were recorded counts as the last period of the membership', () => {
  const { period, unusedMs } = unusedPaymentTime(paidPayment(null, 30), { expiresAt: at(10) }, now);
  assert.equal(period.startsAt.getTime(), at(-20).getTime());
  assert.equal(unusedMs, 10 * DAY);
});

test('deleting a renewal shortens the membership, keeps it active and moves later payments back', async () => {
  const membership = { status: 'active', startsAt: at(-10), expiresAt: at(80) };
  const { writes, restore } = stubRevert({ membership });
  try {
    await revertPaidPayment(null, paidPayment({ startsAt: at(20), endsAt: at(50) }), now);
  } finally {
    restore();
  }
  assert.deepEqual(writes.saved, [{ status: 'active', expiresAt: at(50) }]);
  assert.equal(writes.shifts.length, 1);
  assert.equal(writes.shifts[0].filter['membershipPeriod.startsAt'].$gte.getTime(), at(50).getTime());
  assert.deepEqual(writes.shifts[0].update[0].$set['membershipPeriod.startsAt'], { $subtract: ['$membershipPeriod.startsAt', 30 * DAY] });
});

test('deleting the only paid payment leaves the membership pending so it can be charged again', async () => {
  const membership = { status: 'active', startsAt: at(-5), expiresAt: at(25) };
  const { writes, restore } = stubRevert({ membership });
  try {
    await revertPaidPayment(null, paidPayment({ startsAt: at(-5), endsAt: at(25) }), now);
  } finally {
    restore();
  }
  assert.deepEqual(writes.saved, [{ status: 'pending', expiresAt: now }]);
});

test('with other paid payments and no time left the membership is expired', async () => {
  const membership = { status: 'active', startsAt: at(-5), expiresAt: at(25) };
  const { writes, restore } = stubRevert({ membership, otherPaid: true });
  try {
    await revertPaidPayment(null, paidPayment({ startsAt: at(-5), endsAt: at(25) }), now);
  } finally {
    restore();
  }
  assert.equal(writes.saved[0].status, 'expired');
});

test('an old payment whose time was already used changes nothing', async () => {
  const membership = { status: 'active', startsAt: at(-10), expiresAt: at(20) };
  const { writes, restore } = stubRevert({ membership });
  try {
    await revertPaidPayment(null, paidPayment({ startsAt: at(-90), endsAt: at(-60) }), now);
  } finally {
    restore();
  }
  assert.equal(writes.shifts.length, 0);
  assert.deepEqual(writes.saved, [{ status: 'active', expiresAt: at(20) }]);
});
