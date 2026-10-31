const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const baseEnv = {
  MONGO_URI: 'mongodb://localhost/test',
  JWT_SECRET: 'j'.repeat(32),
  QR_TOKEN_SECRET: 'q'.repeat(32),
  IOT_DEVICE_API_KEY: 'i'.repeat(32),
  ADMIN_BOOTSTRAP_KEY: 'a'.repeat(32),
};
Object.assign(process.env, baseEnv, { NODE_ENV: 'test' });
const app = require('../src/app');

// Runs outside the project so dotenv does not fill the gaps from the developer's local .env.
function loadEnvIn(overrides) {
  const envPath = path.join(__dirname, '../src/config/env.js');
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(envPath)})`], {
    cwd: os.tmpdir(),
    env: { PATH: process.env.PATH, ...baseEnv, ...overrides },
    encoding: 'utf8',
  });
}

test('production refuses to start without CORS_ORIGINS', () => {
  const result = loadEnvIn({ NODE_ENV: 'production', CORS_ORIGINS: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CORS_ORIGINS/);
  assert.match(loadEnvIn({ NODE_ENV: 'production', CORS_ORIGINS: 'https://admin.example.com' }).stderr, /R2_/);
});

test('R2 variables go together and are required in production', () => {
  const r2 = { R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'gymgo-docs' };
  const production = { NODE_ENV: 'production', CORS_ORIGINS: 'https://admin.example.com' };
  assert.equal(loadEnvIn({ NODE_ENV: 'development' }).status, 0);
  assert.match(loadEnvIn({ NODE_ENV: 'development', R2_BUCKET: 'gymgo-docs' }).stderr, /R2_ACCOUNT_ID/);
  assert.match(loadEnvIn(production).stderr, /R2_BUCKET/);
  assert.equal(loadEnvIn({ ...production, ...r2 }).status, 0);
});

test('body limit is 1 MB except on routes that accept images', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ imageUrl: 'x'.repeat(2 * 1024 * 1024) });
  const post = (route) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

  const tooLarge = await post('/api/routines');
  assert.equal(tooLarge.status, 413);
  assert.equal((await tooLarge.json()).error, 'El contenido enviado es demasiado grande.');
  // Image routes read the body and then fail on authentication instead.
  assert.equal((await post('/api/products')).status, 401);
});
