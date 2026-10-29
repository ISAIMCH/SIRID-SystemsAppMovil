const { randomInt } = require('node:crypto');
const Payment = require('../models/payment.model');
const HttpError = require('./http-error');

// A unique partial index on pending payments backs this check against races.
async function generateUniquePaymentPin() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pin = String(randomInt(0, 100000)).padStart(5, '0');
    if (!(await Payment.exists({ validationPin: pin, status: 'pending' }))) return pin;
  }
  throw new HttpError(503, 'No se pudo generar un PIN. Intenta de nuevo.');
}

module.exports = { generateUniquePaymentPin };
