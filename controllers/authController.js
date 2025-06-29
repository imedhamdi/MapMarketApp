// controllers/authController.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel'); // Assurez-vous que le chemin est correct
const { AppError } = require('../middlewares/errorHandler'); // Assurez-vous que le chemin est correct
const { logger } = require('../config/winston'); // Assurez-vous que le chemin est correct
// const sendEmail = require('../utils/email'); // Décommentez et configurez pour l'envoi réel d'e-mails

// --- Fonctions Utilitaires ---

/**
 * Enveloppe les fonctions de contrôleur asynchrones pour une gestion centralisée des erreurs.
 * @param {Function} fn - La fonction de contrôleur asynchrone.
 * @returns {Function} Une nouvelle fonction qui transmet les erreurs au middleware Express.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Génère un token JWT signé.
 * @param {string} userId - L'ID de l'utilisateur.
 * @returns {string} Le token JWT.
 */
const signToken = (userId) => {
  if (!process.env.JWT_SECRET || !process.env.JWT_EXPIRES_IN) {
    logger.error('Variables d\'environnement JWT_SECRET ou JWT_EXPIRES_IN non définies.');
    throw new AppError('Erreur de configuration serveur pour l\'authentification.', 500);
  }
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

/**
 * Crée et envoie un token JWT dans la réponse, en s'assurant de ne pas modifier l'instance Mongoose.
 * @param {Object} user - L'instance Mongoose de l'utilisateur.
 * @param {number} statusCode - Le code de statut HTTP pour la réponse.
 * @param {Object} res - L'objet réponse Express.
 */
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  // Options pour le cookie (si vous choisissez de stocker le token en cookie)
  const cookieOptions = {
    expires: new Date(
      Date.now() + (parseInt(process.env.JWT_COOKIE_EXPIRES_IN_DAYS || '90', 10) * 24 * 60 * 60 * 1000)
    ),
    httpOnly: true, // Empêche l'accès au cookie via JavaScript côté client
    secure: process.env.NODE_ENV === 'production', // Transmis uniquement sur HTTPS en production
    sameSite: 'strict', // Aide à se protéger contre les attaques CSRF
  };

  res.cookie('jwt', token, cookieOptions);

  // Préparer l'objet utilisateur pour la réponse.
  // Utiliser toObject() pour obtenir une copie simple et éviter de modifier l'instance Mongoose.
  const userForResponse = user.toObject();
  delete userForResponse.password; // Ne jamais renvoyer le mot de passe, même hashé.
  delete userForResponse.passwordChangedAt; // Souvent non nécessaire pour le client après connexion.
  delete userForResponse.__v; // Version key de Mongoose.

  res.status(statusCode).json({
    success: true,
    message: statusCode === 201 ? 'Inscription réussie.' : 'Connexion réussie.',
    token, // Le token est aussi envoyé dans le corps pour les clients qui ne gèrent pas les cookies (ex: mobile)
    data: {
      user: userForResponse,
    },
  });
};

// --- Fonctions de Contrôleur ---

/**
 * Inscription d'un nouvel utilisateur.
 * POST /api/auth/signup
 */
exports.signup = asyncHandler(async (req, res, next) => {
  const { name, email, password, passwordConfirm } = req.body;

  // Validation basique (des validations plus poussées peuvent être dans le modèle ou un middleware)
  if (!name || !email || !password || !passwordConfirm) {
    return next(new AppError('Veuillez fournir nom, email, mot de passe et confirmation de mot de passe.', 400));
  }
  if (password !== passwordConfirm) {
      return next(new AppError('Le mot de passe et sa confirmation ne correspondent pas.', 400));
  }


  // Création de l'utilisateur. Le hook pre-save s'occupera du hachage du mot de passe.
  const newUser = await User.create({
    name,
    email,
    password,
    passwordConfirm, // Ce champ est utilisé par le validateur Mongoose puis écarté.
    // Les autres champs (role, etc.) prendront leurs valeurs par défaut définies dans le schéma.
  });

  // Réponse simple de succès sans envoi d'e-mail de vérification
  res.status(201).json({
    success: true,
    message: 'Inscription réussie. Vous pouvez maintenant vous connecter.',
    data: {
      userId: newUser._id,
    }
  });
});

