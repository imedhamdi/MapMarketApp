// routes/favoriteRoutes.js
const express = require('express');
const favoriteController = require('../controllers/favoriteController');
const { protect } = require('../middlewares/authMiddleware');
const { validateAddFavorite } = require('../middlewares/validationMiddleware'); // À créer si besoin

const router = express.Router();

// Toutes les routes pour les favoris nécessitent une authentification
router.use(protect);

router.route('/')
    .get(favoriteController.getMyFavorites) // Récupérer tous les favoris de l'utilisateur connecté
    .post(validateAddFavorite, favoriteController.addFavorite); // Ajouter une annonce aux favoris

router.route('/:adId')
    .delete(favoriteController.removeFavorite); // Retirer une annonce des favoris

module.exports = router;
