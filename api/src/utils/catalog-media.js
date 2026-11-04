const { randomUUID } = require('node:crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const HttpError = require('./http-error');
const { r2Client } = require('./storage');

// GIFs and thumbnails of the global catalog live in a PUBLIC R2 bucket (EXERCISES_MEDIA_BUCKET), apart from the
// private documents bucket. The database stores object keys ("videos/0001-x.gif"); full URLs are built when
// serving, so moving to another domain only needs EXERCISES_MEDIA_PUBLIC_URL.
const DATASET_MEDIA_BASE_URL = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/';
// File names carry the dataset's media id or a UUID, so a key never changes content.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MAX_MEDIA_SIZE = 5 * 1024 * 1024;
const CONTENT_TYPES = { gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]*\.(gif|jpe?g|png|webp)$/i;

function withSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

// Read on every call (validated at startup in config/env.js) so tests and scripts can change it.
function publicBaseUrl() {
  const configured = String(process.env.EXERCISES_MEDIA_PUBLIC_URL ?? '').trim();
  return withSlash(configured || DATASET_MEDIA_BASE_URL);
}

function isMediaKey(value) {
  return KEY_PATTERN.test(value) && !value.includes('..') && !value.includes('//');
}

// Absolute URLs under our bucket or the dataset's GitHub copy become keys again; other URLs stay as they are.
function toMediaKey(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  for (const base of new Set([publicBaseUrl(), DATASET_MEDIA_BASE_URL])) {
    if (text.startsWith(base)) return decodeURI(text.slice(base.length));
  }
  return text.replace(/^\/+/, '');
}

function resolveMediaUrl(value) {
  const key = toMediaKey(value);
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  return new URL(encodeURI(key), publicBaseUrl()).toString();
}

function contentTypeFor(key) {
  return CONTENT_TYPES[String(key).split('.').pop().toLowerCase()] ?? null;
}

// The declared type of an upload is not trusted: the file's first bytes decide.
function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const head = buffer.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

function mediaBucket() {
  const bucket = String(process.env.EXERCISES_MEDIA_BUCKET ?? '').trim();
  if (!bucket || !String(process.env.EXERCISES_MEDIA_PUBLIC_URL ?? '').trim()) {
    throw new HttpError(503, 'El almacenamiento de medios del catálogo no está configurado.');
  }
  return bucket;
}

async function putMedia(key, body, contentType = contentTypeFor(key)) {
  await r2Client().send(new PutObjectCommand({
    Bucket: mediaBucket(), Key: key, Body: body, ContentType: contentType, CacheControl: CACHE_CONTROL,
  }));
}

// GIF (animation) or image (thumbnail) made by SIRID for its own exercises.
async function uploadPlatformMedia(file, kind) {
  const extension = detectImageType(file?.buffer);
  const allowed = kind === 'gif' ? ['gif', 'webp'] : ['jpg', 'png', 'webp'];
  if (!extension || !allowed.includes(extension)) {
    throw new HttpError(400, kind === 'gif' ? 'La animación debe ser un GIF o WebP.' : 'La miniatura debe ser JPG, PNG o WebP.');
  }
  const key = `sirid/${kind === 'gif' ? 'videos' : 'images'}/${randomUUID()}.${extension}`;
  await putMedia(key, file.buffer, CONTENT_TYPES[extension]);
  return { key, url: resolveMediaUrl(key) };
}

module.exports = {
  CACHE_CONTROL,
  DATASET_MEDIA_BASE_URL,
  MAX_MEDIA_SIZE,
  contentTypeFor,
  detectImageType,
  isMediaKey,
  mediaBucket,
  putMedia,
  resolveMediaUrl,
  toMediaKey,
  uploadPlatformMedia,
};
