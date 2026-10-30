const test = require('node:test');
const assert = require('node:assert/strict');
const { hasActiveMembership } = require('../src/utils/membership');

test('acepta membresía activa vigente', () => {
  const now = new Date('2026-01-15T12:00:00.000Z');
  const membership = {
    status: 'active',
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-02-01T00:00:00.000Z'),
  };

  assert.equal(hasActiveMembership(membership, now), true);
});

test('rechaza membresía expirada, futura, suspendida o inexistente', () => {
  const now = new Date('2026-01-15T12:00:00.000Z');
  assert.equal(hasActiveMembership({ status: 'active', expiresAt: new Date('2026-01-01') }, now), false);
  assert.equal(hasActiveMembership({ status: 'active', startsAt: new Date('2026-02-01') }, now), false);
  assert.equal(hasActiveMembership({ status: 'suspended' }, now), false);
  assert.equal(hasActiveMembership(null, now), false);
});
