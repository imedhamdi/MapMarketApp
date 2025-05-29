// /controllers/authController.js
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import AppError from '../utils/appError.js';
import sendEmail from '../utils/email.js';
import { logger } from '../config/logger.js';

/**
 * Génère un token JWT pour un utilisateur donné et l'envoie dans un cookie.
 * @param {User} user - L'objet utilisateur.
 * @param {number} statusCode - Le code de statut HTTP pour la réponse.
 * @param {express.Response} res - L'objet réponse Express.
 */
const createSendToken = (user, statusCode, req, res) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });

  // Options pour le cookie JWT
  const cookieOptions = {
    expires: new Date(Date.now() + parseInt(process.env.JWT_COOKIE_EXPIRES_IN, 10) * 24 * 60 * 60 * 1000),
    httpOnly: true, // Le cookie n'est pas accessible par JavaScript côté client (sécurité XSS)
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https', // True si HTTPS
    sameSite: 'lax' // Ou 'strict' ou 'none' (avec secure: true) selon vos besoins CORS
  };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

  res.cookie('jwt', token, cookieOptions);

  // Retirer le mot de passe de l'objet utilisateur avant de l'envoyer
  user.password = undefined;

  logger.info(`Token JWT généré et envoyé pour l'utilisateur ID: ${user._id}`);
  res.status(statusCode).json({
    status: 'success',
    token, // Optionnel: envoyer aussi le token dans la réponse JSON si le client en a besoin
    user // Envoyer les données de l'utilisateur (sans le mot de passe)
  });
};

/**
 * Contrôleur pour l'inscription d'un nouvel utilisateur.
 */
export const signup = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Vérifier si l'utilisateur existe déjà (le schéma User a `unique:true` pour email et username)
    // Mais une vérification explicite ici peut donner un message plus clair.
    // const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    // if (existingUser) {
    //   return next(new AppError('Cet email ou nom d\'utilisateur est déjà utilisé.', 400));
    // }

    const newUser = await User.create({
      username,
      email,
      password
      // passwordConfirm: req.body.passwordConfirm, // Si vous avez un champ de confirmation
    });

    // Générer un token de vérification d'email
    const verificationToken = newUser.createEmailVerificationToken();
    await newUser.save({ validateBeforeSave: false }); // Sauvegarder le token sans re-valider le reste

    // Construire l'URL de vérification
    // Assurez-vous que CLIENT_URL est défini dans .env (ex: http://localhost:8000 ou votre URL de frontend)
    const verificationURL = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;

    const message = `Bienvenue sur MapMarket, ${newUser.username} ! Veuillez vérifier votre adresse e-mail en cliquant sur ce lien (ou en le copiant dans votre navigateur) : ${verificationURL}\n\nSi vous n'avez pas créé de compte, veuillez ignorer cet e-mail. Ce lien expirera dans 24 heures.`;

    try {
      await sendEmail({
        to: newUser.email,
        subject: 'Vérification de votre adresse e-mail MapMarket',
        text: message,
        // html: '<h1>Version HTML ici</h1>' // Optionnel: version HTML de l'email
      });
      logger.info(`Email de vérification envoyé à ${newUser.email} pour l'utilisateur ID: ${newUser._id}`);
      
      // Ne pas connecter l'utilisateur directement, attendre la vérification d'email
      // Ou, connecter l'utilisateur et lui demander de vérifier son email plus tard.
      // Pour cet exemple, nous allons envoyer une réponse indiquant que l'email a été envoyé.
      res.status(201).json({
        status: 'success',
        message: 'Inscription réussie ! Veuillez vérifier votre e-mail pour activer votre compte.',
        // Optionnel: retourner l'utilisateur si vous voulez que le frontend affiche quelque chose
        // user: { id: newUser._id, username: newUser.username, email: newUser.email } 
      });

    } catch (emailError) {
      logger.error(`Erreur lors de l'envoi de l'email de vérification à ${newUser.email}: ${emailError.message}`);
      // L'utilisateur est créé, mais l'email n'a pas pu être envoyé.
      // Il faudrait une logique pour permettre à l'utilisateur de redemander un email de vérification.
      return next(new AppError('Utilisateur créé, mais l\'e-mail de vérification n\'a pas pu être envoyé. Veuillez contacter le support ou réessayer plus tard.', 500));
    }

  } catch (error) {
    // Gérer les erreurs de validation Mongoose (ex: champ dupliqué)
    if (error.code === 11000 || error.name === 'MongoServerError' && error.message.includes('duplicate key')) {
        const field = Object.keys(error.keyValue)[0];
        return next(new AppError(`La valeur pour le champ '${field}' (${error.keyValue[field]}) est déjà utilisée.`, 400));
    }
    if (error.name === 'ValidationError') {
        return next(new AppError(error.message, 400));
    }
    logger.error('Erreur lors de l\'inscription:', error);
    next(error); // Passer à globalErrorHandler
  }
};

