// controllers/userController.js
const User = require('../models/userModel');
const Ad = require('../models/adModel'); // Pour compter les annonces, favoris etc.
const { AppError } = require('../middlewares/errorHandler');
const { logger } = require('../config/winston');
const fs = require('fs');
const path = require('path');
// const sendEmail = require('../utils/email'); // À utiliser quand prêt

/**
 * Utilitaire pour envelopper les fonctions de contrôleur asynchrones.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Filtre un objet pour ne garder que les champs autorisés.
 * @param {Object} obj - L'objet à filtrer.
 * @param  {...string} allowedFields - Les champs à conserver.
 * @returns {Object} L'objet filtré.
 */
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

// --- Fonctions de Contrôleur pour l'utilisateur authentifié (/api/users/me) ---

/**
 * Récupère le profil de l'utilisateur actuellement connecté.
 * GET /api/users/me
 */
// controllers/userController.js
exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new AppError('Utilisateur non trouvé. Une erreur est survenue.', 404));
  }

  const userProfileData = user.toObject();

  // --- MODIFICATION POUR CONSTRUIRE L'URL COMPLÈTE DE L'AVATAR ---
  if (
    userProfileData.avatarUrl &&
    !userProfileData.avatarUrl.startsWith('http') &&
    userProfileData.avatarUrl !== 'avatar-default.svg'
  ) {
    // userProfileData.avatarUrl depuis la BDD est, par exemple, 'avatars/monimage.jpg'
    // process.env.API_URL est, par exemple, 'http://localhost:5001'
    // Résultat: 'http://localhost:5001/avatars/monimage.jpg'
    userProfileData.avatarUrl = `${process.env.API_URL}/${userProfileData.avatarUrl}`;
  } else if (userProfileData.avatarUrl === 'avatar-default.svg') {
    // Pour l'image par défaut, il est généralement mieux que le client gère son propre chemin statique.
    // Cependant, si vous voulez absolument une URL complète servie par le backend :
    // userProfileData.avatarUrl = `${process.env.API_URL}/img/avatar-default.svg`; // Assurez-vous que ce chemin est correct et servi
  }
  // --- FIN DE LA MODIFICATION ---

  const adsPublishedCount = await Ad.countDocuments({ userId: user._id, status: 'online' });
  const favoritesCount = user.favorites ? user.favorites.length : 0;

  userProfileData.stats = {
      adsPublished: adsPublishedCount,
      avgRating: 'N/A', // À implémenter si vous avez un système d'avis
      favoritesCount: favoritesCount,
  };

  res.status(200).json({
    success: true,
    data: {
      user: userProfileData,
    },
  });
});

/**
 * Met à jour le profil de l'utilisateur actuellement connecté (nom, paramètres).
 * Le changement de mot de passe et d'email sont gérés par des routes spécifiques dans authController.
 * PUT /api/users/me (ou /api/users/profile comme dans le frontend)
 */
exports.updateMe = asyncHandler(async (req, res, next) => {
  // 1) Erreur si l'utilisateur POST des données de mot de passe
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'Cette route n\'est pas pour la mise à jour du mot de passe. Veuillez utiliser /api/auth/update-my-password.',
        400
      )
    );
  }
  // Idem pour l'email, qui nécessiterait une re-vérification
  if (req.body.email) {
      return next(
          new AppError(
              'Pour changer votre adresse e-mail, veuillez utiliser la section dédiée (si disponible) ou contacter le support. Un changement d\'e-mail nécessite une nouvelle vérification.',
              400
          )
      );
  }


  // 2) Filtrer les champs non autorisés à être mis à jour
  const filteredBody = filterObj(req.body, 'name', 'settings'); // Autoriser 'name' et l'objet 'settings'

  // 3) Mettre à jour le document utilisateur
  // findByIdAndUpdate ne lance pas les validateurs par défaut pour les champs non modifiés par $set.
  // Si on veut s'assurer que les validateurs du schéma User sont exécutés pour 'name',
  // on pourrait récupérer l'utilisateur, mettre à jour les champs, puis user.save().
  // Pour 'settings', comme c'est un objet, la validation de Mongoose s'appliquera sur les sous-champs si définis.
  
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true, // Retourner le document mis à jour
    runValidators: true, // Exécuter les validateurs Mongoose sur les champs mis à jour
  });

  if (!updatedUser) {
      return next(new AppError('Utilisateur non trouvé ou mise à jour impossible.', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Profil mis à jour avec succès.',
    data: {
      user: updatedUser,
    },
  });
});

/**
 * Met à jour l'avatar de l'utilisateur actuellement connecté.
 * POST /api/users/me/avatar (ou /api/users/avatar comme dans le frontend)
 */
exports.updateMyAvatar = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Aucun fichier d\'avatar n\'a été fourni.', 400));
  }

  // req.file est disponible grâce à Multer (uploadMiddleware)
  // Le chemin de l'avatar sera relatif au dossier 'uploads'
  // Ex: 'avatars/avatar-userId-timestamp.jpg'
  const avatarPath = req.file.path.replace(/\\/g, '/'); // Normaliser les slashes pour Windows
  const relativeAvatarPath = path.relative(path.join(__dirname, '..', 'uploads'), avatarPath);

  // Supprimer l'ancien avatar si existant (sauf si c'est l'avatar par défaut)
  const user = await User.findById(req.user.id);
  if (user.avatarUrl && user.avatarUrl !== 'avatar-default.svg' && !user.avatarUrl.startsWith('http')) {
    const oldAvatarPath = path.join(__dirname, '..', 'uploads', user.avatarUrl);
    fs.unlink(oldAvatarPath, err => {
      if (err && err.code !== 'ENOENT') { // ENOENT: file not found, on peut l'ignorer
          logger.error(`Échec de la suppression de l'ancien avatar ${oldAvatarPath}:`, err);
      } else if (!err) {
          logger.info(`Ancien avatar supprimé: ${oldAvatarPath}`);
      }
    });
  }
  
  // Mettre à jour l'URL de l'avatar dans la base de données
  // On stocke un chemin relatif qui sera servi par express.static('/uploads', ...)
  // Ou une URL complète si vous utilisez un service de stockage externe comme Cloudinary
  user.avatarUrl = relativeAvatarPath; // Ou req.file.path si Cloudinary retourne une URL complète
  await user.save({ validateBeforeSave: false }); // Pas besoin de revalider tout l'utilisateur

  res.status(200).json({
    success: true,
    message: 'Avatar mis à jour avec succès.',
    data: {
      avatarUrl: `${process.env.API_URL}/${relativeAvatarPath}`, // Construire l'URL complète pour le client
      // Ou si Cloudinary: avatarUrl: user.avatarUrl
      user: user // Optionnel: renvoyer l'utilisateur mis à jour
    }
  });
});

/**
 * Supprime l'avatar de l'utilisateur actuellement connecté.
 * DELETE /api/users/me/avatar (ou /api/users/avatar)
 */
exports.deleteMyAvatar = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new AppError('Utilisateur non trouvé.', 404));
  }

  if (user.avatarUrl && user.avatarUrl !== 'avatar-default.svg' && !user.avatarUrl.startsWith('http')) {
    const avatarPathToDelete = path.join(__dirname, '..', 'uploads', user.avatarUrl);
    fs.unlink(avatarPathToDelete, err => {
      if (err && err.code !== 'ENOENT') {
        logger.error(`Échec de la suppression du fichier avatar ${avatarPathToDelete}:`, err);
        // Ne pas bloquer si la suppression du fichier échoue, mais logger.
        // L'essentiel est de mettre à jour la référence en DB.
      } else if (!err) {
        logger.info(`Fichier avatar supprimé: ${avatarPathToDelete}`);
      }
    });
  }

  user.avatarUrl = 'avatar-default.svg'; // Réinitialiser à l'avatar par défaut
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: 'Avatar supprimé avec succès.',
    data: {
      avatarUrl: user.avatarUrl, // La nouvelle URL par défaut
      user: user
    }
  });
});


/**
 * Désactive le compte de l'utilisateur actuellement connecté.
 * DELETE /api/users/me (le frontend utilise /api/auth/delete-account, donc cette logique sera dans authController)
 * Cette fonction est un exemple si on voulait une désactivation séparée de la suppression.
 */
// exports.deactivateMe = asyncHandler(async (req, res, next) => {
//   await User.findByIdAndUpdate(req.user.id, { isActive: false });
//   logger.info(`Compte désactivé pour l'utilisateur: ${req.user.email}`);
//   // La déconnexion (suppression du token JWT) sera gérée par le client.
//   // Ou on peut invalider les tokens ici si on a un système de refresh tokens.
//   res.status(204).json({ // 204 No Content
//     success: true,
//     data: null,
//   });
// });


// --- Fonctions de Contrôleur pour les autres utilisateurs (publiques ou admin) ---

/**
 * Récupère le profil public d'un utilisateur par son ID.
 * GET /api/users/:id
 */
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    // Sélectionner uniquement les champs publics
    .select('name avatarUrl createdAt stats.avgRating stats.adsPublished'); // Exemple

  if (!user || !user.isActive) { // Ne pas montrer les utilisateurs désactivés
    return next(new AppError('Utilisateur non trouvé ou inactif.', 404));
  }
  
  // Calculer/Récupérer les statistiques si nécessaire (comme dans getMe)
  const adsPublishedCount = await Ad.countDocuments({ userId: user._id, status: 'online' });
  const publicProfileData = user.toObject();
  publicProfileData.stats = {
      adsPublished: adsPublishedCount,
      avgRating: 'N/A', // À implémenter
  };


  res.status(200).json({
    success: true,
    data: {
      user: publicProfileData,
    },
  });
});

