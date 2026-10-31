// Etapa 4: sube a Cloudflare R2 los PDF que el dashboard guardó en el disco del servidor (uploads/documents)
// y crea su registro Document con la misma ruta, así User.documents sigue funcionando sin cambios.
// Uso: npm run migrate:documents --dry-run   (o: node scripts/migrate-documents.js --dry-run)
// Se puede ejecutar varias veces: omite los que ya están en R2. Los archivos locales no se borran.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const OrganizationMember = require('../src/models/organization-member.model');
const Document = require('../src/models/document.model');
const DocumentAccessLog = require('../src/models/document-access-log.model');
const storage = require('../src/utils/storage');
const { LEGACY_PREFIX, detectFileType, isStaffMember } = require('../src/utils/documents');

// PowerShell drops `--` in `npm run x -- --dry-run`, so npm keeps the flag and exposes it as npm_config_dry_run.
const DRY_RUN = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';
const DOCUMENTS_DIRECTORY = path.resolve(__dirname, '../uploads/documents');

async function migrateDocument(user, legacyPath, summary) {
  if (await Document.exists({ legacyPath })) return void summary.alreadyMigrated++;
  const filename = legacyPath.slice(LEGACY_PREFIX.length);
  const filePath = path.join(DOCUMENTS_DIRECTORY, filename);
  if (!/^[\w-]+\.pdf$/i.test(filename) || !fs.existsSync(filePath)) return void summary.missing.push(`${user.email}: ${legacyPath}`);
  const buffer = fs.readFileSync(filePath);
  if (detectFileType(buffer) !== 'application/pdf') return void summary.missing.push(`${user.email}: ${legacyPath} (no es un PDF)`);
  const member = await OrganizationMember.findOne({ userId: user._id }).sort({ createdAt: 1 }).lean();
  if (!member) return void summary.missing.push(`${user.email}: sin organización`);

  summary.migrated++;
  if (DRY_RUN) return;
  const document = new Document({
    organizationId: member.organizationId,
    ownerId: user._id,
    kind: isStaffMember(member) ? 'staff' : 'client',
    category: 'other',
    originalName: filename,
    mimeType: 'application/pdf',
    size: buffer.length,
    uploadedBy: user._id,
    legacyPath,
  });
  document.key = `org/${document.organizationId}/users/${user._id}/${document._id}.pdf`;
  await document.validate();
  await storage.putObject(document.key, buffer, 'application/pdf');
  await document.save();
  await DocumentAccessLog.create({ documentId: document._id, ownerId: user._id, organizationId: document.organizationId, actorId: user._id, action: 'upload', userAgent: 'migrate-documents' });
}

async function main() {
  if (!DRY_RUN && !env.R2_BUCKET) throw new Error('Configura las variables R2_* antes de migrar.');
  await mongoose.connect(env.MONGO_URI);
  const summary = { migrated: 0, alreadyMigrated: 0, missing: [] };
  const users = await User.find({ documents: { $regex: `^${LEGACY_PREFIX}` } }).select('email documents').lean();
  for (const user of users) {
    for (const legacyPath of user.documents.filter((value) => value.startsWith(LEGACY_PREFIX))) {
      await migrateDocument(user, legacyPath, summary);
    }
  }
  console.log(`${DRY_RUN ? '[simulación] ' : ''}Subidos a R2: ${summary.migrated}. Ya migrados: ${summary.alreadyMigrated}.`);
  if (summary.missing.length > 0) console.log(`Sin archivo en disco (se dejan como están):\n  ${summary.missing.join('\n  ')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
