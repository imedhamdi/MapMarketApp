// /routes/userRoutes.js
import express from 'express';
import {
  getMe,
  updateMe,
  updateUserAvatar,
  // deleteMe // Optionnel, si vous voulez permettre la suppression de compte
} from '../controllers/userController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { uploadUserAvatar as uploadAvatarMiddleware } from '../middlewares/uploadMiddleware.js'; // Middleware pour l'upload d'avatar
// Importer les schémas de validation si nécessaire pour updateMe
// import { validateRequest, updateUserSchema } from '../middlewares/validationMiddleware.js';

const router = express.Router();

// Toutes les routes ci-dessous nécessitent que l'utilisateur soit authentifié.
// Nous appliquons donc le middleware 'protect' à toutes.
router.use(protect);

/**
 * @route GET /api/user/me
 * @description Récupérer les informations du profil de l'utilisateur actuellement connecté.
 * @access Privé (utilisateur connecté)
 */
router.get('/me', getMe);

/**
 * @route PUT /api/user/me
 * @description Mettre à jour les informations du profil de l'utilisateur actuellement connecté (sauf mot de passe).
 * @access Privé (utilisateur connecté)
 */
// router.put('/me', validateRequest(updateUserSchema), updateMe); // Activer la validation si un schéma est créé
router.put('/me', updateMe);


/**
 * @route PUT /api/user/avatar
 * @description Mettre à jour l'avatar de l'utilisateur actuellement connecté.
 * Attend un champ 'avatar' dans la requête FormData.
 * @access Privé (utilisateur connecté)
 */
router.put('/avatar', uploadAvatarMiddleware, updateUserAvatar);


// Si vous voulez permettre aux utilisateurs de mettre à jour leur mot de passe via une route dédiée (après connexion)
// import { updatePassword } from '../controllers/authController.js'; // La logique est souvent dans authController
// router.patch('/updateMyPassword', updatePassword);


// Optionnel: Route pour que l'utilisateur supprime son propre compte
// router.delete('/deleteMe', deleteMe);

export default router;
