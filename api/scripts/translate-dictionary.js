const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const ExerciseDictionary = require('../src/models/exercise-dictionary.model');

const apiRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(apiRoot, '.env') });
dotenv.config({ path: path.resolve(apiRoot, '..', '.env') });

const translations = {
  'Dumbbell bench press': 'Press de banca con mancuerna',
  'Incline bench press': 'Press de banca inclinado',
  'Decline bench press': 'Press de banca declinado',
  'Barbell Romanian deadlift': 'Peso muerto rumano con barra',
  'Dumbbell Romanian deadlift': 'Peso muerto rumano con mancuerna',
  'Romanian deadlift': 'Peso muerto rumano',
  'Bulgarian split squat': 'Sentadilla búlgara',
  'Split squat': 'Sentadilla dividida',
  'One-arm dumbbell row': 'Remo a una mano con mancuerna',
  'One arm dumbbell row': 'Remo a una mano con mancuerna',
  'One arm': 'A una mano',
  'One-arm': 'A una mano',
  'Dumbbell shoulder press': 'Press de hombro con mancuerna',
  'Overhead press': 'Press por encima de la cabeza',
  'Leg press': 'Press de pierna',
  'Chest fly': 'Apertura de pecho',
  'Dumbbell fly': 'Apertura con mancuerna',
  'Cable fly': 'Apertura en polea',
  'Hip thrust': 'Empuje de cadera',
  'Glute bridge': 'Puente de glúteo',
  'Jumping jack': 'Salto de tijera',
  'Medicine ball': 'Balón medicinal',
  'Against wall': 'Contra la pared',
  'Towel row': 'Remo con toalla',
  'Bird dog': 'Perro de caza',
  'Good morning': 'Buenos días',
  'Hip raise': 'Elevación de cadera',
  'Leg raise': 'Elevación de pierna',
  'Bench press': 'Press de banca',
  'Bench dip': 'Fondos en banco',
  'On a': 'Con una',
  'With': 'Con',
  'EZ barbell': 'Barra EZ',
  'EZ bar': 'Barra EZ',
  'Smith machine': 'Máquina Smith',
  'Cable crossover': 'Cruce en polea',
  'Single arm': 'A una mano',
  'Single-arm': 'A una mano',
  'Single leg': 'A una pierna',
  'Single-leg': 'A una pierna',
  'Close grip': 'Agarre cerrado',
  'Close-grip': 'Agarre cerrado',
  'Wide grip': 'Agarre abierto',
  'Wide-grip': 'Agarre abierto',
  'Push-up': 'Lagartija',
  'Push up': 'Lagartija',
  'Pull-up': 'Dominada',
  'Pull up': 'Dominada',
  'Chin-up': 'Dominada supina',
  'Chin up': 'Dominada supina',
  'Body weight': 'Peso corporal',
  Bodyweight: 'Peso corporal',
  'Leg extension': 'Extensión de pierna',
  'Leg curl': 'Curl de pierna',
  'Calf raise': 'Elevación de pantorrilla',
  'Lateral raise': 'Elevación lateral',
  'Front raise': 'Elevación frontal',
  'Rear delt': 'Deltoide posterior',
  'Lower back': 'Espalda baja',
  'Upper back': 'Espalda alta',
  'Upper arm': 'Brazo superior',
  'Lower arm': 'Antebrazo',
  'Upper leg': 'Muslo',
  'Lower leg': 'Pierna inferior',
  Dumbbells: 'Mancuernas',
  Dumbbell: 'Mancuerna',
  Barbells: 'Barras',
  Barbell: 'Barra',
  Cables: 'Poleas',
  Cable: 'Polea',
  Machines: 'Máquinas',
  Machine: 'Máquina',
  Kettlebells: 'Pesas rusas',
  Kettlebell: 'Pesa rusa',
  Bands: 'Bandas',
  Band: 'Banda',
  Smith: 'Smith',
  Squats: 'Sentadillas',
  Squat: 'Sentadilla',
  Lunges: 'Desplantes',
  Lunge: 'Desplante',
  Deadlifts: 'Pesos muertos',
  Deadlift: 'Peso muerto',
  Rows: 'Remos',
  Row: 'Remo',
  Flyes: 'Aperturas',
  Flies: 'Aperturas',
  Fly: 'Apertura',
  Raises: 'Elevaciones',
  Raise: 'Elevación',
  Curls: 'Curls',
  Curl: 'Curl',
  Extensions: 'Extensiones',
  Extension: 'Extensión',
  Presses: 'Presses',
  Press: 'Press',
  Crunches: 'Abdominales',
  Crunch: 'Abdominal',
  Planks: 'Planchas',
  Plank: 'Plancha',
  Seated: 'Sentado',
  Standing: 'De pie',
  Incline: 'Inclinado',
  Decline: 'Declinado',
  Reverse: 'Inverso',
  Alternate: 'Alterno',
  Alternating: 'Alterno',
  Split: 'Dividida',
  Male: 'Hombre',
  Dip: 'Fondo',
  Dips: 'Fondos',
  Slam: 'Lanzamiento',
  Towel: 'Toalla',
  Rope: 'Cuerda',
  Ball: 'Balón',
  Wall: 'Pared',
  Arm: 'Brazo',
  Lying: 'Acostado',
  Prone: 'Boca abajo',
  Supine: 'Boca arriba',
  Front: 'Frontal',
  Side: 'Lateral',
  Delts: 'Deltoides',
  Deltoids: 'Deltoides',
  Deltoid: 'Deltoide',
  Chest: 'Pecho',
  Back: 'Espalda',
  Shoulders: 'Hombros',
  Shoulder: 'Hombro',
  Legs: 'Piernas',
  Leg: 'Pierna',
  Biceps: 'Bíceps',
  Triceps: 'Tríceps',
  Glutes: 'Glúteos',
  Glute: 'Glúteo',
  Calves: 'Pantorrillas',
  Calf: 'Pantorrilla',
  Core: 'Abdomen',
  Abs: 'Abdomen',
  Neck: 'Cuello',
  Quadriceps: 'Cuádriceps',
  Quads: 'Cuádriceps',
  Hamstrings: 'Isquiotibiales',
  Pectorals: 'Pectorales',
  Pectoral: 'Pectoral',
  Lats: 'Dorsales',
  Lat: 'Dorsal',
  Forearms: 'Antebrazos',
  Forearm: 'Antebrazo',
  Traps: 'Trapecios',
  Trapezius: 'Trapecio',
  Abductors: 'Abductores',
  Adductors: 'Aductores',
  Waist: 'Cintura',
  Cardio: 'Cardio',
};

