// /middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // Assurez-vous que le chemin est correct
import AppError from '../utils/appError.js';
import { logger } from '../config/logger.js';

/**
 * Middleware pour protéger les routes.
 * Vérifie la présence et la validité d'un token JWT.
 * Attache l'utilisateur décodé à l'objet req (req.user).
 */
export const protect = async (req, res, next) => {
  let token;

  // 1) Récupérer le token (depuis l'en-tête Authorization ou le cookie)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.jwt) { // Vérifier si le token est dans un cookie nommé 'jwt'
    token = req.cookies.jwt;
  }

  if (!token) {
    logger.warn('Accès non autorisé : Token manquant.');
    return next(new AppError('Vous n\'êtes pas connecté. Veuillez vous connecter pour accéder à cette ressource.', 401));
  }

  try {
    // 2) Vérifier le token (s'il n'est pas expiré et si la signature est correcte)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3) Vérifier si l'utilisateur existe toujours
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      logger.warn(`Accès non autorisé : Utilisateur du token (ID: ${decoded.id}) n'existe plus.`);
      return next(new AppError('L\'utilisateur appartenant à ce token n\'existe plus.', 401));
    }

    // 4) Vérifier si l'utilisateur a changé son mot de passe après l'émission du token
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      logger.warn(`Accès non autorisé : Mot de passe changé après l'émission du token pour l'utilisateur ID: ${currentUser._id}.`);
      return next(new AppError('Mot de passe récemment changé. Veuillez vous reconnecter.', 401));
    }
    
    // 5) Vérifier si l'email de l'utilisateur est vérifié (si requis pour certaines routes)
    // Vous pouvez ajouter une vérification spécifique ici ou dans un autre middleware si nécessaire
    // if (!currentUser.isEmailVerified) {
    //   return next(new AppError('Veuillez vérifier votre adresse e-mail pour accéder à cette ressource.', 403)); // 403 Forbidden
    // }


    // Accès accordé : attacher l'utilisateur à l'objet de requête
    req.user = currentUser;
    logger.info(`Utilisateur authentifié ID: ${currentUser._id} pour la route: ${req.originalUrl}`);
    next();
  } catch (error) {
    logger.error('Erreur d\'authentification du token:', error.message);
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Token invalide. Veuillez vous reconnecter.', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Votre session a expiré. Veuillez vous reconnecter.', 401));
    }
    return next(new AppError('Une erreur est survenue lors de l\'authentification.', 401));
  }
};

/**
 * Middleware pour restreindre l'accès à certains rôles.
 * @param  {...string} roles - Liste des rôles autorisés.
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    // roles est un tableau comme ['admin', 'lead-guide']. req.user.role doit être défini dans le modèle User.
    // Pour l'instant, notre modèle User n'a pas de champ 'role' complexe.
    // Si vous l'implémentez, décommentez et adaptez.
    /*
    if (!roles.includes(req.user.role)) {
      logger.warn(`Accès refusé pour l'utilisateur ID: ${req.user._id} (rôle: ${req.user.role}) à la route: ${req.originalUrl}. Rôles requis: ${roles.join(', ')}`);
      return next(new AppError('Vous n\'avez pas les permissions nécessaires pour effectuer cette action.', 403)); // 403 Forbidden
    }
    */
    // Si pas de gestion de rôle complexe, on peut simplement laisser passer ou ajouter une logique simple.
    // Pour l'instant, ce middleware ne fera rien si les rôles ne sont pas implémentés.
    logger.info(`Vérification de rôle pour l'utilisateur ID: ${req.user._id}. Rôles requis: ${roles.join(', ')} (non activement vérifié si le modèle User n'a pas de champ 'role').`);
    next();
  };
};
