const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  QR_TOKEN_SECRET: z.string().min(32),
  IOT_DEVICE_API_KEY: z.string().min(32),
  ADMIN_BOOTSTRAP_KEY: z.string().min(32),
  ENABLE_ADMIN_BOOTSTRAP: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  QR_TOKEN_TTL_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
  CORS_ORIGINS: z.string().default(''),
});

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