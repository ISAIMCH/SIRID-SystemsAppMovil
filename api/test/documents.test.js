const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// The controllers read the environment when they load.
const placeholder = 'x'.repeat(40);
for (const key of ['JWT_SECRET', 'QR_TOKEN_SECRET', 'ADMIN_BOOTSTRAP_KEY']) process.env[key] ??= `${placeholder}${key}`;
process.env.MONGO_URI ??= 'mongodb://localhost/test';

const HttpError = require('../src/utils/http-error');
const Document = require('../src/models/document.model');
const {
  detectFileType,
  documentKind,
  canViewDocument,
  canReviewDocument,
  canUploadFor,
  cleanFileName,
  applyLegacyDocumentList,
} = require('../src/utils/documents');
const { contentDisposition } = require('../src/utils/storage');
const DocumentAccessLog = require('../src/models/document-access-log.model');

const id = () => new mongoose.Types.ObjectId();
const organizationId = id();
const otherOrganizationId = id();
const [mainGym, northGym] = [id(), id()];

const PDF = Buffer.from('%PDF-1.7\n...');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0]);

const ownerMember = (userId = id()) => ({ userId, organizationId, roles: ['Propietario'], gyms: [] });
const staffMember = (gymId, roles, userId = id()) => ({ userId, organizationId, roles: [], gyms: [{ gymId, roles }] });
const clientMember = (userId = id()) => ({ userId, organizationId, roles: ['Cliente'], gyms: [] });

// The request after authenticate/authorize: its user, role and the gyms it reaches.
function requestAs(member, role, gymIds) {
  return {
    user: { _id: member.userId },
    tenant: { organizationId, role, gymIds, gymId: gymIds[0] },
    tenantContext: { member },
  };
}

const owner = requestAs(ownerMember(), 'Admin', [mainGym, northGym]);
const mainManager = requestAs(staffMember(mainGym, ['Gerente']), 'Admin', [mainGym]);
const mainReception = requestAs(staffMember(mainGym, ['Recepcion']), 'Recepcion', [mainGym]);
const mainCoach = requestAs(staffMember(mainGym, ['Coach']), 'Coach', [mainGym]);

const documentOf = (member, kind) => ({ _id: id(), ownerId: member.userId, organizationId: member.organizationId, kind });

test('the file type comes from its first bytes, not from what the client declares', () => {
  assert.equal(detectFileType(PDF), 'application/pdf');
  assert.equal(detectFileType(PNG), 'image/png');
  assert.equal(detectFileType(JPG), 'image/jpeg');
  assert.equal(detectFileType(Buffer.from('<html><script>alert(1)</script>')), null);
  assert.equal(detectFileType(Buffer.from('%PD')), null);
  assert.equal(detectFileType(undefined), null);
});

test('staff categories only fit staff and client categories only fit clients', () => {
  const coach = staffMember(mainGym, ['Coach']);
  const client = clientMember();
  assert.equal(documentKind('cv', coach), 'staff');
  assert.equal(documentKind('student_id', client), 'client');
  assert.throws(() => documentKind('cv', client), HttpError);
  assert.throws(() => documentKind('student_id', coach), HttpError);
  assert.equal(documentKind('other', coach), 'staff');
  assert.equal(documentKind('other', client), 'client');
  assert.equal(documentKind('other', ownerMember()), 'staff');
});

test('everyone sees their own documents', () => {
  const coach = staffMember(mainGym, ['Coach']);
  const request = requestAs(coach, 'Coach', [mainGym]);
  assert.equal(canViewDocument(request, documentOf(coach, 'staff'), coach), true);
  // Even with another organization selected.
  assert.equal(canViewDocument({ ...request, tenant: { ...request.tenant, organizationId: otherOrganizationId } }, documentOf(coach, 'staff'), coach), true);
});

test('staff files reach the owner and the managers of the gym, never reception or coaches', () => {
  const mainCoachMember = staffMember(mainGym, ['Coach']);
  const cv = documentOf(mainCoachMember, 'staff');
  assert.equal(canViewDocument(owner, cv, mainCoachMember), true);
  assert.equal(canViewDocument(mainManager, cv, mainCoachMember), true);
  assert.equal(canViewDocument(mainReception, cv, mainCoachMember), false);
  assert.equal(canViewDocument(mainCoach, cv, mainCoachMember), false);
});

test('a manager does not see staff files of another gym, nor the owner\'s', () => {
  const northCoach = staffMember(northGym, ['Coach']);
  assert.equal(canViewDocument(mainManager, documentOf(northCoach, 'staff'), northCoach), false);
  const otherOwner = ownerMember();
  assert.equal(canViewDocument(mainManager, documentOf(otherOwner, 'staff'), otherOwner), false);
  assert.equal(canViewDocument(owner, documentOf(otherOwner, 'staff'), otherOwner), true);
});

test('files of former staff only reach owners', () => {
  const former = documentOf(staffMember(mainGym, ['Coach']), 'staff');
  assert.equal(canViewDocument(owner, former, null), true);
  assert.equal(canViewDocument(mainManager, former, null), false);
});

