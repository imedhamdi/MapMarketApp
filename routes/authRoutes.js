// /routes/authRoutes.js
import express from 'express';
import {
  signup,
  login,
  logout, // Sera ajouté au authController
  forgotPassword,
  resetPassword,
  verifyEmail,
  // protect, // Importé depuis authMiddleware si besoin de protéger une route spécifique dans auth (ex: refreshToken)
  // updatePassword // Sera ajouté au authController, généralement dans userRoutes
} from '../controllers/authController.js';
import { validateRequest, signupSchema, loginSchema } from '../middlewares/validationMiddleware.js'; // Importer les schémas

const router = express.Router();

/**
 * @route POST /api/auth/signup
 * @description Inscription d'un nouvel utilisateur.
 * @access Public
 */
router.post('/signup', validateRequest(signupSchema), signup);

/**
 * @route POST /api/auth/login
 * @description Connexion d'un utilisateur existant.
 * @access Public
 */
router.post('/login', validateRequest(loginSchema), login);

/**
 * @route GET /api/auth/logout (ou POST)
 * @description Déconnexion de l'utilisateur (invalide le cookie JWT).
 * @access Public (ou Protégé si on veut s'assurer qu'un utilisateur est connecté pour se déconnecter)
 */
router.get('/logout', logout); // GET est plus simple pour la déconnexion via lien/bouton, POST est plus sémantique

/**
 * @route POST /api/auth/forgot-password
 * @description Demande de réinitialisation de mot de passe (envoi d'email).
 * @access Public
 */
router.post('/forgot-password', forgotPassword); // Ajouter un schéma de validation pour l'email

/**
 * @route PATCH /api/auth/reset-password/:token (ou POST)
 * @description Réinitialisation du mot de passe avec un token.
 * @access Public
 */
router.patch('/reset-password/:token', resetPassword); // Ajouter un schéma de validation pour token et nouveau mot de passe

/**
 * @route GET /api/auth/verify-email
 * @description Vérification de l'adresse e-mail avec un token.
 * @access Public
 */
router.get('/verify-email', verifyEmail); // Le token sera dans req.query.token

// Exemple de route protégée si nécessaire (ex: pour rafraîchir un token)
// import { protect } from '../middlewares/authMiddleware.js';
// router.post('/refresh-token', protect, refreshTokenController);

export default router;
