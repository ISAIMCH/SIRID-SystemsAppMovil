const { createHash, randomBytes, randomInt } = require('node:crypto');

// No 0/O or 1/I/L, so a code read aloud or from a printed sign is not mistyped.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 8;
const DEVICE_KEY_PREFIX = 'gymgo_dev_';

function generateJoinCode() {
  return Array.from({ length: JOIN_CODE_LENGTH }, () => JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)]).join('');
}

// Accepts the code as typed or printed: lowercase, spaces and dashes are ignored.
function normalizeJoinCode(value) {
  return String(value ?? '').toUpperCase().replace(/[\s-]/g, '');
}

// Device keys are random and long, so a plain SHA-256 is enough to store them and to look them up.
function generateDeviceKey() {
  return `${DEVICE_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

function hashDeviceKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

module.exports = { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, DEVICE_KEY_PREFIX, generateJoinCode, normalizeJoinCode, generateDeviceKey, hashDeviceKey };
