// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const { check } = require('express-validator');
const { validate } = require('../middleware/validation');

// Validation rules
const registerValidation = [
  check('name', 'Le nom est requis').not().isEmpty().trim().escape(),
  check('email', 'Veuillez fournir un email valide').isEmail().normalizeEmail(),
  check('password', 'Le mot de passe doit contenir au moins 6 caractères').isLength({ min: 6 })
];

const loginValidation = [
  check('email', 'Veuillez fournir un email valide').isEmail().normalizeEmail(),
  check('password', 'Le mot de passe est requis').exists()
];

const updateProfileValidation = [
  check('name', 'Le nom est requis').optional().not().isEmpty().trim().escape(),
  check('email', 'Veuillez fournir un email valide').optional().isEmail().normalizeEmail(),
  check('newPassword', 'Le nouveau mot de passe doit contenir au moins 6 caractères')
    .optional()
    .isLength({ min: 6 }),
  check('currentPassword', 'Le mot de passe actuel est requis pour les modifications')
    .if(check('newPassword').exists())
    .not()
    .isEmpty()
];

const forgotPasswordValidation = [
  check('email', 'Veuillez fournir un email valide').isEmail().normalizeEmail()
];

const resetPasswordValidation = [
  check('newPassword', 'Le nouveau mot de passe doit contenir au moins 6 caractères').isLength({ min: 6 })
];

// Authentification
router.post('/register', registerValidation,validate, userController.register);
router.post('/login', loginValidation, validate,userController.login);

// Profil utilisateur
router.get('/me', auth, userController.getProfile);
router.put('/me', auth, updateProfileValidation, userController.updateProfile);
router.delete('/me', auth, userController.deleteAccount);

// Favoris
router.get('/favorites', auth, userController.getFavorites);
router.get('/favorites/:itemId', auth, userController.checkFavorite);
router.patch('/favorites/:itemId', auth, userController.manageFavorites);

// Réinitialisation du mot de passe
router.post('/forgot-password', forgotPasswordValidation,validate, userController.forgotPassword);
router.get('/reset-password/:token', userController.validateResetToken);
router.post('/reset-password/:token', resetPasswordValidation, validate, userController.resetPassword);
module.exports = router;