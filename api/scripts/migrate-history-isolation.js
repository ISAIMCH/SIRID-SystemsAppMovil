// Aísla el historial por organización: cada entrenamiento (WorkoutSession) recibe la organización de su rutina y
// la sucursal principal del cliente en ella, y las observaciones del personal pasan de la cuenta (User) a la
// organización (OrganizationMember). Hasta ejecutarla, el personal no ve los entrenamientos antiguos.
// Uso: npm run migrate:history --dry-run   (o: node scripts/migrate-history-isolation.js --dry-run)
// Se puede ejecutar varias veces: solo completa lo que falta.
require('dotenv').config();
const mongoose = require('mongoose');
const WorkoutSession = require('../src/models/workout-session.model');
const Routine = require('../src/models/routine.model');
const Membership = require('../src/models/membership.model');
const OrganizationMember = require('../src/models/organization-member.model');
const User = require('../src/models/user.model');

// PowerShell drops `--` in `npm run x -- --dry-run`, so npm keeps the flag and exposes it as npm_config_dry_run.
const DRY_RUN = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';

// The organization and gym of an old session: its routine's organization and the client's home gym there.
function sessionTenant(routine, memberships) {
  if (!routine?.organizationId) return null;
  const membership = memberships.find((item) => String(item.organizationId) === String(routine.organizationId));
  return { organizationId: routine.organizationId, gymId: membership?.homeGymId ?? null };
}

// Old notes were written by the staff of the organization the user joined first.
function notesMember(members) {
  return [...members].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] ?? null;
}

async function assignSessions() {
  const sessions = await WorkoutSession.collection.find({ organizationId: { $exists: false } }, { projection: { user: 1, routine: 1 } }).toArray();
  const routines = await Routine.collection.find({ _id: { $in: [...new Set(sessions.map((session) => String(session.routine)))].map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { organizationId: 1 } }).toArray();
  const memberships = await Membership.find({ userId: { $in: sessions.map((session) => session.user) } }).select('userId organizationId homeGymId').lean();
  const routineById = new Map(routines.map((routine) => [String(routine._id), routine]));

  let assigned = 0;
  const orphans = [];
  for (const session of sessions) {
    const tenant = sessionTenant(routineById.get(String(session.routine)), memberships.filter((item) => String(item.userId) === String(session.user)));
    if (!tenant) {
      orphans.push(String(session._id));
      continue;
    }
    if (!DRY_RUN) await WorkoutSession.collection.updateOne({ _id: session._id }, { $set: tenant });
    assigned += 1;
  }
  console.log(`Entrenamientos sin organización: ${sessions.length}; asignados: ${assigned}.`);
  if (orphans.length) console.log(`Sin rutina con organización (quedan ocultos para el personal): ${orphans.join(', ')}`);
}

async function moveObservations() {
  const users = await User.collection.find({ observations: { $exists: true } }, { projection: { observations: 1 } }).toArray();
  let moved = 0;
  const kept = [];
  for (const user of users) {
    const note = typeof user.observations === 'string' ? user.observations.trim() : '';
    const member = note && notesMember(await OrganizationMember.find({ userId: user._id }).select('observations createdAt').lean());
    if (note && (!member || member.observations)) {
      // No organization to take them (or it already has its own): left on the account to review by hand.
      kept.push(String(user._id));
      continue;
    }
    if (!DRY_RUN) {
      if (member) await OrganizationMember.updateOne({ _id: member._id }, { $set: { observations: note } });
      await User.collection.updateOne({ _id: user._id }, { $unset: { observations: '' } });
    }
    if (member) moved += 1;
  }
  console.log(`Cuentas con el campo observations: ${users.length}; notas copiadas a su organización: ${moved}.`);
  if (kept.length) console.log(`Notas que no se pudieron mover (se dejan en la cuenta, ya no se muestran): ${kept.join(', ')}`);
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('Falta MONGO_URI.');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  console.log(DRY_RUN ? 'Simulación (--dry-run): no se modifica nada.\n' : 'Aplicando la migración.\n');

  await assignSessions();
  await moveObservations();

  if (DRY_RUN) {
    console.log('\nÍndices: se crearían al ejecutar sin --dry-run.');
  } else {
    await WorkoutSession.createIndexes();
    console.log('\nÍndices creados.');
  }
}

if (require.main === module) {
  main()
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error('La migración falló:', error.message);
      await mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = { sessionTenant, notesMember };
