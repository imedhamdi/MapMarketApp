// controllers/adController.js
const Ad = require('../models/adModel');
const User = require('../models/userModel');
const { AppError } = require('../middlewares/errorHandler');
const { logger } = require('../config/winston');
const fs = require('fs');
const path = require('path');
const APIFeatures = require('../utils/apiFeatures'); // Utilitaire pour filtres, tri, pagination (à créer)

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Helper pour construire les URLs des images
const mapImageUrls = (req, ad) => {
    if (ad.imageUrls && ad.imageUrls.length > 0) {
        ad.imageUrls = ad.imageUrls.map(filePath => 
            // Si filePath est déjà une URL complète (ex: Cloudinary), ne pas la préfixer
            filePath.startsWith('http') ? filePath : `${req.protocol}://${req.get('host')}/uploads/${filePath}`
        );
    }
    return ad;
};


/**
 * Créer une nouvelle annonce
 * POST /api/ads
 */
exports.createAd = asyncHandler(async (req, res, next) => {
    const { title, description, price, category, latitude, longitude, locationAddress } = req.body;

    if (!title || !description || !price || !category || !latitude || !longitude) {
        return next(new AppError('Veuillez fournir tous les champs requis: titre, description, prix, catégorie et localisation.', 400));
    }

    const adData = {
        title,
        description,
        price: parseFloat(price),
        category,
        location: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)], // [longitude, latitude]
            address: locationAddress || ''
        },
        userId: req.user.id, // Ajouté par le middleware `protect`
        status: 'online', // Ou 'pending_review' selon votre workflow
    };

    // Gestion des images uploadées par Multer
    if (req.files && req.files.length > 0) {
        adData.imageUrls = req.files.map(file => path.join('ads', file.filename).replace(/\\/g, '/'));
    } else {
        adData.imageUrls = []; // Ou une image par défaut si souhaité
    }

    const newAd = await Ad.create(adData);
    const populatedAd = await Ad.findById(newAd._id).populate('userId', 'name avatarUrl');
    
    res.status(201).json({
        success: true,
        message: 'Annonce créée avec succès.',
        data: {
            ad: mapImageUrls(req, populatedAd.toObject())
        },
    });
});

/**
 * Récupérer toutes les annonces (avec filtres, tri, pagination)
 * GET /api/ads
 */
exports.getAllAds = asyncHandler(async (req, res, next) => {
    // Construire le filtre de base pour ne montrer que les annonces 'online'
    const baseFilter = { status: 'online' };
    
    // TODO: Implémenter une logique de filtrage plus avancée basée sur req.query
    // (catégorie, distance, prix, recherche texte)
    // Exemple simple de filtre par catégorie
    if (req.query.category) {
        baseFilter.category = req.query.category;
    }
    // Exemple de filtre par prix
    if (req.query.priceMin) {
        baseFilter.price = { ...baseFilter.price, $gte: parseFloat(req.query.priceMin) };
    }
    if (req.query.priceMax) {
        baseFilter.price = { ...baseFilter.price, $lte: parseFloat(req.query.priceMax) };
    }

    // Recherche géospatiale si des coordonnées et une distance sont fournies
    if (req.query.lat && req.query.lng && req.query.distance) {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const distance = parseFloat(req.query.distance) * 1000; // Convertir km en mètres

        baseFilter.location = {
            $nearSphere: {
                $geometry: {
                    type: 'Point',
                    coordinates: [lng, lat],
                },
                $maxDistance: distance,
            },
        };
    }
    
    // Recherche textuelle
    if (req.query.keywords) {
        baseFilter.$text = { $search: req.query.keywords };
    }


    // Utilisation de la classe APIFeatures pour la pagination, le tri, la sélection de champs
    const features = new APIFeatures(Ad.find(baseFilter).populate('userId', 'name avatarUrl'), req.query)
        .filter() // Applique les filtres génériques (autres que ceux déjà gérés ci-dessus)
        .sort()
        .limitFields()
        .paginate();

    const ads = await features.query;
    const totalAds = await Ad.countDocuments(features.getFilterQuery()); // Obtenir le total pour la pagination

    const adsWithFullImageUrls = ads.map(ad => mapImageUrls(req, ad.toObject()));

    res.status(200).json({
        success: true,
        results: adsWithFullImageUrls.length,
        pagination: {
            total: totalAds,
            limit: features.limit,
            page: features.page,
            totalPages: Math.ceil(totalAds / features.limit)
        },
        data: {
            ads: adsWithFullImageUrls,
        },
    });
});

