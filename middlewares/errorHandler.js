// middlewares/errorHandler.js
const { logger } = require('../config/winston');

// Classe d'erreur personnalisée pour mieux structurer les erreurs de l'API
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Erreurs prévues, pas des bugs de programmation

    Error.captureStackTrace(this, this.constructor);
  }
}

const handleCastErrorDB = (err) => {
  const message = `Valeur invalide ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  // Extraire la valeur du champ dupliqué du message d'erreur
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Valeur de champ dupliquée: ${value}. Veuillez utiliser une autre valeur.`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Données d'entrée invalides. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () => new AppError('Token invalide. Veuillez vous reconnecter.', 401);
const handleJWTExpiredError = () => new AppError('Votre session a expiré. Veuillez vous reconnecter.', 401);


const sendErrorDev = (err, req, res) => {
  // Log l'erreur complète en développement
  logger.error(`DEV ERROR: ${err.message}`, {
    stack: err.stack,
    status: err.status,
    statusCode: err.statusCode,
    isOperational: err.isOperational,
    error: err
  });

  return res.status(err.statusCode || 500).json({
    status: err.status || 'error',
    error: err,
    message: err.message,
    stack: err.stack,
    errors: err.errors // Si c'est une erreur de validation Joi ou Mongoose
  });
};

const sendErrorProd = (err, req, res) => {
  // Erreurs opérationnelles, prévues : envoyer un message au client
  if (err.isOperational) {
    logger.warn(`PROD OPERATIONAL ERROR: ${req.originalUrl} - ${err.message}`);
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      errors: err.errors // Peut être utile pour les erreurs de validation Joi
    });
  }

  // Erreurs de programmation ou autres erreurs inconnues : ne pas fuiter les détails
  logger.error(`PROD UNKNOWN ERROR: ${req.originalUrl} - ${err.message}`, { stack: err.stack, error: err });
  return res.status(500).json({
    status: 'error',
    message: 'Quelque chose s\'est très mal passé ! Veuillez réessayer plus tard.',
  });
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err, message: err.message, name: err.name }; // Copier l'erreur

    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error); // Pour Mongoose
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    // Gérer les erreurs de validation Joi (si error.isJoi est true)
    if (err.isJoi) {
        const errors = err.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message.replace(/["']/g, ""), // Nettoyer les guillemets
        }));
        error = new AppError('Données de requête invalides.', 400);
        error.errors = errors;
    }


    sendErrorProd(error, req, res);
  }
};

// Exporter AppError pour l'utiliser dans les contrôleurs
module.exports.AppError = AppError;
