// routes/authRoutes.js
const express = require('express');
const authController = require('../controllers/authController'); // Sera créé ensuite
const { protect, isEmailVerified } = require('../middlewares/authMiddleware');
const { authRateLimiter } = require('../config/rateLimit'); // Limiteur de taux pour l'auth
const { validateSignup, validateLogin, validateForgotPassword, validateResetPassword } = require('../middlewares/validationMiddleware'); // Sera créé ensuite

const router = express.Router();

// Appliquer le rate limiter aux routes d'authentification sensibles
router.post('/signup', authRateLimiter, validateSignup, authController.signup);
router.post('/login', authRateLimiter, validateLogin, authController.login);
router.post('/forgot-password', authRateLimiter, validateForgotPassword, authController.forgotPassword);
router.patch('/reset-password/:token', authRateLimiter, validateResetPassword, authController.resetPassword); // Utiliser PATCH car on modifie une ressource (le mot de passe)

router.get('/validate-email/:token', authController.validateEmail);
router.post('/resend-validation-email', protect, authController.resendValidationEmail); // L'utilisateur doit être connecté pour renvoyer son propre email de validation
// Elle définit la route que votre frontend essaie d'appeler
router.patch('/update-password', protect, authController.updatePassword);

// Route pour vérifier le statut de connexion (optionnel, utile pour le frontend)
router.get('/me', protect, authController.getMe); // Réutilise le contrôleur pour obtenir le profil

// Déconnexion (si gérée côté serveur, par exemple pour invalider des refresh tokens ou logger)
// Pour une déconnexion basée sur JWT simple, le client supprime juste le token.
// Mais on peut avoir un endpoint pour des actions serveur.
router.post('/logout', protect, authController.logout);


// Optionnel: Rafraîchissement de token (si implémenté)
// router.post('/refresh-token', authController.refreshToken);

module.exports = router;
