const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Equipment = require('../src/models/equipment.model');
const MaintenanceReport = require('../src/models/maintenance-report.model');
const User = require('../src/models/user.model');
const { updateReport } = require('../src/controllers/maintenance.controller');

const id = () => new mongoose.Types.ObjectId();
const gymId = id();

function stub(object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  return () => { object[method] = original; };
}

function query(value) {
  const chain = { session: () => chain, populate: () => chain, lean: async () => value };
  chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return chain;
}

// Applies each update to one report and returns the equipment's units in maintenance after each step.
async function runUpdates(updates, { outOfService = false } = {}) {
  const equipment = { totalQuantity: 3, maintenanceQuantity: outOfService ? 1 : 0, save: async () => {} };
  const report = { id: String(id()), equipment: id(), gymId, status: 'pending', equipmentOutOfService: outOfService, save: async () => {} };
  const restore = [
    stub(User, 'startSession', async () => ({ withTransaction: (work) => work(), endSession: async () => {} })),
    stub(MaintenanceReport, 'findOne', () => query(report)),
    stub(MaintenanceReport, 'findById', () => query(report)),
    stub(Equipment, 'findOne', () => query(equipment)),
  ];
  const units = [];
  try {
    for (const body of updates) {
      const req = { params: { id: report.id }, body, tenant: { organizationId: id(), gymIds: [gymId], gymId } };
      await updateReport(req, { json() {} });
      units.push(equipment.maintenanceQuantity);
    }
  } finally {
    restore.forEach((undo) => undo());
  }
  return units;
}

test('a report takes out of service one unit at most and resolving gives it back', async () => {
  const units = await runUpdates([
    { status: 'in_progress', equipmentStatus: 'out_of_service' },
    { status: 'in_progress', equipmentStatus: 'out_of_service' },
    { status: 'resolved' },
  ]);
  assert.deepEqual(units, [1, 1, 0]);
});

test('resolving a report that never took a unit leaves the other units in maintenance alone', async () => {
  const units = await runUpdates([{ status: 'in_progress' }, { status: 'resolved' }]);
  assert.deepEqual(units, [0, 0]);
});

test('a unit can go back to service before the report is resolved', async () => {
  const units = await runUpdates([{ status: 'in_progress', equipmentStatus: 'available' }], { outOfService: true });
  assert.deepEqual(units, [0]);
});