/**
 * Contrôleur pour la connexion d'un utilisateur.
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1) Vérifier si l'email et le mot de passe existent
    if (!email || !password) {
      return next(new AppError('Veuillez fournir une adresse e-mail et un mot de passe.', 400));
    }

    // 2) Vérifier si l'utilisateur existe et si le mot de passe est correct
    const user = await User.findOne({ email }).select('+password'); // Sélectionner explicitement le mot de passe

    if (!user || !(await user.correctPassword(password, user.password))) {
      logger.warn(`Tentative de connexion échouée pour l'email: ${email} (identifiants incorrects)`);
      return next(new AppError('Adresse e-mail ou mot de passe incorrect.', 401)); // Unauthorized
    }
    
    // 3) (Optionnel) Vérifier si l'email de l'utilisateur est vérifié
    if (!user.isEmailVerified) {
        // Permettre la connexion mais informer l'utilisateur ou restreindre certaines actions
        // Ou, pour une sécurité plus stricte, refuser la connexion :
        // logger.warn(`Tentative de connexion pour un email non vérifié: ${email}`);
        // return next(new AppError('Veuillez vérifier votre adresse e-mail avant de vous connecter. Un nouveau lien peut être demandé.', 403)); // Forbidden
        
        // Pour l'instant, on connecte mais on pourrait ajouter un message
        logger.info(`Utilisateur ${user.email} connecté avec un email non vérifié.`);
    }


    // 4) Si tout est OK, envoyer le token au client
    createSendToken(user, 200, req, res);
    logger.info(`Utilisateur ID: ${user._id} connecté avec succès.`);

  } catch (error) {
    logger.error('Erreur lors de la connexion:', error);
    next(error);
  }
};

/**
 * Contrôleur pour la déconnexion de l'utilisateur.
 * Efface le cookie JWT.
 */
export const logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000), // Expire dans 10 secondes
    httpOnly: true
  });
  logger.info(`Utilisateur déconnecté (cookie jwt effacé).`);
  res.status(200).json({ status: 'success', message: 'Déconnexion réussie.' });
};

/**
 * Contrôleur pour la demande de réinitialisation de mot de passe.
 */
