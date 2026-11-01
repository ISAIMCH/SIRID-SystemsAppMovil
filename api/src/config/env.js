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
}).refine(
  (env) => env.NODE_ENV !== 'production' || env.CORS_ORIGINS.trim() !== '',
  { path: ['CORS_ORIGINS'], message: 'es obligatorio en producción (orígenes web separados por comas).' },
).refine(
  (env) => {
    const configured = R2_KEYS.filter((key) => env[key] !== '').length;
    return configured === R2_KEYS.length || (configured === 0 && env.NODE_ENV !== 'production');
  },
  { path: ['R2'], message: `${R2_KEYS.join(', ')} son obligatorias en producción y van juntas.` },
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

module.exports = parsedEnv.data;