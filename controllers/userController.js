// /controllers/userController.js
import User from '../models/User.js';
import AppError from '../utils/appError.js';
import { logger } from '../config/logger.js';
import fs from 'fs'; // Pour supprimer l'ancien avatar si nécessaire
import path from 'path';
import { fileURLToPath } from 'url';

// Configuration initiale pour __dirname avec ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Filtre un objet pour ne garder que les champs autorisés.
 * @param {object} obj - L'objet à filtrer.
 * @param  {...string} allowedFields - La liste des champs à conserver.
 * @returns {object} Un nouvel objet ne contenant que les champs autorisés.
 */
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach(el => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

/**
 * Contrôleur pour récupérer les informations du profil de l'utilisateur actuellement connecté.
 * Utilise req.user qui est défini par le middleware 'protect'.
 */
export const getMe = (req, res, next) => {
  // req.user est déjà l'utilisateur complet, on peut le retourner directement
  // ou sélectionner des champs spécifiques si nécessaire.
  // Le mot de passe n'est pas inclus car il est `select: false` dans le modèle.
  if (!req.user) {
    return next(new AppError('Utilisateur non trouvé. Une erreur s\'est produite.', 404));
  }
  logger.info(`Profil récupéré pour l'utilisateur ID: ${req.user._id}`);
  res.status(200).json({
    status: 'success',
    user: req.user
  });
};

/**
 * Contrôleur pour mettre à jour les informations du profil de l'utilisateur connecté.
 * Ne permet pas de mettre à jour le mot de passe ici (utiliser une route dédiée pour cela).
 */
export const updateMe = async (req, res, next) => {
  try {
    // 1) Créer une erreur si l'utilisateur POST des données de mot de passe
    if (req.body.password || req.body.passwordConfirm) {
      logger.warn(`Tentative de mise à jour du mot de passe via updateMe par l'utilisateur ID: ${req.user._id}`);
      return next(new AppError('Cette route n\'est pas pour les mises à jour de mot de passe. Veuillez utiliser /updateMyPassword.', 400));
    }

    // 2) Filtrer les noms de champs non désirés qui ne sont pas autorisés à être mis à jour
    // Par exemple, l'utilisateur ne peut pas changer son rôle via cette route.
    const filteredBody = filterObj(req.body, 'username', 'email'); // Autoriser uniquement la mise à jour du nom d'utilisateur et de l'email
    // Si vous avez d'autres champs modifiables (ex: bio, location textuelle), ajoutez-les ici.

    // 3) Mettre à jour le document utilisateur
    // findByIdAndUpdate ne lance pas les validateurs de schéma par défaut sur les champs non modifiés.
    // 'new: true' retourne le document mis à jour.
    // 'runValidators: true' force l'exécution des validateurs Mongoose sur les champs mis à jour.
    const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
      new: true,
      runValidators: true
    });

    if (!updatedUser) {
      return next(new AppError('Utilisateur non trouvé pour la mise à jour.', 404));
    }

    logger.info(`Profil mis à jour pour l'utilisateur ID: ${updatedUser._id}. Champs modifiés: ${Object.keys(filteredBody).join(', ')}`);
    res.status(200).json({
      status: 'success',
      user: updatedUser
    });
  } catch (error) {
     // Gérer les erreurs de validation Mongoose (ex: email dupliqué si l'utilisateur essaie de prendre un email existant)
    if (error.code === 11000 || error.name === 'MongoServerError' && error.message.includes('duplicate key')) {
        const field = Object.keys(error.keyValue)[0];
        return next(new AppError(`La valeur pour le champ '${field}' (${error.keyValue[field]}) est déjà utilisée par un autre compte.`, 400));
    }
    if (error.name === 'ValidationError') {
        return next(new AppError(error.message, 400));
    }
    logger.error(`Erreur lors de la mise à jour du profil pour l'utilisateur ID: ${req.user?.id}: ${error.message}`);
    next(error);
  }
};

/**
 * Contrôleur pour mettre à jour l'avatar de l'utilisateur.
 * Le fichier image est géré par le middleware Multer (uploadAvatarMiddleware).
 */
export const updateUserAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      logger.warn(`Tentative de mise à jour d'avatar sans fichier pour l'utilisateur ID: ${req.user._id}`);
      return next(new AppError('Aucun fichier d\'avatar fourni.', 400));
    }

    // Le fichier a été uploadé par Multer. req.file contient les informations du fichier.
    // Le chemin du fichier est req.file.filename (si diskStorage) ou req.file.path (si Cloudinary, etc.)
    // Construire l'URL d'accès à l'avatar.
    // Assurez-vous que UPLOADS_FOLDER est bien le nom du dossier servi statiquement.
    const avatarPath = `${process.env.UPLOADS_FOLDER || 'uploads'}/${req.file.filename}`;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      // Supprimer le fichier uploadé si l'utilisateur n'est pas trouvé (peu probable ici car 'protect' est utilisé)
      if (req.file && req.file.path) fs.unlink(req.file.path, err => { if(err) logger.error("Erreur suppression avatar orphelin:", err)});
      return next(new AppError('Utilisateur non trouvé.', 404));
    }

    // Optionnel: Supprimer l'ancien avatar du système de fichiers s'il existe et n'est pas un placeholder
    if (user.avatarUrl && user.avatarUrl !== '' && !user.avatarUrl.startsWith('http')) { // Ne pas supprimer les URLs externes
      const oldAvatarPath = path.join(path.dirname(__dirname), '..', user.avatarUrl); // Remonter d'un niveau pour sortir de /controllers
      fs.unlink(oldAvatarPath, err => {
        if (err && err.code !== 'ENOENT') { // ENOENT = fichier non trouvé, ce qui est ok
            logger.warn(`Impossible de supprimer l'ancien avatar: ${oldAvatarPath}`, err);
        } else if (!err) {
            logger.info(`Ancien avatar supprimé: ${oldAvatarPath}`);
        }
      });
    }

    user.avatarUrl = avatarPath; // Stocker le chemin relatif ou l'URL complète
    await user.save({ validateBeforeSave: false }); // Sauvegarder sans re-valider les autres champs

    logger.info(`Avatar mis à jour pour l'utilisateur ID: ${user._id}. Nouveau chemin: ${avatarPath}`);
    res.status(200).json({
      status: 'success',
      message: 'Avatar mis à jour avec succès.',
      user: { // Renvoyer uniquement les informations nécessaires
        _id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl 
      }
    });
  } catch (error) {
    // Si une erreur se produit après l'upload mais avant la sauvegarde en DB, supprimer le fichier uploadé.
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, err => {
        if(err) logger.error("Erreur lors de la suppression de l'avatar après échec de la mise à jour DB:", err);
      });
    }
    logger.error(`Erreur lors de la mise à jour de l'avatar pour l'utilisateur ID: ${req.user?.id}: ${error.message}`);
    next(error);
  }
};


// Optionnel: Fonction pour que l'utilisateur supprime son propre compte
// export const deleteMe = async (req, res, next) => {
//   try {
//     await User.findByIdAndUpdate(req.user.id, { active: false }); // Marquer comme inactif au lieu de supprimer
//     logger.info(`Compte désactivé pour l'utilisateur ID: ${req.user.id}`);
//     res.status(204).json({ // 204 No Content
//       status: 'success',
//       data: null
//     });
//   } catch (error) {
//     logger.error(`Erreur lors de la désactivation du compte pour l'utilisateur ID: ${req.user.id}: ${error.message}`);
//     next(error);
//   }
// };
