const path = require('node:path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const Equipment = require('./src/models/equipment.model');
const User = require('./src/models/user.model');

const equipmentCatalog = [
  { name: 'Prensa de piernas', zone: 'Zona de piernas', brand: 'Life Fitness', usageFrequency: 'high' },
  { name: 'Rack para sentadillas', zone: 'Peso libre', brand: 'Rogue', usageFrequency: 'high' },
  { name: 'Banco ajustable', zone: 'Peso libre', brand: 'Matrix', usageFrequency: 'high' },
  { name: 'Mancuernas 2-20 kg', zone: 'Peso libre', brand: 'Technogym', usageFrequency: 'high' },
  { name: 'Mancuernas 22-40 kg', zone: 'Peso libre', brand: 'Technogym', usageFrequency: 'medium' },
  { name: 'Polea crossover', zone: 'Máquinas', brand: 'Life Fitness', usageFrequency: 'high' },
  { name: 'Jalón al pecho', zone: 'Máquinas', brand: 'Precor', usageFrequency: 'high' },
  { name: 'Remo sentado', zone: 'Máquinas', brand: 'Precor', usageFrequency: 'medium' },
  { name: 'Extensión de piernas', zone: 'Zona de piernas', brand: 'Hammer Strength', usageFrequency: 'medium' },
  { name: 'Curl femoral', zone: 'Zona de piernas', brand: 'Hammer Strength', usageFrequency: 'medium' },
  { name: 'Press de pecho', zone: 'Máquinas', brand: 'Life Fitness', usageFrequency: 'high' },
  { name: 'Caminadora 01', zone: 'Cardio', brand: 'Technogym', usageFrequency: 'high' },
  { name: 'Caminadora 02', zone: 'Cardio', brand: 'Technogym', usageFrequency: 'high' },
  { name: 'Elíptica', zone: 'Cardio', brand: 'Precor', usageFrequency: 'medium' },
  { name: 'Bicicleta estática', zone: 'Cardio', brand: 'Schwinn', usageFrequency: 'low' },
];

function buildUsers(passwordHash, now) {
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const coachEmail = 'coach@gymgo.test';

  return [
    {
      name: 'Coach de Prueba',
      email: coachEmail,
      role: 'Coach',
      isActive: true,
      membership: { status: 'active' },
      passwordHash,
    },
    {
      name: 'Cliente Prueba Uno',
      email: 'cliente1@gymgo.test',
      role: 'Cliente',
      isActive: true,
      assignedCoach: null,
      goal: 'ganar masa muscular',
      experienceLevel: 'principiante',
      availableTrainingDays: [1, 3, 5],
      preferredTrainingTime: 'Tarde',
      preferredZones: ['Peso libre', 'Máquinas'],
      membership: {
        status: 'active',
        startsAt: now,
        expiresAt,
        planName: 'Mensual de prueba',
        price: 599,
        currency: 'MXN',
        durationDays: 30,
        autoRenew: false,
      },
      passwordHash,
    },
    {
      name: 'Cliente Prueba Dos',
      email: 'cliente2@gymgo.test',
      role: 'Cliente',
      isActive: true,
      assignedCoach: null,
      goal: 'perder grasa',
      experienceLevel: 'intermedio',
      availableTrainingDays: [2, 4, 6],
      preferredTrainingTime: 'Mañana',
      preferredZones: ['Cardio', 'Zona de piernas'],
      membership: {
        status: 'active',
        startsAt: now,
        expiresAt,
        planName: 'Mensual de prueba',
        price: 599,
        currency: 'MXN',
        durationDays: 30,
        autoRenew: false,
      },
      passwordHash,
    },
  ];
}

async function seed() {
  const mongoUri = process.env.MONGO_URI;
  const password = process.env.SEED_PASSWORD;

  if (!mongoUri || mongoUri.includes('<')) {
    throw new Error('MONGO_URI no está definida o todavía contiene un placeholder.');
  }
  if (password !== 'GymGo2026!') {
    throw new Error('Define SEED_PASSWORD=GymGo2026! en el entorno antes de ejecutar el seeder.');
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  for (const item of equipmentCatalog) {
    await Equipment.updateOne(
      { name: item.name, zone: item.zone },
      { $set: { ...item, status: 'available' } },
      { upsert: true, runValidators: true },
    );
  }

  const users = buildUsers(passwordHash, now);
  let coach;
  for (const user of users) {
    const seededUser = await User.findOneAndUpdate(
      { email: user.email },
      { $set: user },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    if (seededUser.role === 'Coach') coach = seededUser;
  }

  if (!coach) throw new Error('No se pudo crear el Coach de prueba.');
  await User.updateMany(
    { email: { $in: ['cliente1@gymgo.test', 'cliente2@gymgo.test'] } },
    { $set: { assignedCoach: coach._id } },
    { runValidators: true },
  );

  const seededEquipmentCount = await Equipment.countDocuments({
    name: { $in: equipmentCatalog.map((item) => item.name) },
  });
  const seededUserCount = await User.countDocuments({ email: { $in: users.map((user) => user.email) } });

  console.log(`Seeder completado. Equipos: ${seededEquipmentCount}/15. Usuarios: ${seededUserCount}/3.`);
  console.log('Cuentas de prueba: coach@gymgo.test, cliente1@gymgo.test, cliente2@gymgo.test.');
}

seed()
  .catch((error) => {
    console.error('No se pudo completar el seeder:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });