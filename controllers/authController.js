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

  // Générer le token de vérification d'e-mail
  const verificationToken = newUser.createEmailVerificationToken();
  // Sauvegarder l'utilisateur avec le token de vérification généré (sans re-valider tout)
  // Il est important que createEmailVerificationToken ne fasse pas de save lui-même pour éviter les doubles saves.
  await newUser.save({ validateBeforeSave: false });

  // Construction de l'URL de vérification pour l'e-mail
  // Idéalement, l'URL de base du frontend est dans les variables d'environnement.
  const verificationURL = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;

  try {
    // TODO: Implémenter la logique d'envoi d'e-mail (décommenter et adapter sendEmail)
    /*
    await sendEmail({
      to: newUser.email,
      subject: 'Validez votre adresse e-mail pour [Nom de votre Application]',
      template: 'emailVerification', // Utiliser un template d'e-mail
      context: { // Données à passer au template
        name: newUser.name,
        verificationURL,
      },
    });
    */
    logger.info(`E-mail de validation (simulation) envoyé à ${newUser.email}. URL: ${verificationURL}`);

    // Réponse au client après succès de l'inscription et envoi (simulé) de l'e-mail.
    res.status(201).json({
      success: true,
      message: `Inscription réussie ! Un e-mail de validation a été envoyé à ${newUser.email}. Veuillez vérifier votre boîte de réception.`,
      // Il est généralement préférable de ne pas connecter l'utilisateur automatiquement
      // avant la validation de l'e-mail, mais d'envoyer un ID peut être utile.
      data: {
        userId: newUser._id,
      }
    });

  } catch (emailError) {
    logger.error(`Échec de l'envoi de l'e-mail de validation à ${newUser.email}: ${emailError.message}`, { error: emailError, stack: emailError.stack });

    // Si l'envoi d'e-mail échoue, l'utilisateur est déjà créé.
    // Il est crucial de ne pas annuler la création de l'utilisateur, mais de permettre une nouvelle tentative d'envoi.
    // Nettoyer les tokens de vérification n'est pas forcément la meilleure approche ici,
    // car l'utilisateur pourrait vouloir demander un renvoi.
    // Une meilleure stratégie serait de logguer l'erreur et d'informer l'utilisateur
    // qu'il peut demander un renvoi de l'e-mail de validation depuis son profil ou une page dédiée.

    // Pour l'instant, on renvoie une erreur mais l'utilisateur reste créé.
    return next(
      new AppError('Inscription réussie, mais l\'envoi de l\'e-mail de validation a échoué. Veuillez essayer de vous connecter et de demander un nouveau lien de validation.', 502) // 502 Bad Gateway (ou un code personnalisé)
    );
  }
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

  const user = await User.findOne({ email }).select('+password +isActive +emailVerified');

  if (!user || !(await user.correctPassword(password, user.password))) {
    logger.warn(`Tentative de connexion échouée pour l'email: ${email} (identifiants incorrects ou utilisateur inexistant)`);
    return next(new AppError('Adresse e-mail ou mot de passe incorrect.', 401));
  }

  if (!user.isActive) {
    logger.warn(`Tentative de connexion pour un compte désactivé: ${user._id} - ${email}`);
    return next(new AppError('Votre compte a été désactivé. Veuillez contacter le support.', 403));
  }

  // Gestion de la vérification d'e-mail
  if (!user.emailVerified && process.env.REQUIRE_EMAIL_VERIFICATION_FOR_LOGIN === 'true') {
    logger.info(`Connexion bloquée pour ${user._id} - ${email}: e-mail non vérifié.`);
    return next(new AppError('Veuillez d\'abord vérifier votre adresse e-mail. Vous pouvez demander un nouveau lien de validation.', 403));
  } else if (!user.emailVerified) {
    logger.info(`Connexion réussie pour ${user._id} - ${email}, mais l'e-mail n'est pas encore vérifié.`);
    // Le client peut être informé via un champ spécial dans la réponse utilisateur pour afficher un bandeau.
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
exports.validateEmail = asyncHandler(async (req, res, next) => {
  const { token } = req.params; // Ou req.body.token si c'est un POST

  if (!token) {
      return next(new AppError('Token de validation manquant.', 400));
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError('Token de validation invalide, expiré, ou déjà utilisé. Veuillez demander un nouveau lien si nécessaire.', 400));
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined; // Invalider le token après utilisation.
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  logger.info(`E-mail validé avec succès pour l'utilisateur: ${user._id}`);

  // Optionnel : Connecter l'utilisateur directement ou rediriger.
  // createSendToken(user, 200, res);
  // Ou rediriger vers une page de succès/connexion du frontend :
  // res.redirect(`${process.env.APP_URL}/login?emailVerified=true`);

  res.status(200).json({
    success: true,
    message: 'Votre adresse e-mail a été validée avec succès ! Vous pouvez maintenant vous connecter.',
  });
});

/**
 * Renvoie un nouvel e-mail de validation.
 * Doit être une route protégée, accessible uniquement par un utilisateur connecté non vérifié.
 * POST /api/auth/resend-validation-email
 */
exports.resendValidationEmail = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id); // req.user est défini par un middleware d'authentification (protect)

  if (!user) { // Sécurité : ne devrait pas arriver si protect est bien en place.
      return next(new AppError('Utilisateur non trouvé.', 404));
  }

  if (user.emailVerified) {
    return next(new AppError('Votre adresse e-mail est déjà vérifiée.', 400));
  }

  // Vérifier si un token a été envoyé récemment pour éviter le spam
  // Exemple: ne pas autoriser plus d'un renvoi toutes les 5 minutes.
  // if (user.emailVerificationExpires && user.emailVerificationExpires > Date.now() - (4 * 60 * 1000)) { // Moins de 4min avant expiration du précédent
  //    return next(new AppError('Un e-mail de validation a déjà été envoyé récemment. Veuillez vérifier votre boîte de réception ou attendre quelques minutes.', 429));
  // }


  const verificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  const verificationURL = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;
  try {
    // TODO: Implémenter la logique d'envoi d'e-mail
    /*
    await sendEmail({
      to: user.email,
      subject: 'Validez à nouveau votre adresse e-mail pour [Nom de votre Application]',
      template: 'emailVerification',
      context: { name: user.name, verificationURL },
    });
    */
    logger.info(`Nouvel e-mail de validation (simulation) envoyé à ${user.email}. URL: ${verificationURL}`);
    res.status(200).json({
      success: true,
      message: 'Un nouveau lien de validation a été envoyé à votre adresse e-mail.',
    });
  } catch (emailError) {
    logger.error(`Échec du renvoi de l'e-mail de validation à ${user.email}: ${emailError.message}`, { error: emailError, stack: emailError.stack });
    // Ne pas invalider le token ici, l'erreur est dans l'envoi.
    return next(new AppError('Erreur lors du renvoi de l\'e-mail de validation. Veuillez réessayer plus tard.', 502));
  }
});


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