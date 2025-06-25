// routes/favoriteRoutes.js
const express = require('express');
const favoriteController = require('../controllers/favoriteController');
const { protect } = require('../middlewares/authMiddleware');
// const { validateAddFavorite } = require('../middlewares/validationMiddleware'); // À créer si besoin, commenté pour éviter un crash

const router = express.Router();

// Toutes les routes pour les favoris nécessitent une authentification
router.use(protect);

router.route('/')
    .get(favoriteController.getMyFavorites); // Récupérer tous les favoris de l'utilisateur connecté

router.route('/:adId')
    .post(favoriteController.addFavorite) // Ajouter une annonce aux favoris
    .delete(favoriteController.removeFavorite); // Retirer une annonce des favoris

module.exports = router;