/**
 * Bloque un utilisateur.
 * POST /api/users/:userIdToBlock/block
 */
exports.blockUser = asyncHandler(async (req, res, next) => {
    const currentUser = req.user; // L'utilisateur qui bloque
    const userIdToBlock = req.params.userIdToBlock;

    if (currentUser.id === userIdToBlock) {
        return next(new AppError('Vous ne pouvez pas vous bloquer vous-même.', 400));
    }

    const userToBlock = await User.findById(userIdToBlock);
    if (!userToBlock) {
        return next(new AppError('Utilisateur à bloquer non trouvé.', 404));
    }

    // Ajouter userIdToBlock à la liste blockedUsers de currentUser
    // Et potentiellement ajouter currentUser.id à la liste isBlockedBy de userToBlock
    if (!currentUser.blockedUsers.includes(userIdToBlock)) {
        currentUser.blockedUsers.push(userIdToBlock);
        await currentUser.save({ validateBeforeSave: false });
        logger.info(`Utilisateur ${currentUser.id} a bloqué ${userIdToBlock}`);
    }

    // Logique pour empêcher les interactions futures (ex: messages) sera gérée
    // par des vérifications dans les contrôleurs de messagerie, etc.

    res.status(200).json({
        success: true,
        message: `L'utilisateur ${userToBlock.name} a été bloqué.`,
        data: { blockedUserId: userIdToBlock }
    });
});

/**
 * Débloque un utilisateur.
 * POST /api/users/:userIdToUnblock/unblock
 */
exports.unblockUser = asyncHandler(async (req, res, next) => {
    const currentUser = req.user;
    const userIdToUnblock = req.params.userIdToUnblock;

    const userToUnblock = await User.findById(userIdToUnblock);
    if (!userToUnblock) {
        // On pourrait juste continuer sans erreur si l'utilisateur n'existe plus
        logger.info(`Tentative de déblocage d'un utilisateur non trouvé: ${userIdToUnblock}`);
    }

    // Retirer userIdToUnblock de la liste blockedUsers de currentUser
    const initialLength = currentUser.blockedUsers.length;
    currentUser.blockedUsers = currentUser.blockedUsers.filter(
        id => id.toString() !== userIdToUnblock.toString()
    );

    if (currentUser.blockedUsers.length < initialLength) {
        await currentUser.save({ validateBeforeSave: false });
        logger.info(`Utilisateur ${currentUser.id} a débloqué ${userIdToUnblock}`);
    }

    res.status(200).json({
        success: true,
        message: `L'utilisateur ${userToUnblock ? userToUnblock.name : userIdToUnblock} a été débloqué.`,
        data: { unblockedUserId: userIdToUnblock }
    });
});

/**
 * Désactive le compte de l'utilisateur actuellement connecté.
 * Le frontend appelle /api/auth/delete-account. Si cet endpoint doit mener ici,
 * il faudra ajuster les routes. Pour l'instant, on crée une route dédiée /api/users/me/deactivate.
 * DELETE /api/users/me/deactivate
 */
exports.deactivateMyAccount = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new AppError('Utilisateur non trouvé.', 404));
  }

  user.isActive = false;
  // Invalider les tokens de réinitialisation et de vérification pour un compte désactivé
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  // Optionnel: changer l'email pour libérer l'email actuel si nécessaire pour une réinscription future
  // user.email = `deactivated-${Date.now()}-${user.email}`; 
  // Attention: ceci rendrait la réactivation plus complexe si l'email original n'est pas stocké ailleurs.

  await user.save({ validateBeforeSave: false }); // Sauvegarder les changements

  // Le client doit gérer la déconnexion (suppression du token JWT local)
  logger.info(`Compte désactivé pour l'utilisateur: ${user.email} (ID: ${user.id})`);

  res.status(200).json({ // Ou 204 No Content si aucune donnée n'est retournée
    success: true,
    message: 'Votre compte a été désactivé. Vous serez déconnecté.',
    data: null
  });
});

// Fonctions réservées à l'administrateur (non demandées, mais pour structure future)
// exports.getAllUsers = asyncHandler(async (req, res, next) => { ... });
// exports.updateUserByAdmin = asyncHandler(async (req, res, next) => { ... }); // Modifier rôle, isActive, etc.
// exports.deleteUserByAdmin = asyncHandler(async (req, res, next) => { ... });
