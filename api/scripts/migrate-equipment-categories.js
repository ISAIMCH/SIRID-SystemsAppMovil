// Catálogo global: el equipo desbloquea ejercicios por equipmentCategory, así que todos los equipos deben tenerla.
// Llena las que faltan y mueve a 'Smith' / 'Balones / Accesorios' los equipos que antes caían en una categoría genérica.
// Uso: npm run migrate:equipment-categories --dry-run   (o: node scripts/migrate-equipment-categories.js --dry-run)
require('dotenv').config();
const mongoose = require('mongoose');
const Equipment = require('../src/models/equipment.model');
const { normalizeEquipmentCategory } = require('../src/constants/equipment-families');

// PowerShell drops `--` in `npm run x -- --dry-run`, so npm keeps the flag and exposes it as npm_config_dry_run.
const DRY_RUN = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';
// Categories that existed before Smith and Balones were split out of them.
const UPGRADES = { Smith: ['Máquinas', 'Barras', 'Otro'], 'Balones / Accesorios': ['Otro'] };

// Returns the category to store, or null when the current one should stay (it may have been chosen by hand).
function nextCategory(item) {
  const inferred = normalizeEquipmentCategory(`${item.name ?? ''} ${item.zone ?? ''}`);
  if (!item.equipmentCategory) return inferred;
  return UPGRADES[inferred]?.includes(item.equipmentCategory) ? inferred : null;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI no está definida.');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    const items = await Equipment.collection.find({}, { projection: { name: 1, zone: 1, equipmentCategory: 1 } }).toArray();
    const operations = items.flatMap((item) => {
      const equipmentCategory = nextCategory(item);
      if (!equipmentCategory) return [];
      console.log(`${item.name}: ${item.equipmentCategory ?? '(sin categoría)'} -> ${equipmentCategory}`);
      return [{ updateOne: { filter: { _id: item._id }, update: { $set: { equipmentCategory } } } }];
    });
    console.log(`Equipos revisados: ${items.length}; por actualizar: ${operations.length}${DRY_RUN ? ' (dry-run, sin cambios)' : ''}`);
    if (operations.length && !DRY_RUN) await Equipment.collection.bulkWrite(operations, { ordered: false });
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { nextCategory };
if (require.main === module) main().catch((error) => { console.error(`Equipment category migration failed: ${error.message}`); process.exitCode = 1; });
