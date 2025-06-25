// controllers/favoriteController.js
const User = require('../models/userModel');
const Ad = require('../models/adModel'); // Assurez-vous que le chemin est correct
const { AppError } = require('../middlewares/errorHandler');
const { logger } = require('../config/winston');
const { createInternalNotification } = require('./notificationController');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @desc    Récupérer les annonces favorites de l'utilisateur
 * @route   GET /api/favorites
 * @access  Private
 */
exports.getMyFavorites = asyncHandler(async (req, res, next) => {
    const userId = req.user.id;

    const user = await User.findById(userId).populate({
        path: 'favorites',
        model: 'Ad'
        // Optionnel : pour ne sélectionner que certains champs de l'annonce
        // select: 'title price images location'
    });

    if (!user) {
        return next(new AppError('Utilisateur non trouvé.', 404));
    }

    res.status(200).json({
        success: true,
        results: user.favorites.length,
        data: {
            favorites: user.favorites
        }
    });
});

/**
 * @desc    Ajouter une annonce aux favoris
 * @route   POST /api/favorites/:adId
 * @access  Private
 */
exports.addFavorite = asyncHandler(async (req, res, next) => {
    const { adId } = req.params;
    const userId = req.user.id;

    const ad = await Ad.findById(adId);
    if (!ad) {
        return next(new AppError('Annonce non trouvée.', 404));
    }

    // Empêcher un utilisateur de mettre sa propre annonce en favori
    if (ad.userId.toString() === userId) {
        return next(new AppError('Vous ne pouvez pas ajouter votre propre annonce aux favoris.', 400));
    }

    const user = await User.findById(userId);

    // Vérifier si l'annonce est déjà dans les favoris
    if (user.favorites.includes(adId)) {
        return next(new AppError('Cette annonce est déjà dans vos favoris.', 400));
    }

    user.favorites.push(adId);
    await user.save();

    logger.info(`L'utilisateur ${userId} a ajouté l'annonce ${adId} à ses favoris.`);

    // --- C'EST LA PARTIE MANQUANTE ---
    // Créer une notification pour le propriétaire de l'annonce
    await createInternalNotification({
        userId: ad.userId, // ID du propriétaire de l'annonce
        actorId: userId, // ID de celui qui a fait l'action
        type: 'favorite_added',
        title: 'Nouvel intérêt pour votre annonce !',
        body: `${req.user.name} a ajouté votre annonce "${ad.title}" à ses favoris.`,
        data: {
            url: `/ad/${ad.id}`, // Lien vers l'annonce
            adId: ad.id,
            actorName: req.user.name
        }
    });

    res.status(200).json({
        success: true,
        message: 'Annonce ajoutée aux favoris.',
        data: {
            favorites: user.favorites
        }
    });
});

/**
 * @desc    Retirer une annonce des favoris
 * @route   DELETE /api/favorites/:adId
 * @access  Private
 */
exports.removeFavorite = asyncHandler(async (req, res, next) => {
    const { adId } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId);

    // Retirer l'annonce des favoris
    user.favorites.pull(adId);
    await user.save();

    logger.info(`L'utilisateur ${userId} a retiré l'annonce ${adId} de ses favoris.`);

    // Pas de notification pour un retrait de favori

    res.status(200).json({
        success: true,
        message: 'Annonce retirée des favoris.',
        data: {
            favorites: user.favorites
        }
    });
});