/**
 * Connexion d'un utilisateur.
 * POST /api/auth/login
 */
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Veuillez fournir une adresse e-mail et un mot de passe.', 400));
  }

  const user = await User.findOne({ email }).select('+password +isActive');

  if (!user || !(await user.correctPassword(password, user.password))) {
    logger.warn(`Tentative de connexion échouée pour l'email: ${email} (identifiants incorrects ou utilisateur inexistant)`);
    return next(new AppError('Adresse e-mail ou mot de passe incorrect.', 401));
  }

  if (!user.isActive) {
    logger.warn(`Tentative de connexion pour un compte désactivé: ${user._id} - ${email}`);
    return next(new AppError('Votre compte a été désactivé. Veuillez contacter le support.', 403));
  }


  // Envoi du token et des informations utilisateur (sans le mot de passe)
  // createSendToken est la version corrigée qui n'altère pas l'instance `user` pour le save suivant.
  createSendToken(user, 200, res);

  // Mise à jour des informations de dernière connexion (asynchrone et "best-effort")
  try {
    user.lastLoginAt = Date.now();
    user.lastLoginIp = req.ip || req.socket?.remoteAddress || 'N/A'; // req.socket peut être undefined dans certains contextes de test
    await user.save({ validateBeforeSave: false }); // Sauvegarde uniquement les champs modifiés sans revalider tout le document
    logger.info(`Informations de dernière connexion mises à jour pour l'utilisateur: ${user._id}`);
  } catch (saveError) {
    logger.error(`Erreur lors de la sauvegarde des informations de dernière connexion pour l'utilisateur ${user._id}: ${saveError.message}`, { error: saveError, stack: saveError.stack });
    // Pas besoin de `next(saveError)` ici car la réponse principale a déjà été envoyée.
  }
});

/**
 * Déconnexion de l'utilisateur (principalement gérée côté client pour JWT stateless).
 * POST /api/auth/logout
 */
exports.logout = (req, res) => {
  // Invalider le cookie JWT
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 5 * 1000), // Expire dans 5 secondes
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  // Optionnel: si vous avez une liste de tokens actifs côté serveur (pour une invalidation plus robuste),
  // vous pourriez ajouter le token actuel à une liste noire ici.

  logger.info(`Utilisateur ${req.user ? req.user.id : '(via cookie seulement)'} déconnecté.`);
  res.status(200).json({ success: true, message: 'Déconnexion réussie.' });
};

/**
 * Demande de réinitialisation de mot de passe.
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  if (!email) {
    return next(new AppError('Veuillez fournir une adresse e-mail.', 400));
  }

  const user = await User.findOne({ email });

  // Répondre de manière identique que l'utilisateur existe ou non pour des raisons de sécurité.
  if (!user) {
    logger.warn(`Demande de réinitialisation de mot de passe pour un e-mail non trouvé: ${email}`);
    // Pas d'erreur ici, juste un message informatif.
  } else {
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false }); // Sauvegarde le token hashé et la date d'expiration.

    const resetURL = `${process.env.APP_URL}/reset-password/${resetToken}`; // Token non hashé dans l'URL

    try {
      // TODO: Implémenter la logique d'envoi d'e-mail
      /*
      await sendEmail({
        to: user.email,
        subject: 'Réinitialisation de votre mot de passe [Nom de votre Application]',
        template: 'passwordReset',
        context: { name: user.name, resetURL },
      });
      */
      logger.info(`E-mail de réinitialisation de mot de passe (simulation) envoyé à ${user.email}. URL: ${resetURL}`);
    } catch (emailError) {
      logger.error(`Échec de l'envoi de l'e-mail de réinitialisation à ${user.email}: ${emailError.message}`, { error: emailError, stack: emailError.stack });
      // Annuler la génération du token si l'e-mail ne part pas ?
      // Pour l'instant, on ne le fait pas pour permettre au système de fonctionner même si l'emailing est temporairement bas.
      // L'utilisateur peut redemander.
      // On continue pour envoyer la réponse standard au client.
    }
  }
  // Message générique indiquant que si l'e-mail est dans la base, un lien sera envoyé.
  res.status(200).json({
    success: true,
    message: 'Si cette adresse e-mail est enregistrée dans notre système, vous recevrez un lien pour réinitialiser votre mot de passe.',
  });
});

