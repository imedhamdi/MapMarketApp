// routes/userRoutes.js

const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middlewares/authMiddleware');
const { handleMulterUpload, uploadAvatar } = require('../middlewares/uploadMiddleware');
// const { validateUpdateProfile } = require('../middlewares/validationMiddleware'); // À ajouter si besoin

const router = express.Router();

// Toutes les routes ci-dessous nécessitent que l'utilisateur soit authentifié
router.use(protect);

/**
 * Récupérer le profil complet de l'utilisateur connecté
 * GET /api/users/me
 */
router.get('/me', userController.getMe);

/**
 * Mettre à jour le profil de l'utilisateur connecté (nom, settings)
 * PUT /api/users/profile
 */
router.put('/profile', userController.updateMe); // aligné avec controller

/**
 * Mettre à jour ou supprimer l'avatar de l'utilisateur connecté
 * POST /api/users/avatar
 * DELETE /api/users/avatar
 */
router.route('/avatar')
    .post(handleMulterUpload(uploadAvatar), userController.updateMyAvatar)
    .delete(userController.deleteMyAvatar);

/**
 * Désactiver son propre compte (désactivation douce, pas suppression définitive)
 * DELETE /api/users/me/deactivate
 */
router.delete('/me/deactivate', userController.deactivateMyAccount);

/**
 * Bloquer un utilisateur
 * POST /api/users/:userIdToBlock/block
 */
router.post('/:userIdToBlock/block', userController.blockUser);

/**
 * Débloquer un utilisateur
 * POST /api/users/:userIdToUnblock/unblock
 */
router.post('/:userIdToUnblock/unblock', userController.unblockUser);

/**
 * Obtenir le profil public d'un autre utilisateur
 * GET /api/users/:id
 * (Cette route doit être après /me pour éviter conflit avec 'me')
 */
router.get('/:id', userController.getUser);

module.exports = router;
