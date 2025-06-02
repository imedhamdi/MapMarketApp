// routes/adRoutes.js
const express = require('express');
const adController = require('../controllers/adController'); // Sera créé ensuite
const { protect, checkOwnership } = require('../middlewares/authMiddleware');
const { handleMulterUpload, uploadAdImages } = require('../middlewares/uploadMiddleware');
const { validateCreateAd, validateUpdateAd } = require('../middlewares/validationMiddleware'); // À affiner
const Ad = require('../models/adModel'); // Nécessaire pour checkOwnership

const router = express.Router();

// Récupérer toutes les annonces (avec filtres, pagination, tri) - Route publique
router.get('/', adController.getAllAds);

// Récupérer les annonces de l'utilisateur connecté - Route protégée
router.get('/my', protect, adController.getMyAds);

// Créer une nouvelle annonce - Route protégée, avec upload d'images
router.post(
    '/',
    protect,
    handleMulterUpload(uploadAdImages), // Gère l'upload avant la validation/contrôleur
    validateCreateAd, // Valide les autres champs du corps
    adController.createAd
);

// Routes pour une annonce spécifique par ID
router.route('/:id')
    .get(adController.getAdById) // Route publique pour voir une annonce
    .put(
        protect,
        checkOwnership(Ad), // Vérifie que l'utilisateur est propriétaire de l'annonce
        handleMulterUpload(uploadAdImages), // Permet de mettre à jour/ajouter des images
        validateUpdateAd,
        adController.updateAd
    )
    .delete(
        protect,
        checkOwnership(Ad),
        adController.deleteAd
    );

// Routes supplémentaires pour les annonces (exemples)
// router.get('/nearme', protect, adController.getAdsNearMe); // Basé sur la position de l'utilisateur ou une position fournie
// router.post('/:id/highlight', protect, checkOwnership(Ad), adController.toggleHighlightAd); // Pour mettre en avant

module.exports = router;
