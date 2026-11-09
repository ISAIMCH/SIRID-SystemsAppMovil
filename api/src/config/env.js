const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const R2_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  QR_TOKEN_SECRET: z.string().min(32),
  ADMIN_BOOTSTRAP_KEY: z.string().min(32),
  ENABLE_ADMIN_BOOTSTRAP: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  QR_TOKEN_TTL_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
  CORS_ORIGINS: z.string().default(''),
  // Cloudflare R2 bucket for private documents (CVs, IDs, student cards).
  R2_ACCOUNT_ID: z.string().trim().default(''),
  R2_ACCESS_KEY_ID: z.string().trim().default(''),
  R2_SECRET_ACCESS_KEY: z.string().trim().default(''),
  R2_BUCKET: z.string().trim().default(''),
  // PUBLIC R2 bucket for the global catalog's GIFs and thumbnails, and the URL it is served from
  // (custom domain or r2.dev). Without them the catalog keeps loading media from the dataset on GitHub.
  EXERCISES_MEDIA_BUCKET: z.string().trim().default(''),
  EXERCISES_MEDIA_PUBLIC_URL: z.string().trim().default(''),
  // GymGo plans paid by gym owners. Stripe (card and OXXO) with its webhook; test keys (sk_test_) work the same way.
  STRIPE_SECRET_KEY: z.string().trim().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().trim().default(''),
  STRIPE_ENABLE_OXXO: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  // PayPal Checkout; the API captures and verifies each order with PayPal before activating anything.
  PAYPAL_CLIENT_ID: z.string().trim().default(''),
  PAYPAL_CLIENT_SECRET: z.string().trim().default(''),
  PAYPAL_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
}).refine(
  (env) => (env.STRIPE_SECRET_KEY === '') === (env.STRIPE_WEBHOOK_SECRET === ''),
  { path: ['STRIPE'], message: 'STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET van juntas.' },
).refine(
  (env) => env.STRIPE_SECRET_KEY === '' || /^(sk|rk)_(test|live)_/.test(env.STRIPE_SECRET_KEY),
  { path: ['STRIPE_SECRET_KEY'], message: 'debe ser una clave secreta de Stripe (sk_test_… o sk_live_…).' },
).refine(
  (env) => env.STRIPE_WEBHOOK_SECRET === '' || env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_'),
  { path: ['STRIPE_WEBHOOK_SECRET'], message: 'debe empezar con whsec_.' },
).refine(
  (env) => (env.PAYPAL_CLIENT_ID === '') === (env.PAYPAL_CLIENT_SECRET === ''),
  { path: ['PAYPAL'], message: 'PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET van juntas.' },
).refine(
  (env) => env.NODE_ENV !== 'production' || env.CORS_ORIGINS.trim() !== '',
  { path: ['CORS_ORIGINS'], message: 'es obligatorio en producción (orígenes web separados por comas).' },
).refine(
  (env) => {
    const configured = R2_KEYS.filter((key) => env[key] !== '').length;
    return configured === R2_KEYS.length || (configured === 0 && env.NODE_ENV !== 'production');
  },
  { path: ['R2'], message: `${R2_KEYS.join(', ')} son obligatorias en producción y van juntas.` },
).refine(
  (env) => (env.EXERCISES_MEDIA_BUCKET === '') === (env.EXERCISES_MEDIA_PUBLIC_URL === ''),
  { path: ['EXERCISES_MEDIA'], message: 'EXERCISES_MEDIA_BUCKET y EXERCISES_MEDIA_PUBLIC_URL van juntas.' },
).refine(
  (env) => env.EXERCISES_MEDIA_BUCKET === '' || env.R2_BUCKET !== '',
  { path: ['EXERCISES_MEDIA_BUCKET'], message: 'requiere las credenciales R2_* configuradas.' },
).refine(
  (env) => env.EXERCISES_MEDIA_BUCKET === '' || env.EXERCISES_MEDIA_BUCKET !== env.R2_BUCKET,
  { path: ['EXERCISES_MEDIA_BUCKET'], message: 'debe ser distinto de R2_BUCKET: el de medios es público y el de documentos privado.' },
).refine(
  (env) => env.EXERCISES_MEDIA_PUBLIC_URL === '' || /^https:\/\/[^\s/]+(\/\S*)?$/i.test(env.EXERCISES_MEDIA_PUBLIC_URL),
  { path: ['EXERCISES_MEDIA_PUBLIC_URL'], message: 'debe ser una URL https (dominio propio o r2.dev).' },
);

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Configuración de entorno inválida:\n${details}`);
}

if (parsedEnv.data.JWT_SECRET === parsedEnv.data.QR_TOKEN_SECRET) {
  throw new Error('JWT_SECRET y QR_TOKEN_SECRET deben ser diferentes.');
}

if (parsedEnv.data.NODE_ENV === 'production' && !parsedEnv.data.EXERCISES_MEDIA_BUCKET) {
  console.warn('EXERCISES_MEDIA_BUCKET no está configurado: los GIFs del catálogo se sirven desde GitHub.');
}

module.exports = parsedEnv.data;