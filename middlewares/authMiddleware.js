// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/userModel'); // Assurez-vous que le chemin est correct
const { AppError } = require('./errorHandler');
const { logger } = require('../config/winston');

/**
 * Protège les routes en vérifiant le token JWT.
 * Si valide, attache l'utilisateur à req.user.
 */
exports.protect = async (req, res, next) => {
  let token;

  // 1) Récupérer le token et vérifier s'il existe
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Optionnel: vérifier les cookies si vous stockez le token en cookie
  // else if (req.cookies.jwt) {
  //   token = req.cookies.jwt;
  // }

  if (!token) {
    return next(
      new AppError('Vous n\'êtes pas connecté. Veuillez vous connecter pour accéder à cette ressource.', 401)
    );
  }

  try {
    // 2) Vérification du token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3) Vérifier si l'utilisateur existe toujours
    const currentUser = await User.findById(decoded.id).select('+isActive'); // Sélectionner isActive pour vérification
    if (!currentUser) {
      return next(
        new AppError('L\'utilisateur appartenant à ce token n\'existe plus.', 401)
      );
    }

    // 4) Vérifier si l'utilisateur a changé son mot de passe après l'émission du token
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next(
        new AppError('Mot de passe récemment changé. Veuillez vous reconnecter.', 401)
      );
    }
    
    // 5) Vérifier si le compte utilisateur est actif
    if (!currentUser.isActive) {
        return next(
            new AppError('Votre compte a été désactivé. Veuillez contacter le support.', 403) // 403 Forbidden
        );
    }
    
    // 6) Vérifier si l'email de l'utilisateur est vérifié (pour certaines routes)
    // Cette vérification peut être plus spécifique à certaines routes, donc on la met en commentaire ici
    // mais on la garde comme exemple pour un middleware plus granulaire.
    // if (!currentUser.emailVerified) {
    //   return next(
    //     new AppError('Veuillez vérifier votre adresse e-mail pour accéder à cette fonctionnalité.', 403)
    //   );
    // }


    // ACCÈS ACCORDÉ : attacher l'utilisateur à l'objet request
    req.user = currentUser;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
        return next(new AppError('Token invalide. Veuillez vous reconnecter.', 401));
    }
    if (err.name === 'TokenExpiredError') {
        return next(new AppError('Votre session a expiré. Veuillez vous reconnecter.', 401));
    }
    logger.error('Erreur d\'authentification du token:', err);
    return next(new AppError('Erreur lors de l\'authentification de votre session.', 500));
  }
};



/**
 * Restreint l'accès à certains rôles (si vous implémentez des rôles).
 * Exemple: exports.restrictTo = (...roles) => { ... }
 * Pour l'instant, on n'a pas de système de rôles complexe.
 */


/**
 * Middleware pour vérifier si l'utilisateur est le propriétaire d'une ressource.
 * @param {mongoose.Model} Model - Le modèle Mongoose à vérifier (ex: Ad, Alert).
 * @param {string} resourceIdParamName - Le nom du paramètre dans req.params qui contient l'ID de la ressource (ex: 'id', 'adId').
 * @param {string} [userIdField='userId'] - Le nom du champ dans le document qui stocke l'ID de l'utilisateur propriétaire.
 */
exports.checkOwnership = (Model, resourceIdParamName = 'id', userIdField = 'userId') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParamName];
      if (!resourceId) {
        return next(new AppError('ID de ressource manquant dans la requête.', 400));
      }

      const resource = await Model.findById(resourceId);

      if (!resource) {
        return next(new AppError('Ressource non trouvée.', 404));
      }

      // Comparer l'ID de l'utilisateur connecté avec l'ID du propriétaire de la ressource
      // Assurez-vous que resource[userIdField] et req.user.id sont bien des ObjectIds ou des chaînes comparables.
      if (resource[userIdField].toString() !== req.user.id.toString()) {
        return next(new AppError('Vous n\'êtes pas autorisé à modifier cette ressource.', 403));
      }

      req.resource = resource; // Attacher la ressource à la requête pour une utilisation ultérieure
      next();
    } catch (error) {
      logger.error('Erreur checkOwnership:', error);
      return next(new AppError('Erreur lors de la vérification de la propriété de la ressource.', 500));
    }
  };
};
