// Fase 3 de la auditoría: unifica los estados de pago y crea los índices únicos parciales.
// Uso: npm run migrate:payments --dry-run   (o: node scripts/migrate-payment-statuses.js --dry-run)
require('dotenv').config();
const { randomInt } = require('node:crypto');
const mongoose = require('mongoose');
const Payment = require('../src/models/payment.model');
const StoreOrder = require('../src/models/store-order.model');

// PowerShell drops `--` in `npm run x -- --dry-run`, so npm keeps the flag and exposes it as npm_config_dry_run.
const DRY_RUN = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';
const LEGACY_STATUSES = { Completed: 'paid', Pending: 'pending', Failed: 'cancelled' };
const PICKUP_PIN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const OBSOLETE_INDEXES = [[Payment, 'user_1'], [Payment, 'validationPin_1'], [StoreOrder, 'pickupPin_1']];

const randomPaymentPin = () => String(randomInt(0, 100000)).padStart(5, '0');
const randomPickupPin = () => Array.from({ length: 4 }, () => PICKUP_PIN_ALPHABET[randomInt(PICKUP_PIN_ALPHABET.length)]).join('');

async function pickFreePin(collection, field, generate, taken) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pin = generate();
    if (!taken.has(pin) && !(await collection.findOne({ [field]: pin, status: 'pending' }, { projection: { _id: 1 } }))) {
      taken.add(pin);
      return pin;
    }
  }
  throw new Error(`No se encontró un ${field} libre.`);
}

async function duplicatesAmongPending(collection, field) {
  return collection.aggregate([
    { $match: { status: 'pending', [field]: { $exists: true, $ne: null } } },
    { $sort: { createdAt: 1 } },
    { $group: { _id: `$${field}`, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
}

async function migrateStatuses(payments) {
  for (const [legacy, status] of Object.entries(LEGACY_STATUSES)) {
    const count = await payments.countDocuments({ status: legacy });
    console.log(`Pagos '${legacy}' -> '${status}': ${count}`);
    if (count && !DRY_RUN) await payments.updateMany({ status: legacy }, { $set: { status } });
  }
}

async function assignMissingPaymentPins(payments) {
  const missing = await payments.find({ status: 'pending', $or: [{ validationPin: { $exists: false } }, { validationPin: null }] }).toArray();
  console.log(`Pagos pendientes sin PIN: ${missing.length}`);
  const taken = new Set();
  for (const payment of missing) {
    const pin = await pickFreePin(payments, 'validationPin', randomPaymentPin, taken);
    if (!DRY_RUN) await payments.updateOne({ _id: payment._id }, { $set: { pin, validationPin: pin } });
  }
}

// Keeps the oldest document's PIN and gives the rest a new one.
async function reassignDuplicatePins(collection, field, generate, label, extraFields = []) {
  const duplicates = await duplicatesAmongPending(collection, field);
  const affected = duplicates.reduce((total, group) => total + group.count - 1, 0);
  console.log(`${label} pendientes con ${field} repetido: ${affected}`);
  const taken = new Set();
  for (const group of duplicates) {
    for (const id of group.ids.slice(1)) {
      const pin = await pickFreePin(collection, field, generate, taken);
      const update = Object.fromEntries([field, ...extraFields].map((key) => [key, pin]));
      if (!DRY_RUN) await collection.updateOne({ _id: id }, { $set: update });
    }
  }
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('Falta MONGO_URI.');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  console.log(DRY_RUN ? 'Modo prueba: no se escribirá nada.\n' : 'Aplicando la migración.\n');

  const payments = Payment.collection;
  const orders = StoreOrder.collection;
  await migrateStatuses(payments);
  await assignMissingPaymentPins(payments);
  await reassignDuplicatePins(payments, 'validationPin', randomPaymentPin, 'Pagos', ['pin']);
  await reassignDuplicatePins(orders, 'pickupPin', randomPickupPin, 'Pedidos');

  // Several pending payments for the same client need a human decision, so the index is not forced.
  const pendingPerUser = await duplicatesAmongPending(payments, 'user');
  if (pendingPerUser.length) {
    console.log('\nClientes con más de un pago pendiente (resuélvelos y vuelve a ejecutar el script):');
    for (const group of pendingPerUser) console.log(`- usuario ${group._id}: pagos ${group.ids.join(', ')}`);
  }

  if (DRY_RUN) {
    console.log('\nÍndices: se crearían al ejecutar sin --dry-run.');
  } else if (pendingPerUser.length) {
    console.log('\nÍndices: no se crearon porque hay pagos pendientes duplicados.');
  } else {
    for (const [Model, name] of OBSOLETE_INDEXES) {
      if (await Model.collection.indexExists(name)) await Model.collection.dropIndex(name);
    }
    await Payment.createIndexes();
    await StoreOrder.createIndexes();
    console.log('\nÍndices creados.');
  }
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error('La migración falló:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