test('client documents reach reception and managers, never coaches', () => {
  const client = clientMember();
  const card = documentOf(client, 'client');
  assert.equal(canViewDocument(mainReception, card, client), true);
  assert.equal(canViewDocument(mainManager, card, client), true);
  assert.equal(canViewDocument(owner, card, client), true);
  assert.equal(canViewDocument(mainCoach, card, client), false);
  assert.equal(canViewDocument(requestAs(clientMember(), 'Cliente', [mainGym]), card, client), false);
});

test('no document crosses organizations', () => {
  const client = { ...clientMember(), organizationId: otherOrganizationId };
  assert.equal(canViewDocument(owner, documentOf(client, 'client'), client), false);
  assert.equal(canViewDocument(mainReception, documentOf(client, 'client'), client), false);
});

test('nobody reviews their own documents', () => {
  const receptionist = mainReception.tenantContext.member;
  const ownCard = documentOf(receptionist, 'client');
  assert.equal(canReviewDocument(mainReception, ownCard, receptionist), false);
  const client = clientMember();
  assert.equal(canReviewDocument(mainReception, documentOf(client, 'client'), client), true);
});

test('only owners and managers upload for someone else', () => {
  const client = clientMember();
  const mainCoachMember = staffMember(mainGym, ['Coach']);
  const northCoach = staffMember(northGym, ['Coach']);
  assert.equal(canUploadFor(requestAs(client, 'Cliente', [mainGym]), client, 'client'), true);
  assert.equal(canUploadFor(mainManager, client, 'client'), true);
  assert.equal(canUploadFor(mainManager, mainCoachMember, 'staff'), true);
  assert.equal(canUploadFor(mainManager, northCoach, 'staff'), false);
  assert.equal(canUploadFor(mainReception, client, 'client'), false);
  assert.equal(canUploadFor(mainCoach, client, 'client'), false);
});

test('file names are cleaned and the header stays ASCII', () => {
  assert.equal(cleanFileName(Buffer.from('credencial ñ.pdf', 'utf8').toString('latin1'), 'application/pdf'), 'credencial ñ.pdf');
  assert.equal(cleanFileName('../../etc/passwd', 'application/pdf'), '....etcpasswd');
  assert.equal(cleanFileName('', 'image/png'), 'documento.png');
  const header = contentDisposition('credencial "ñ".pdf', true);
  assert.match(header, /^attachment; filename="credencial _\S_\.pdf"; filename\*=UTF-8''/);
  assert.equal(/[^\x20-\x7e]/.test(header), false);
});

test('the dashboard can drop legacy document paths but never add new ones', async (t) => {
  const userId = id();
  const hidden = { legacyPath: '/uploads/documents/a.pdf', organizationId, ownerId: userId, deletedAt: null, save: async () => {} };
  const elsewhere = { legacyPath: '/uploads/documents/b.pdf', organizationId: otherOrganizationId, ownerId: userId, deletedAt: null, save: async () => {} };
  const originalFind = Document.find;
  const originalCreate = DocumentAccessLog.create;
  Document.find = async () => [hidden, elsewhere];
  DocumentAccessLog.create = async () => [];
  t.after(() => { Document.find = originalFind; DocumentAccessLog.create = originalCreate; });

  const user = { _id: userId, documents: ['/uploads/documents/a.pdf', '/uploads/documents/b.pdf', '/uploads/documents/c.pdf'] };
  await applyLegacyDocumentList(mainManager, user, ['/uploads/documents/c.pdf', '/uploads/documents/injected.pdf']);
  assert.deepEqual(user.documents, ['/uploads/documents/b.pdf', '/uploads/documents/c.pdf']);
  assert.ok(hidden.deletedAt instanceof Date);
  assert.equal(elsewhere.deletedAt, null);
});

// The rooms an event goes to, from a fake Socket.IO server.
async function notifiedRooms(req, document, ownerMember) {
  const { notifyDocument } = require('../src/controllers/document.controller');
  let rooms = [];
  const io = { to: (target) => { rooms = target; return { emit: () => {} }; } };
  await notifyDocument({ ...req, app: { get: () => io } }, { createdAt: new Date(), ...document }, 'created', ownerMember);
  return rooms;
}

test('staff file events reach the managers of the employee\'s gyms live, not only the owners', async () => {
  const northCoach = staffMember(northGym, ['Coach']);
  const rooms = await notifiedRooms(owner, documentOf(northCoach, 'staff'), northCoach);
  assert.deepEqual(rooms, [`user:${northCoach.userId}`, `org:${organizationId}:owners`, `gym:${northGym}:managers`]);
  assert.equal(rooms.includes(`gym:${mainGym}:managers`), false);
});

test('a client purge in another organization never notifies the request\'s organization', async () => {
  const client = { ...clientMember(), organizationId: otherOrganizationId };
  const rooms = await notifiedRooms(mainReception, documentOf(client, 'client'), client);
  assert.deepEqual(rooms, [`user:${client.userId}`, `org:${otherOrganizationId}:admins`]);
});
