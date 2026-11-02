const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { emitDirectoryUpdate } = require('../src/controllers/auth.controller');

const id = () => new mongoose.Types.ObjectId();

test('a directory change goes to the organization staff and to the person, with ids only', () => {
  const [organizationId, userId] = [id(), id()];
  const emitted = [];
  const io = { to: (rooms) => ({ emit: (event, payload) => emitted.push({ rooms, event, payload }) }) };

  emitDirectoryUpdate({ tenant: { organizationId }, app: { get: () => io } }, 'created', userId);

  assert.deepEqual(emitted, [{
    rooms: [`org:${organizationId}:staff`, `user:${userId}`],
    event: 'directory-updated',
    payload: { action: 'created', userId: String(userId), organizationId: String(organizationId) },
  }]);
});