const orderedTerms = Object.entries(translations).sort((left, right) => right[0].length - left[0].length);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function translateText(value) {
  if (!value) return value;
  let result = value;
  for (const [english, spanish] of orderedTerms) {
    const expression = new RegExp(`\\b${escapeRegex(english)}\\b`, 'gi');
    result = result.replace(expression, spanish);
  }
  result = result.replace(/\s+/g, ' ').trim();
  return result ? result[0].toLocaleUpperCase('es-MX') + result.slice(1) : result;
}

async function main() {
  if (!process.env.MONGO_URI || process.env.MONGO_URI.includes('<')) {
    throw new Error('MONGO_URI no está definida o todavía contiene un placeholder.');
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    const records = await ExerciseDictionary.find({}).select('_id name targetMuscle').lean();
    const operations = records.flatMap((record) => {
      const name = translateText(record.name);
      const targetMuscle = translateText(record.targetMuscle);
      if (name === record.name && targetMuscle === record.targetMuscle) return [];
      return [{
        updateOne: {
          filter: { _id: record._id },
          update: { $set: { name, targetMuscle } },
        },
      }];
    });

    let result = { matchedCount: 0, modifiedCount: 0 };
    if (operations.length) result = await ExerciseDictionary.bulkWrite(operations, { ordered: false });
    console.log(`Translation complete: ${result.modifiedCount} exercises updated (${records.length} checked).`);
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { translateText, translations };

if (require.main === module) {
  main().catch((error) => {
    console.error(`Dictionary translation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
