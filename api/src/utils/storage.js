const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const HttpError = require('./http-error');

// Private documents live in a Cloudflare R2 bucket (S3 API). Nothing is public: reads go through signed URLs.
const SIGNED_URL_TTL_SECONDS = 300;
// Read on first use, so modules that only import the helpers do not need the whole environment.
const env = () => require('../config/env');

let client = null;

function getClient() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env();
  if (!R2_BUCKET) throw new HttpError(503, 'El almacenamiento de documentos no está configurado.');
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return client;
}

async function putObject(key, body, contentType) {
  await getClient().send(new PutObjectCommand({ Bucket: env().R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

// Streams the file through the API (used by the legacy /api/uploads/documents route).
async function getObjectStream(key) {
  const object = await getClient().send(new GetObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
  return object.Body;
}

async function deleteObject(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
}

// Only ASCII survives in the header's plain filename; the original name goes in filename* as well.
function contentDisposition(filename, download) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

async function signedUrl(key, { filename, contentType, download = false }) {
  const command = new GetObjectCommand({
    Bucket: env().R2_BUCKET,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: contentDisposition(filename, download),
    ResponseCacheControl: 'private, no-store',
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  return { url, expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000) };
}

module.exports = { SIGNED_URL_TTL_SECONDS, putObject, getObjectStream, deleteObject, signedUrl, contentDisposition };
