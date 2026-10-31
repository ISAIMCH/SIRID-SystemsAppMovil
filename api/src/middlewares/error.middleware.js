const mongoose = require('mongoose');
const { ZodError } = require('zod');
const multer = require('multer');

const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: 'El archivo supera el tamaño máximo de 10 MB.',
  LIMIT_FILE_COUNT: 'Enviaste demasiados archivos.',
  LIMIT_UNEXPECTED_FILE: 'Enviaste demasiados archivos o un campo de archivo inesperado.',
};

function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada.' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let statusCode = error.statusCode ?? 500;
  let message = error.message ?? 'Error interno del servidor.';
  let details;

  if (error instanceof ZodError) {
    statusCode = 400;
    message = 'Los datos enviados no son válidos.';
    details = error.issues ?? error.errors ?? error.message;
  } else if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Los datos enviados no cumplen el formato requerido.';
  } else if (error instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = 'El identificador o valor enviado no es válido.';
  } else if (error instanceof multer.MulterError) {
    statusCode = 400;
    message = UPLOAD_ERRORS[error.code] ?? 'El archivo enviado no es válido.';
  } else if (error.type === 'entity.too.large') {
    message = 'El contenido enviado es demasiado grande.';
  } else if (error.type === 'entity.parse.failed') {
    message = 'El cuerpo de la petición no es JSON válido.';
  } else if (error.code === 11000) {
    statusCode = 409;
    message = 'Ya existe un registro con esos datos.';
  }

  if (statusCode >= 500) {
    console.error(error);
    message = 'Error interno del servidor.';
  }
  if (details !== undefined) console.error('Validation Error:', error);
  res.status(statusCode).json({
    error: message,
    ...(statusCode < 500 && error.extra ? error.extra : {}),
    ...(details !== undefined ? { details } : {}),
  });
}

module.exports = { notFound, errorHandler };