/**
 * Récupérer les annonces de l'utilisateur connecté
 * GET /api/ads/my
 */
exports.getMyAds = asyncHandler(async (req, res, next) => {
    const features = new APIFeatures(Ad.find({ userId: req.user.id }), req.query)
        .sort()
        .paginate();
    
    const ads = await features.query;
    const totalAds = await Ad.countDocuments({ userId: req.user.id });

    const adsWithFullImageUrls = ads.map(ad => mapImageUrls(req, ad.toObject()));

    res.status(200).json({
        success: true,
        results: adsWithFullImageUrls.length,
        pagination: {
            total: totalAds,
            limit: features.limit,
            page: features.page,
            totalPages: Math.ceil(totalAds / features.limit)
        },
        data: {
            ads: adsWithFullImageUrls,
        },
    });
});


/**
 * Récupérer une annonce par son ID
 * GET /api/ads/:id
 */
exports.getAdById = asyncHandler(async (req, res, next) => {
    const ad = await Ad.findById(req.params.id).populate('userId', 'name avatarUrl email'); // Populer les infos du vendeur

    if (!ad || ad.status === 'deleted') { // Ne pas montrer les annonces explicitement supprimées
        return next(new AppError('Annonce non trouvée.', 404));
    }
    // Pour les annonces non 'online', seul le propriétaire ou un admin devrait pouvoir les voir en détail
    if (ad.status !== 'online' && (!req.user || req.user.id.toString() !== ad.userId._id.toString())) {
        // Add admin role check here if needed: && req.user.role !== 'admin'
        return next(new AppError('Cette annonce n\'est pas actuellement visible au public.', 403));
    }


    // Incrémenter le compteur de vues (de manière simple, pourrait être plus robuste)
    ad.viewCount = (ad.viewCount || 0) + 1;
    await ad.save({ validateBeforeSave: false });

    res.status(200).json({
        success: true,
        data: {
            ad: mapImageUrls(req, ad.toObject()),
        },
    });
});

/**
 * Mettre à jour une annonce (par son propriétaire)
 * PUT /api/ads/:id
 */
