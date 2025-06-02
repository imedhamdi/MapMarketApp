// controllers/authController.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { AppError } = require('../middlewares/errorHandler');
const { logger } = require('../config/winston');
// const sendEmail = require('../utils/email'); // À créer pour l'envoi d'emails

/**
 * Utilitaire pour envelopper les fonctions de contrôleur asynchrones
 * et passer les erreurs au middleware global de gestion des erreurs.
 * @param {Function} fn - La fonction de contrôleur asynchrone.
 * @returns {Function} Une nouvelle fonction qui gère les erreurs.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Génère un token JWT signé.
 * @param {string} id - L'ID de l'utilisateur.
 * @returns {string} Le token JWT.
 */
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

/**
 * Crée et envoie un token JWT dans la réponse.
 * @param {Object} user - L'objet utilisateur.
 * @param {number} statusCode - Le code de statut HTTP.
 * @param {Object} req - L'objet requête Express.
 * @param {Object} res - L'objet réponse Express.
 */
const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id);

  // Options pour le cookie (si vous choisissez de stocker le token en cookie)
  // const cookieOptions = {
  //   expires: new Date(
  //     Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
  //   ),
  //   httpOnly: true, // Le cookie ne peut pas être accédé ou modifié par le navigateur
  //   secure: req.secure || req.headers['x-forwarded-proto'] === 'https', // Uniquement en HTTPS
  // };
  // if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;
  // res.cookie('jwt', token, cookieOptions);

  // Retirer le mot de passe de la sortie
  user.password = undefined;

  res.status(statusCode).json({
    success: true,
    message: statusCode === 201 ? 'Inscription réussie.' : 'Connexion réussie.',
    token,
    data: {
      user,
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

  if (!name || !email || !password || !passwordConfirm) {
    return next(new AppError('Veuillez fournir nom, email, mot de passe et confirmation.', 400));
  }

  const newUser = await User.create({
    name,
    email,
    password,
    passwordConfirm,
  });

  // Générer le token de vérification d'email
  const verificationToken = newUser.createEmailVerificationToken();
  await newUser.save({ validateBeforeSave: false }); // Sauvegarder le token et l'expiration sans re-valider le reste

  // Envoyer l'email de vérification (URL à construire côté client ou ici)
  // Exemple d'URL: `${req.protocol}://${req.get('host')}/api/auth/validate-email/${verificationToken}`
  // Ou mieux, une URL frontend: `${process.env.APP_URL}/verify-email?token=${verificationToken}`
  const verificationURL = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;

  try {
    // await sendEmail({
    //   to: newUser.email,
    //   subject: 'Validez votre adresse e-mail pour MapMarket',
    //   html: `<p>Bienvenue sur MapMarket ! Veuillez cliquer sur ce lien pour valider votre e-mail : <a href="${verificationURL}">${verificationURL}</a>. Ce lien expirera dans 24 heures.</p>`,
    //   text: `Bienvenue sur MapMarket ! Veuillez copier et coller ce lien dans votre navigateur pour valider votre e-mail : ${verificationURL}. Ce lien expirera dans 24 heures.`
    // });
    logger.info(`Email de validation (simulé) envoyé à ${newUser.email}. URL: ${verificationURL}`);

    res.status(201).json({
      success: true,
      message: 'Inscription réussie ! Un e-mail de validation a été envoyé à votre adresse. Veuillez vérifier votre boîte de réception.',
      data: {
        // Ne pas envoyer l'utilisateur complet ici, attendre la validation
        userId: newUser._id, // Envoyer l'ID peut être utile pour le frontend
      }
    });
  } catch (err) {
    logger.error('Erreur lors de l\'envoi de l\'email de validation:', err);
    // Important: Si l'email échoue, l'utilisateur est quand même créé.
    // Il faut une logique pour gérer cela (ex: permettre le renvoi, ou supprimer l'utilisateur si pas validé après X temps)
    newUser.emailVerificationToken = undefined;
    newUser.emailVerificationExpires = undefined;
    await newUser.save({ validateBeforeSave: false }); // Nettoyer les tokens si l'email échoue

    return next(
      new AppError('Erreur lors de l\'envoi de l\'e-mail de validation. Veuillez réessayer de vous inscrire ou contacter le support.', 500)
    );
  }
});

/**
 * Connexion d'un utilisateur.
 * POST /api/auth/login
 */
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Vérifier si email et mot de passe existent
  if (!email || !password) {
    return next(new AppError('Veuillez fournir un e-mail et un mot de passe.', 400));
  }

  // 2) Vérifier si l'utilisateur existe ET si le mot de passe est correct
  const user = await User.findOne({ email }).select('+password +isActive'); // Inclure le mdp et isActive pour vérification

  if (!user || !(await user.correctPassword(password, user.password))) {
    logger.warn(`Tentative de connexion échouée pour l'email: ${email} (identifiants incorrects)`);
    return next(new AppError('E-mail ou mot de passe incorrect.', 401)); // Message générique
  }

  // 3) Vérifier si le compte est actif
  if (!user.isActive) {
    logger.warn(`Tentative de connexion pour un compte désactivé: ${email}`);
    return next(new AppError('Votre compte a été désactivé. Veuillez contacter le support.', 403));
  }

  // 4) Vérifier si l'email est vérifié (optionnel, peut être une simple alerte côté client)
  if (!user.emailVerified) {
    logger.info(`Connexion réussie pour ${email}, mais l'email n'est pas encore vérifié.`);
    // On pourrait envoyer un statut spécial ou un message pour que le frontend le gère.
    // Pour l'instant, on autorise la connexion mais le frontend devrait afficher un avertissement.
    // Ou bloquer ici :
    // return next(new AppError('Veuillez d\'abord vérifier votre adresse e-mail. Un nouveau lien de validation peut être demandé.', 403));
  }

  // 5) Si tout est OK, envoyer le token au client
  createSendToken(user, 200, req, res);

  // Mettre à jour les informations de dernière connexion (sans attendre la fin pour ne pas bloquer la réponse)
  user.lastLoginAt = Date.now();
  user.lastLoginIp = req.ip || req.socket.remoteAddress;
  // user.loginHistory.push({ timestamp: Date.now(), ip: req.ip, success: true }); // Si historique détaillé
  user.save({ validateBeforeSave: false }).catch(err => logger.error('Erreur sauvegarde lastLogin:', err));
});

