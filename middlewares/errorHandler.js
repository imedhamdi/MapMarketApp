// /middlewares/errorHandler.js
import { logger } from '../config/logger.js';
import AppError from '../utils/appError.js';

// Fonction pour gérer les erreurs de cast de Mongoose (ex: ID invalide)
const handleCastErrorDB = (err) => {
  const message = `Ressource invalide ${err.path}: ${err.value}.`;
  logger.warn(`Erreur de cast MongoDB: ${message}`);
  return new AppError(message, 400); // Bad Request
};

// Fonction pour gérer les erreurs de champ dupliqué de Mongoose
const handleDuplicateFieldsDB = (err) => {
  // Extraire la valeur du champ dupliqué du message d'erreur
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Valeur de champ dupliquée: ${value}. Veuillez utiliser une autre valeur.`;
  logger.warn(`Erreur de champ dupliqué MongoDB: ${message}`);
  return new AppError(message, 400);
};

// Fonction pour gérer les erreurs de validation de Mongoose
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Données d'entrée invalides. ${errors.join('. ')}`;
  logger.warn(`Erreur de validation MongoDB: ${message}`);
  return new AppError(message, 400);
};

// Fonction pour gérer les erreurs JWT (token invalide)
const handleJWTError = () => {
  logger.warn('Erreur JWT: Token invalide.');
  return new AppError('Token invalide. Veuillez vous reconnecter.', 401); // Unauthorized
}

// Fonction pour gérer les erreurs JWT (token expiré)
const handleJWTExpiredError = () => {
  logger.warn('Erreur JWT: Token expiré.');
  return new AppError('Votre session a expiré. Veuillez vous reconnecter.', 401);
}


// Fonction pour envoyer les erreurs en mode développement (détaillées)
const sendErrorDev = (err, req, res) => {
  // A) API (si l'URL commence par /api)
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  }
  // B) SITE WEB RENDU (si vous en avez un, sinon adapter)
  // Pour une API pure, cette partie pourrait être simplifiée ou supprimée.
  logger.error('ERREUR 💥 (DEV - Rendu page)', err);
  // return res.status(err.statusCode).render('error', { // Si vous utilisez un moteur de template
  //   title: 'Quelque chose s\'est mal passé !',
  //   msg: err.message
  // });
  return res.status(err.statusCode).json({ // Fallback pour API si pas de rendu de page
      title: 'Quelque chose s\'est mal passé !',
      message: err.message
  });
};

// Fonction pour envoyer les erreurs en mode production (messages génériques)
const sendErrorProd = (err, req, res) => {
  // A) API
  if (req.originalUrl.startsWith('/api')) {
    // Erreurs opérationnelles, fiables : envoyer le message au client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    }
    // Erreurs de programmation ou autres erreurs inconnues : ne pas divulguer les détails de l'erreur
    // 1) Loguer l'erreur
    logger.error('ERREUR 💥 (PROD - API)', err);
    // 2) Envoyer un message générique
    return res.status(500).json({
      status: 'error',
      message: 'Quelque chose s\'est très mal passé ! Veuillez réessayer plus tard.'
    });
  }

  // B) SITE WEB RENDU (si applicable)
  // Erreurs opérationnelles, fiables
  if (err.isOperational) {
    logger.info(`Erreur opérationnelle (PROD - Rendu page): ${err.message}`);
    // return res.status(err.statusCode).render('error', {
    //   title: 'Quelque chose s\'est mal passé !',
    //   msg: err.message
    // });
     return res.status(err.statusCode).json({ // Fallback pour API si pas de rendu de page
        title: 'Quelque chose s\'est mal passé !',
        message: err.message
    });
  }
  // Erreurs de programmation ou autres erreurs inconnues
  logger.error('ERREUR 💥 (PROD - Rendu page)', err);
  // return res.status(err.statusCode).render('error', {
  //   title: 'Quelque chose s\'est mal passé !',
  //   msg: 'Veuillez réessayer plus tard.'
  // });
   return res.status(500).json({ // Fallback pour API si pas de rendu de page
      status: 'error',
      message: 'Quelque chose s\'est très mal passé ! Veuillez réessayer plus tard.'
  });
};


// Middleware de gestion des erreurs global
// Express le reconnaît comme un gestionnaire d'erreurs car il a 4 arguments
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500; // Défaut à 500 (Internal Server Error)
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err }; // Copie de l'erreur
    error.message = err.message; // Important de copier le message aussi

    // Gérer des erreurs spécifiques de Mongoose pour les rendre plus conviviales en production
    if (err.name === 'CastError') error = handleCastErrorDB(err); // err original, pas la copie
    if (err.code === 11000) error = handleDuplicateFieldsDB(err);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res); // Envoyer l'erreur traitée (ou l'originale si non traitée spécifiquement)
  }
};

export default globalErrorHandler;