export const forgotPassword = async (req, res, next) => {
  try {
    // 1) Récupérer l'utilisateur basé sur l'email fourni
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      logger.warn(`Demande de réinitialisation de mot de passe pour un email non trouvé: ${req.body.email}`);
      // Ne pas révéler si l'utilisateur existe ou non pour des raisons de sécurité
      return next(new AppError('Si cette adresse e-mail est dans notre base de données, vous recevrez un e-mail avec les instructions pour réinitialiser votre mot de passe.', 200));
    }

    // 2) Générer le token de réinitialisation aléatoire
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false }); // Sauvegarder le token haché et l'expiration

    // 3) Envoyer le token à l'email de l'utilisateur
    // L'URL de réinitialisation pointera vers votre frontend, qui fera ensuite un appel PATCH à /reset-password/:token
    const resetURL = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;

    const message = `Mot de passe oublié ? Soumettez une requête PATCH avec votre nouveau mot de passe et passwordConfirm à : ${resetURL}.\nSi vous n'avez pas oublié votre mot de passe, veuillez ignorer cet e-mail. Ce lien expirera dans 10 minutes.`;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Votre token de réinitialisation de mot de passe MapMarket (valide 10 min)',
        text: message
      });
      logger.info(`Email de réinitialisation de mot de passe envoyé à ${user.email} pour l'utilisateur ID: ${user._id}`);
      res.status(200).json({
        status: 'success',
        message: 'Token envoyé à l\'adresse e-mail !'
      });
    } catch (err) {
      logger.error(`Erreur lors de l'envoi de l'email de réinitialisation à ${user.email}: ${err.message}`);
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return next(new AppError('Une erreur est survenue lors de l\'envoi de l\'e-mail. Veuillez réessayer plus tard.', 500));
    }
  } catch (error) {
    logger.error('Erreur dans forgotPassword:', error);
    next(error);
  }
};

/**
 * Contrôleur pour la réinitialisation effective du mot de passe.
 */
export const resetPassword = async (req, res, next) => {
  try {
    // 1) Récupérer l'utilisateur basé sur le token
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() } // Vérifier que le token n'est pas expiré
    });

    // 2) Si le token n'est pas valide ou a expiré, renvoyer une erreur
    if (!user) {
      logger.warn(`Tentative de réinitialisation de mot de passe avec un token invalide ou expiré: ${req.params.token}`);
      return next(new AppError('Le token est invalide ou a expiré.', 400));
    }

    // 3) Définir le nouveau mot de passe
    if (!req.body.password || req.body.password.length < 6) {
        return next(new AppError('Veuillez fournir un nouveau mot de passe d\'au moins 6 caractères.', 400));
    }
    // Si vous avez passwordConfirm, vérifiez-le ici:
    // if (req.body.password !== req.body.passwordConfirm) {
    //   return next(new AppError('Les mots de passe ne correspondent pas.', 400));
    // }
    user.password = req.body.password;
    // user.passwordConfirm = req.body.passwordConfirm; // Si applicable
    user.passwordResetToken = undefined; // Effacer le token et son expiration
    user.passwordResetExpires = undefined;
    // Le middleware pre('save') sur le modèle User s'occupera de hacher le nouveau mot de passe
    // et de mettre à jour passwordChangedAt.
    await user.save();

    // 4) Connecter l'utilisateur et envoyer le token JWT
    createSendToken(user, 200, req, res);
    logger.info(`Mot de passe réinitialisé avec succès pour l'utilisateur ID: ${user._id}`);

  } catch (error) {
    logger.error('Erreur dans resetPassword:', error);
    next(error);
  }
};

/**
 * Contrôleur pour la vérification de l'adresse e-mail.
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return next(new AppError('Token de vérification manquant ou invalide.', 400));
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      logger.warn(`Tentative de vérification d'email avec un token invalide ou expiré: ${token}`);
      // Rediriger vers une page d'erreur sur le frontend ou envoyer une réponse JSON
      // return res.redirect(`${process.env.CLIENT_URL}/email-verification-failed`);
      return next(new AppError('Le token de vérification est invalide ou a expiré. Veuillez en demander un nouveau.', 400));
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    logger.info(`Email vérifié avec succès pour l'utilisateur ID: ${user._id}`);
    
    // Optionnel: Connecter l'utilisateur directement après la vérification
    // createSendToken(user, 200, req, res);
    // Ou rediriger vers une page de succès sur le frontend
    // res.redirect(`${process.env.CLIENT_URL}/email-verified`);
    res.status(200).json({
        status: 'success',
        message: 'Adresse e-mail vérifiée avec succès ! Vous pouvez maintenant vous connecter.'
    });

  } catch (error) {
    logger.error('Erreur dans verifyEmail:', error);
    next(error);
  }
};