/**
 * Déconnexion de l'utilisateur.
 * POST /api/auth/logout
 */
exports.logout = (req, res) => {
  // Pour une authentification JWT stateless, la déconnexion est principalement gérée côté client
  // en supprimant le token.
  // Si vous utilisez des cookies pour le JWT:
  // res.cookie('jwt', 'loggedout', {
  //   expires: new Date(Date.now() + 10 * 1000), // expire dans 10s
  //   httpOnly: true,
  // });
  // Vous pouvez ajouter ici une logique serveur si nécessaire (ex: logger l'événement).
  logger.info(`Utilisateur ${req.user ? req.user.id : 'inconnu'} déconnecté.`);
  res.status(200).json({ success: true, message: 'Déconnexion réussie.' });
};


/**
 * Gère la demande de réinitialisation de mot de passe.
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  // 1) Récupérer l'utilisateur basé sur l'email POSTé
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    logger.warn(`Demande de réinitialisation de mot de passe pour un email non trouvé: ${req.body.email}`);
    // Ne pas révéler si l'utilisateur existe ou non pour des raisons de sécurité
    return next(
      new AppError('Si cette adresse e-mail est dans notre base de données, vous recevrez un lien de réinitialisation.', 200)
    );
  }

  // 2) Générer le token de réinitialisation aléatoire
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false }); // Sauvegarder le token hashé et l'expiration

  // 3) Envoyer le token à l'email de l'utilisateur
  const resetURL = `${process.env.APP_URL}/reset-password?token=${resetToken}`; // URL frontend
  try {
    // await sendEmail({
    //   to: user.email,
    //   subject: 'Votre lien de réinitialisation de mot de passe MapMarket (valide 10 min)',
    //   html: `<p>Vous avez demandé une réinitialisation de mot de passe. Cliquez sur ce lien pour continuer : <a href="${resetURL}">${resetURL}</a>. Si vous n'avez pas fait cette demande, veuillez ignorer cet e-mail.</p>`,
    //   text: `Vous avez demandé une réinitialisation de mot de passe. Copiez et collez ce lien dans votre navigateur : ${resetURL}. Si vous n'avez pas fait cette demande, veuillez ignorer cet e-mail.`
    // });
    logger.info(`Email de réinitialisation de mot de passe (simulé) envoyé à ${user.email}. URL: ${resetURL}`);

    res.status(200).json({
      success: true,
      message: 'Un lien de réinitialisation de mot de passe a été envoyé à votre adresse e-mail (s\'il existe un compte associé).',
    });
  } catch (err) {
    logger.error('Erreur lors de l\'envoi de l\'email de réinitialisation:', err);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError('Erreur lors de l\'envoi de l\'e-mail. Veuillez réessayer plus tard.', 500));
  }
});

/**
 * Réinitialise le mot de passe de l'utilisateur.
 * PATCH /api/auth/reset-password/:token
 */
