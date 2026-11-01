const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');
const { generateJoinCode, normalizeJoinCode } = require('./access-codes');

// Reception reads the code to the client or prints it, so it uses the join-code alphabet (no 0/O, 1/I/L).
const ACTIVATION_DAYS = 30;
// After this many wrong codes the code stops working and reception gives a new one.
const MAX_FAILED_ATTEMPTS = 5;

// A new one-time code for the account: the plain code goes to reception once, only its hash is stored.
async function createActivation(now = new Date()) {
  const code = generateJoinCode();
  const expiresAt = new Date(now.getTime() + ACTIVATION_DAYS * 86400000);
  return { code, expiresAt, activation: { codeHash: await bcrypt.hash(code, 10), expiresAt, failedAttempts: 0 } };
}

function isActivationUsable(activation, now = new Date()) {
  return Boolean(activation) && activation.expiresAt > now && activation.failedAttempts < MAX_FAILED_ATTEMPTS;
}

function verifyActivationCode(activation, code) {
  return bcrypt.compare(normalizeJoinCode(code), activation.codeHash);
}

// The password of an account no one can sign in to until it is activated.
function unusablePassword() {
  return randomBytes(32).toString('base64url');
}

module.exports = { ACTIVATION_DAYS, MAX_FAILED_ATTEMPTS, createActivation, isActivationUsable, verifyActivationCode, unusablePassword };
