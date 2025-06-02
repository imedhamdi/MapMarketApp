// controllers/favoriteController.js
const User = require('../models/userModel');
const Ad = require('../models/adModel');
const { AppError } = require('../middlewares/errorHandler');
const { logger } = require('../config/winston');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Helper pour construire les URLs complètes des images pour les annonces favorites
const mapImageUrlsForFavorite = (req, ad) => {
    if (ad && ad.imageUrls && ad.imageUrls.length > 0) {
        // Cloner l'objet ad pour ne pas modifier l'original directement si c'est une instance Mongoose
        const adObject = ad.toObject ? ad.toObject() : { ...ad };
        adObject.imageUrls = adObject.imageUrls.map(filePath =>
            filePath.startsWith('http') ? filePath : `${req.protocol}://${req.get('host')}/uploads/${filePath}`
        );
        return adObject;
    }
    if (ad && ad.toObject) return ad.toObject();
    return ad;
};


/**
 * Récupérer les annonces favorites de l'utilisateur connecté.
 * GET /api/favorites
 */
exports.getMyFavorites = asyncHandler(async (req, res, next) => {
  // req.user est défini par le middleware `protect`
  // On popule les détails des annonces favorites
  const userWithFavorites = await User.findById(req.user.id)
    .populate({
      path: 'favorites',
      model: 'Ad', // S'assurer que le modèle Ad est bien référencé
      select: 'title price category imageUrls location.address createdAt status', // Sélectionner les champs nécessaires pour l'affichage de la liste des favoris
      populate: { // Optionnel: si vous voulez aussi le nom de la catégorie
          path: 'category', // Supposant que 'category' dans Ad est une réf à un modèle Category
          select: 'name'
      }
    });

  if (!userWithFavorites) {
    return next(new AppError('Utilisateur non trouvé.', 404));
  }

  const favoriteAds = userWithFavorites.favorites.map(ad => mapImageUrlsForFavorite(req, ad));

  res.status(200).json({
    success: true,
    results: favoriteAds.length,
    data: {
      favorites: favoriteAds,
    },
  });
});

/**
 * Ajouter une annonce aux favoris de l'utilisateur.
 * POST /api/favorites
 * Body: { adId: "id_de_l_annonce" }
 */
exports.addFavorite = asyncHandler(async (req, res, next) => {
  const { adId } = req.body;
  const userId = req.user.id;

  if (!adId) {
    return next(new AppError('Veuillez fournir l\'ID de l\'annonce à ajouter aux favoris.', 400));
  }

  // Vérifier si l'annonce existe
  const adExists = await Ad.findById(adId);
  if (!adExists || adExists.status !== 'online') {
    return next(new AppError('Annonce non trouvée ou non disponible.', 404));
  }

  // Ajouter l'annonce aux favoris de l'utilisateur si elle n'y est pas déjà
  // $addToSet empêche les doublons
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $addToSet: { favorites: adId } },
    { new: true, runValidators: true } // new:true pour retourner le document mis à jour
  );

  if (!updatedUser) {
    return next(new AppError('Impossible d\'ajouter l\'annonce aux favoris. Utilisateur non trouvé.', 404));
  }

  // Optionnel: Incrémenter le compteur de favoris sur l'annonce
  await Ad.findByIdAndUpdate(adId, { $inc: { favoriteCount: 1 } });

  logger.info(`Annonce ${adId} ajoutée aux favoris de l'utilisateur ${userId}`);
  res.status(200).json({
    success: true,
    message: 'Annonce ajoutée aux favoris.',
    data: {
      // On pourrait retourner la liste mise à jour des IDs favoris ou l'annonce ajoutée
      favorites: updatedUser.favorites 
    }
  });
});

/**
 * Retirer une annonce des favoris de l'utilisateur.
 * DELETE /api/favorites/:adId
 */
exports.removeFavorite = asyncHandler(async (req, res, next) => {
  const { adId } = req.params; // adId vient des paramètres de l'URL
  const userId = req.user.id;

  if (!adId) {
    return next(new AppError('Veuillez fournir l\'ID de l\'annonce à retirer des favoris.', 400));
  }

  // Retirer l'annonce des favoris de l'utilisateur
  // $pull retire l'élément du tableau
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $pull: { favorites: adId } },
    { new: true }
  );

  if (!updatedUser) {
    // Cela ne devrait pas arriver si l'utilisateur est authentifié
    return next(new AppError('Utilisateur non trouvé.', 404));
  }

  // Optionnel: Décrémenter le compteur de favoris sur l'annonce, en s'assurant qu'il ne devienne pas négatif
  await Ad.findByIdAndUpdate(adId, { $inc: { favoriteCount: -1 } }, { 
    // Optionnel: ajouter une condition pour ne pas décrémenter en dessous de 0,
    // mais $inc gère cela en ne faisant rien si le champ n'existe pas ou si on essaie de le rendre négatif
    // et qu'il est défini avec min:0 dans le schéma.
    // Pour être sûr:
    // new: true, // pour voir le résultat
    // runValidators: true // si vous avez des validateurs sur favoriteCount
  });

  logger.info(`Annonce ${adId} retirée des favoris de l'utilisateur ${userId}`);
  res.status(200).json({
    success: true,
    message: 'Annonce retirée des favoris.',
    data: {
      favorites: updatedUser.favorites
    }
  });
});