exports.resetPassword = asyncHandler(async (req, res, next) => {
  // 1) Récupérer l'utilisateur basé sur le token (le token dans l'URL est celui non hashé)
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }, // Vérifier que le token n'a pas expiré
  }).select('+password'); // On a besoin de select('+password') car il est false par défaut

  // 2) Si le token n'est pas valide ou a expiré, retourner une erreur
  if (!user) {
    return next(new AppError('Le token de réinitialisation est invalide ou a expiré.', 400));
  }

  // 3) Définir le nouveau mot de passe (le hook pre-save s'occupera du hachage)
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined; // Nettoyer le token
  user.passwordResetExpires = undefined; // Nettoyer l'expiration
  // passwordChangedAt sera mis à jour par le hook pre-save

  await user.save(); // Déclenche les validateurs, y compris passwordConfirm

  // 4) Optionnel: connecter l'utilisateur et envoyer un nouveau JWT
  createSendToken(user, 200, req, res);
  logger.info(`Mot de passe réinitialisé avec succès pour l'utilisateur: ${user.email}`);
});


/**
 * Valide l'adresse e-mail de l'utilisateur.
 * GET /api/auth/validate-email/:token
 */
exports.validateEmail = asyncHandler(async (req, res, next) => {
    const hashedToken = crypto
        .createHash('sha256')
        .update(req.params.token)
        .digest('hex');

    const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
        // Le frontend devrait gérer l'affichage d'une page d'erreur
        return next(new AppError('Token de validation invalide ou expiré. Veuillez demander un nouveau lien.', 400));
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    logger.info(`Email validé pour l'utilisateur: ${user.email}`);
    // Optionnel: connecter l'utilisateur directement ici
    // createSendToken(user, 200, req, res);
    // Ou rediriger vers une page de succès sur le frontend
    res.status(200).json({
        success: true,
        message: 'Votre adresse e-mail a été validée avec succès ! Vous pouvez maintenant vous connecter.',
    });
});


/**
 * Renvoie un nouvel email de validation.
 * POST /api/auth/resend-validation-email
 */
exports.resendValidationEmail = asyncHandler(async (req, res, next) => {
    const user = req.user; // Utilisateur attaché par le middleware `protect`

    if (user.emailVerified) {
        return next(new AppError('Votre e-mail est déjà vérifié.', 400));
    }

    const verificationToken = user.createEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    const verificationURL = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;
    try {
        // await sendEmail({ /* ... */ });
        logger.info(`Nouvel email de validation (simulé) envoyé à ${user.email}. URL: ${verificationURL}`);
        res.status(200).json({
            success: true,
            message: 'Un nouveau lien de validation a été envoyé à votre adresse e-mail.',
        });
    } catch (err) {
        logger.error('Erreur lors du renvoi de l\'email de validation:', err);
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save({ validateBeforeSave: false });
        return next(new AppError('Erreur lors de l\'envoi de l\'e-mail. Veuillez réessayer.', 500));
    }
});


/**
 * Récupère les informations de l'utilisateur actuellement connecté.
 * GET /api/auth/me (protégé)
 */
exports.getMe = asyncHandler(async (req, res, next) => {
    // req.user est déjà défini par le middleware `protect`
    // On peut vouloir sélectionner des champs spécifiques ou populer des références
    const user = await User.findById(req.user.id).populate('favorites'); // Exemple de population des favoris

    if (!user) {
        return next(new AppError('Utilisateur non trouvé.', 404));
    }

    res.status(200).json({
        success: true,
        data: {
            user,
        },
    });
});
