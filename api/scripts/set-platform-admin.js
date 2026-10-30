// Da acceso al panel de SIRID a una cuenta existente, o se lo quita con --revoke.
// Uso: npm run platform:admin correo@ejemplo.com   (o: node scripts/set-platform-admin.js correo@ejemplo.com --revoke)
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/user.model');

// PowerShell drops `--` in `npm run x -- --revoke`, so npm keeps the flag and exposes it as npm_config_revoke.
const REVOKE = process.argv.includes('--revoke') || process.env.npm_config_revoke === 'true';
const email = process.argv.slice(2).find((arg) => !arg.startsWith('--'))?.toLowerCase().trim();

async function main() {
  if (!process.env.MONGO_URI) throw new Error('Falta MONGO_URI.');
  if (!email) throw new Error('Indica el correo de la cuenta: npm run platform:admin correo@ejemplo.com');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });

  const user = await User.findOneAndUpdate({ email }, { $set: { isPlatformAdmin: !REVOKE } }, { new: true });
  if (!user) throw new Error(`No existe una cuenta con el correo ${email}.`);
  console.log(REVOKE ? `${email} ya no tiene acceso al panel de SIRID.` : `${email} ahora tiene acceso al panel de SIRID.`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error('No se pudo actualizar la cuenta:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
