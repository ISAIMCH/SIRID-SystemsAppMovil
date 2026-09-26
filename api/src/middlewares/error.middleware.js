const mongoose = require('mongoose');
const { ZodError } = require('zod');

function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada.' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let statusCode = error.statusCode ?? 500;
  let message = error.message ?? 'Error interno del servidor.';

  if (error instanceof ZodError) {
    statusCode = 400;
    message = 'Los datos enviados no son válidos.';
  } else if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Los datos enviados no cumplen el formato requerido.';
  } else if (error.code === 11000) {
    statusCode = 409;
    message = 'Ya existe un registro con esos datos.';
  }

  if (statusCode >= 500) console.error(error);
  res.status(statusCode).json({ error: message });
}

module.exports = { notFound, errorHandler };