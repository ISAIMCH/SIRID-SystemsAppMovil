const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Equipment = require('../src/models/equipment.model');
const MaintenanceReport = require('../src/models/maintenance-report.model');
const User = require('../src/models/user.model');
const { listMyReports, listReports, updateReport } = require('../src/controllers/maintenance.controller');

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

test('an updated report goes live to owners, the gym managers and its reporter, not to reception', async () => {
  const [organizationId, reporterId] = [id(), id()];
  const report = {
    id: String(id()), organizationId, gymId, equipment: id(), reportedBy: { _id: reporterId, name: 'Ana' },
    status: 'pending', equipmentOutOfService: false, save: async () => {},
  };
  const emitted = [];
  const io = { to: (rooms) => ({ emit: (event, payload) => emitted.push({ rooms, event, payload }) }) };
  const restore = [
    stub(User, 'startSession', async () => ({ withTransaction: (work) => work(), endSession: async () => {} })),
    stub(MaintenanceReport, 'findOne', () => query(report)),
    stub(MaintenanceReport, 'findById', () => query(report)),
  ];
  try {
    const req = { params: { id: report.id }, body: { status: 'in_progress' }, tenant: { organizationId, gymIds: [gymId], gymId }, app: { get: () => io } };
    await updateReport(req, { json() {} });
  } finally {
    restore.forEach((undo) => undo());
  }

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, 'maintenance-updated');
  assert.equal(emitted[0].payload.action, 'updated');
  assert.deepEqual(emitted[0].rooms, [`org:${organizationId}:owners`, `gym:${gymId}:managers`, `user:${reporterId}`]);
});

test('a client lists only their own reports in the active organization', async () => {
  const [organizationId, clientId] = [id(), id()];
  let filter;
  const chain = { populate: () => chain, sort: () => chain, limit: () => chain, lean: async () => [] };
  const restore = stub(MaintenanceReport, 'find', (value) => { filter = value; return chain; });
  try {
    await listMyReports({ user: { id: String(clientId) }, tenant: { organizationId, gymIds: [gymId], gymId } }, { json() {} });
  } finally {
    restore();
  }
  assert.deepEqual(filter, { organizationId, reportedBy: String(clientId) });
});

test('a coach reads the gym reports with the reporter name but without their email', async () => {
  const organizationId = id();
  const populated = [];
  const chain = { populate: (path, fields) => { populated.push([path, fields]); return chain; }, sort: () => chain, lean: async () => [] };
  const restore = stub(MaintenanceReport, 'find', () => chain);
  try {
    await listReports({ query: {}, tenant: { organizationId, role: 'Coach', gymIds: [gymId], gymId } }, { json() {} });
    await listReports({ query: {}, tenant: { organizationId, role: 'Admin', gymIds: [gymId], gymId } }, { json() {} });
  } finally {
    restore();
  }
  assert.deepEqual(populated.filter(([path]) => path === 'reportedBy').map(([, fields]) => fields), ['name', 'name email']);
});