exports.updateAd = asyncHandler(async (req, res, next) => {
    // La ressource 'ad' est attachée à req par le middleware checkOwnership
    const ad = req.resource; // Ou Ad.findById(req.params.id) si checkOwnership n'est pas utilisé globalement

    // Filtrer les champs autorisés à être modifiés
    const allowedUpdates = ['title', 'description', 'price', 'category', 'locationAddress', 'status'];
    const updates = {};
    allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    });

    // Gérer la mise à jour des coordonnées si fournies
    if (req.body.latitude && req.body.longitude) {
        updates.location = {
            type: 'Point',
            coordinates: [parseFloat(req.body.longitude), parseFloat(req.body.latitude)],
            address: req.body.locationAddress || ad.location.address // Conserver l'ancienne adresse si non fournie
        };
    } else if (req.body.locationAddress && (!req.body.latitude || !req.body.longitude)) {
        // Si seule l'adresse change, il faudrait potentiellement géocoder pour mettre à jour les coordonnées
        // Pour l'instant, on met juste à jour le texte de l'adresse
        if (ad.location) {
            updates.location = { ...ad.location, address: req.body.locationAddress };
        } else { // Si pas de location existante, et on fournit juste une adresse sans coords
             return next(new AppError('Coordonnées manquantes pour la nouvelle adresse. Veuillez localiser sur la carte.', 400));
        }
    }
    
    // Gestion des images
    let newImageUrls = ad.imageUrls || [];
    // 1. Supprimer les images marquées pour suppression (non implémenté via req.body.imagesToDelete)
    //    On suppose que `req.body.existingImageUrls` contient les URLs des images à conserver
    if (req.body.existingImageUrls) {
        try {
            const urlsToKeep = JSON.parse(req.body.existingImageUrls);
            // Filtrer les anciennes URLs pour ne garder que celles à conserver
            const oldUrlsToRemove = newImageUrls.filter(oldUrl => 
                !urlsToKeep.includes(oldUrl) && !oldUrl.startsWith('http') // Ne supprimer que les fichiers locaux
            );
            oldUrlsToRemove.forEach(filePath => {
                const fullPath = path.join(__dirname, '..', 'uploads', filePath);
                fs.unlink(fullPath, err => {
                    if(err && err.code !== 'ENOENT') logger.error(`Erreur suppression ancienne image ${fullPath}: ${err}`);
                });
            });
            newImageUrls = urlsToKeep;
        } catch (e) {
            logger.error("Erreur parsing existingImageUrls:", e);
            // Continuer sans modifier les images existantes en cas d'erreur
        }
    }


    // 2. Ajouter les nouvelles images uploadées
    if (req.files && req.files.length > 0) {
        const uploadedImagePaths = req.files.map(file => path.join('ads', file.filename).replace(/\\/g, '/'));
        newImageUrls = [...newImageUrls, ...uploadedImagePaths];
    }
    updates.imageUrls = newImageUrls.slice(0, parseInt(process.env.MAX_AD_IMAGES_COUNT || '5')); // Respecter la limite max

    const updatedAd = await Ad.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
    }).populate('userId', 'name avatarUrl');

    if (!updatedAd) {
        return next(new AppError('Annonce non trouvée ou mise à jour impossible.', 404));
    }

    res.status(200).json({
        success: true,
        message: 'Annonce mise à jour avec succès.',
        data: {
            ad: mapImageUrls(req, updatedAd.toObject()),
        },
    });
});


/**
 * Supprimer une annonce (par son propriétaire)
 * DELETE /api/ads/:id
 */
exports.deleteAd = asyncHandler(async (req, res, next) => {
    // La ressource 'ad' est attachée à req par le middleware checkOwnership
    const ad = req.resource; // Ou Ad.findById(req.params.id)

    if (!ad) { // Devrait déjà être géré par checkOwnership, mais double sécurité
        return next(new AppError('Annonce non trouvée.', 404));
    }

    // Supprimer les images associées du système de fichiers
    if (ad.imageUrls && ad.imageUrls.length > 0) {
        ad.imageUrls.forEach(filePath => {
            if (!filePath.startsWith('http')) { // Ne supprimer que les fichiers locaux
                const fullPath = path.join(__dirname, '..', 'uploads', filePath);
                fs.unlink(fullPath, err => {
                    if (err && err.code !== 'ENOENT') logger.error(`Erreur lors de la suppression de l'image ${fullPath}: ${err}`);
                    else if (!err) logger.info(`Image ${fullPath} supprimée lors de la suppression de l'annonce.`);
                });
            }
        });
    }

    // Supprimer l'annonce de la base de données
    await Ad.findByIdAndDelete(req.params.id);

    // TODO: Supprimer cette annonce des favoris de tous les utilisateurs
    // await User.updateMany({}, { $pull: { favorites: ad._id } });

    logger.info(`Annonce ID ${req.params.id} supprimée par l'utilisateur ${req.user.id}`);

    res.status(200).json({ // Ou 204 No Content
        success: true,
        message: 'Annonce supprimée avec succès.',
        data: null
    });
});