/**
 * Réinitialise le mot de passe de l'utilisateur avec un token.
 * PATCH /api/auth/reset-password/:token
 */
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { token } = req.params;
  const { password, passwordConfirm } = req.body;

  if (!password || !passwordConfirm) {
    return next(new AppError('Veuillez fournir un nouveau mot de passe et sa confirmation.', 400));
  }

  // Hasher le token reçu de l'URL pour le comparer à celui en base de données.
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }, // Vérifie que le token n'a pas expiré.
  });

  if (!user) {
    return next(new AppError('Le token de réinitialisation est invalide ou a expiré. Veuillez refaire une demande.', 400));
  }

  // Définir le nouveau mot de passe. Le hook pre-save s'occupera du hachage.
  user.password = password;
  user.passwordConfirm = passwordConfirm;
  user.passwordResetToken = undefined; // Invalider le token après utilisation.
  user.passwordResetExpires = undefined;
  // user.passwordChangedAt sera mis à jour par le hook pre-save.

  await user.save(); // Valide et sauvegarde le nouveau mot de passe.

  // Connecter l'utilisateur automatiquement après la réinitialisation du mot de passe.
  createSendToken(user, 200, res);
  logger.info(`Mot de passe réinitialisé et connexion réussie pour l'utilisateur: ${user._id}`);
});

/**
 * Valide l'adresse e-mail de l'utilisateur avec un token.
 * GET /api/auth/validate-email/:token  (Note: Le frontend redirigera vers cette URL)
 * Alternativement: POST /api/auth/validate-email avec le token dans le body
 */


// Ajoutez la nouvelle fonction updatePassword à la fin du fichier, avant "module.exports"
// CORRIGÉ : Version refactorisée avec asyncHandler pour la cohérence
exports.updatePassword = asyncHandler(async (req, res, next) => {
    // 1) Obtenir l'utilisateur depuis la collection
    const user = await User.findById(req.user.id).select('+password');

    // 2) Vérifier si le mot de passe actuel est correct
    const { currentPassword, password, passwordConfirm } = req.body;
    if (!currentPassword || !(await user.correctPassword(currentPassword, user.password))) {
        // AppError est intercepté par asyncHandler
        return next(new AppError('Votre mot de passe actuel est incorrect.', 401));
    }

    // 3) Valider que les nouveaux mots de passe sont fournis
    if (!password || !passwordConfirm) {
        return next(new AppError('Veuillez fournir un nouveau mot de passe et le confirmer.', 400));
    }
    // La validation de la correspondance est déjà gérée par le schéma Mongoose

    // 4) Mettre à jour le mot de passe
    user.password = password;
    user.passwordConfirm = passwordConfirm;
    await user.save(); // Le middleware pre('save') s'occupera du reste

    // 5) Créer et envoyer un nouveau token
    createSendToken(user, 200, res); // Réutilise la fonction utilitaire pour envoyer le token
});

/**
 * Récupère les informations de l'utilisateur actuellement connecté.
 * GET /api/users/me (ou /api/auth/me) - Route protégée.
 */
exports.getMe = asyncHandler(async (req, res, next) => {
  // req.user.id est injecté par le middleware d'authentification (protect).
  // Sélectionner les champs à retourner, exclure les champs sensibles si nécessaire.
  const user = await User.findById(req.user.id).populate('favorites'); // Exemple

  if (!user) {
    // Cela ne devrait pas arriver si le token JWT est valide et que l'utilisateur existe.
    logger.error(`Utilisateur non trouvé pour l'ID ${req.user.id} dans getMe, bien que le token soit valide.`);
    return next(new AppError('Utilisateur associé à ce token non trouvé.', 404));
  }

  res.status(200).json({
    success: true,
    data: {
      // Pas besoin de user.toObject() et delete password ici si createSendToken ne l'a pas fait,
      // car le user est directement sérialisé. Assurez-vous que les champs sensibles sont `select:false`
      // ou utilisez une transformation toJSON dans le modèle.
      user,
    },
  });
});

// Ajoutez d'autres fonctions si nécessaire (updatePassword, updateMe, deleteMe, etc.)
// en suivant une structure et des principes similaires.