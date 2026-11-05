const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DATASET_MEDIA_BASE_URL, detectImageType, isMediaKey, resolveMediaUrl, toMediaKey, uploadPlatformMedia,
} = require('../src/utils/catalog-media');
const { collectMediaKeys } = require('../scripts/upload-exercise-media');

function withMediaEnv(t, values) {
  const previous = { bucket: process.env.EXERCISES_MEDIA_BUCKET, url: process.env.EXERCISES_MEDIA_PUBLIC_URL };
  const set = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  set('EXERCISES_MEDIA_BUCKET', values.bucket);
  set('EXERCISES_MEDIA_PUBLIC_URL', values.url);
  t.after(() => {
    set('EXERCISES_MEDIA_BUCKET', previous.bucket);
    set('EXERCISES_MEDIA_PUBLIC_URL', previous.url);
  });
}

test('sin bucket configurado, las claves se sirven desde el dataset en GitHub', (t) => {
  withMediaEnv(t, {});
  assert.equal(resolveMediaUrl('videos/0001-2gPfomN.gif'), `${DATASET_MEDIA_BASE_URL}videos/0001-2gPfomN.gif`);
  assert.equal(resolveMediaUrl(''), null);
  assert.equal(resolveMediaUrl(undefined), null);
});

test('con bucket público, claves y URLs viejas de GitHub apuntan a R2', (t) => {
  withMediaEnv(t, { bucket: 'gymgo-media', url: 'https://media.gymgo.mx' });
  assert.equal(resolveMediaUrl('videos/0001-2gPfomN.gif'), 'https://media.gymgo.mx/videos/0001-2gPfomN.gif');
  assert.equal(resolveMediaUrl(`${DATASET_MEDIA_BASE_URL}images/0001-2gPfomN.jpg`), 'https://media.gymgo.mx/images/0001-2gPfomN.jpg');
  assert.equal(resolveMediaUrl('https://otro.example.com/a.gif'), 'https://otro.example.com/a.gif');
  assert.equal(toMediaKey('https://media.gymgo.mx/sirid/videos/x.gif'), 'sirid/videos/x.gif');
});

test('la URL pública puede llevar una ruta base', (t) => {
  withMediaEnv(t, { bucket: 'gymgo-media', url: 'https://pub-abc.r2.dev/catalogo/' });
  assert.equal(resolveMediaUrl('videos/a b.gif'), 'https://pub-abc.r2.dev/catalogo/videos/a%20b.gif');
  assert.equal(toMediaKey('https://pub-abc.r2.dev/catalogo/videos/a%20b.gif'), 'videos/a b.gif');
});

test('solo acepta claves de imagen seguras', () => {
  assert.equal(isMediaKey('videos/0001-2gPfomN.gif'), true);
  assert.equal(isMediaKey('../.env'), false);
  assert.equal(isMediaKey('videos/../../x.gif'), false);
  assert.equal(isMediaKey('videos/x.exe'), false);
  assert.equal(isMediaKey('https://x.com/a.gif'), false);
});

test('detecta el tipo real por los primeros bytes', () => {
  const pad = Buffer.alloc(12);
  assert.equal(detectImageType(Buffer.concat([Buffer.from('GIF89a'), pad])), 'gif');
  assert.equal(detectImageType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), pad])), 'jpg');
  assert.equal(detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])), 'webp');
  assert.equal(detectImageType(Buffer.concat([Buffer.from('%PDF-'), pad])), null);
});

test('la subida rechaza tipos que no corresponden y sin bucket responde 503', async (t) => {
  withMediaEnv(t, {});
  const jpeg = { buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(12)]) };
  await assert.rejects(uploadPlatformMedia(jpeg, 'gif'), { statusCode: 400 });
  await assert.rejects(uploadPlatformMedia(jpeg, 'image'), { statusCode: 503 });
});

test('el script de subida junta cada medio una vez y descarta rutas inseguras', () => {
  const keys = collectMediaKeys([
    { gif_url: 'videos/0001-a.gif', image: 'images/0001-a.jpg' },
    { gif_url: '/videos/0001-a.gif', image: '../../etc/passwd.jpg' },
    { gif_url: 'https://cdn.example.com/x.gif' },
  ]);
  assert.deepEqual(keys, ['images/0001-a.jpg', 'videos/0001-a.gif']);
});
