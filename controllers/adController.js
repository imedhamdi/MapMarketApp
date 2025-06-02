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
 * Middlewares requis avant ce contrôleur sur la route:
 * - `protect`: pour authentifier l'utilisateur et attacher `req.user`.
 * - `uploadAdImages` (ou similaire utilisant Multer): pour parser `multipart/form-data` et attacher `req.files`.
 */
exports.createAd = asyncHandler(async (req, res, next) => {
    logger.info('BACKEND: Entrée dans exports.createAd');
    logger.debug('BACKEND: req.body initial:', req.body);
    logger.debug('BACKEND: req.files initial:', req.files);
    logger.debug('BACKEND: req.user.id:', req.user ? req.user.id : 'NON AUTHENTIFIÉ');

    // 1. Vérification de l'authentification
    if (!req.user || !req.user.id) {
        logger.warn('BACKEND: Tentative de création d\'annonce sans utilisateur authentifié.');
        return next(new AppError('Utilisateur non authentifié. Impossible de créer l\'annonce.', 401));
    }

    // 2. Déstructuration et validation des champs provenant de req.body
    const { title, description, price, category, latitude, longitude, locationAddress } = req.body;

    // Validation du titre
    if (!title || typeof title !== 'string' || title.trim() === '') {
        logger.warn('BACKEND: Validation échouée - titre.', { title });
        return next(new AppError('Le titre est requis et doit être une chaîne de caractères non vide.', 400));
    }
    // Ajoutez d'autres validations pour title si nécessaire (longueur min/max, etc.)

    // Validation de la description
    if (!description || typeof description !== 'string' || description.trim() === '') {
        logger.warn('BACKEND: Validation échouée - description.', { description });
        return next(new AppError('La description est requise et doit être une chaîne de caractères non vide.', 400));
    }

    // Validation de la catégorie
    // La chaîne "undefined" peut arriver si le frontend envoie la valeur d'une option non sélectionnée.
    if (!category || typeof category !== 'string' || category.trim() === '' || category.trim().toLowerCase() === 'undefined') {
        logger.warn('BACKEND: Validation échouée - catégorie.', { category });
        return next(new AppError('La catégorie est requise et doit être valide.', 400));
    }
    // Ici, vous pourriez aussi vérifier si l'ID de catégorie existe dans votre DB de catégories.

    // Validation du prix
    if (price === undefined || price === null || String(price).trim() === '') {
        logger.warn('BACKEND: Validation échouée - prix manquant.', { price_raw: price });
        return next(new AppError('Le prix est requis.', 400));
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        logger.warn('BACKEND: Validation échouée - prix invalide.', { price_raw: price, price_parsed: parsedPrice });
        return next(new AppError('Le prix doit être un nombre positif ou nul.', 400));
    }

    // Validation de la latitude
    if (latitude === undefined || latitude === null || String(latitude).trim() === '') {
        logger.warn('BACKEND: Validation échouée - latitude manquante.', { latitude_raw: latitude });
        return next(new AppError('La latitude est requise.', 400));
    }
    const parsedLat = parseFloat(latitude);
    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        logger.warn('BACKEND: Validation échouée - latitude invalide.', { latitude_raw: latitude, latitude_parsed: parsedLat });
        return next(new AppError('La latitude doit être un nombre valide entre -90 et 90.', 400));
    }

    // Validation de la longitude
    if (longitude === undefined || longitude === null || String(longitude).trim() === '') {
        logger.warn('BACKEND: Validation échouée - longitude manquante.', { longitude_raw: longitude });
        return next(new AppError('La longitude est requise.', 400));
    }
    const parsedLng = parseFloat(longitude);
    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
        logger.warn('BACKEND: Validation échouée - longitude invalide.', { longitude_raw: longitude, longitude_parsed: parsedLng });
        return next(new AppError('La longitude doit être un nombre valide entre -180 et 180.', 400));
    }

    logger.info('BACKEND: Toutes les validations des champs de base sont passées.');

    // 3. Préparation de l'objet adData pour la création
    const adData = {
        title: title.trim(),
        description: description.trim(),
        price: parsedPrice,
        category: category.trim(), // Devrait être un ID de catégorie valide
        location: {
            type: 'Point',
            coordinates: [parsedLng, parsedLat], // GeoJSON: [longitude, latitude]
            address: (locationAddress && typeof locationAddress === 'string') ? locationAddress.trim() : ''
        },
        userId: req.user.id,
        status: 'online', // Ou 'pending_review', 'draft' selon votre logique métier
        imageUrls: [] // Initialiser comme tableau vide
    };

    // 4. Gestion des images uploadées
    if (req.files && req.files.length > 0) {
        const MAX_IMAGES = parseInt(process.env.MAX_AD_IMAGES_COUNT || '5'); // Configurable
        if (req.files.length > MAX_IMAGES) {
            logger.warn(`BACKEND: Tentative d'upload de ${req.files.length} images. Maximum autorisé: ${MAX_IMAGES}.`);
            // Supprimer les fichiers uploadés en excès pour éviter de les stocker inutilement.
            req.files.forEach(file => {
                try {
                    fs.unlinkSync(file.path); // Supprime le fichier du stockage temporaire de Multer
                } catch (unlinkErr) {
                    logger.error(`BACKEND: Échec de la suppression du fichier uploadé en excès: ${file.path}`, unlinkErr);
                }
            });
            return next(new AppError(`Vous ne pouvez télécharger qu'un maximum de ${MAX_IMAGES} images.`, 400));
        }
        // Les chemins doivent être relatifs à votre dossier 'uploads' global.
        // Le préfixe 'ads/' aide à organiser les images.
        adData.imageUrls = req.files.map(file => path.join('ads', file.filename).replace(/\\/g, '/'));
    }

    logger.debug('BACKEND: Objet adData final avant Ad.create:', JSON.stringify(adData, null, 2));

    // 5. Création de l'annonce dans la base de données
    let newAdDocument;
    try {
        newAdDocument = await Ad.create(adData); // Mongoose applique ici les validations du schéma (adModel.js)
        logger.info(`BACKEND: Annonce créée avec succès dans la DB. ID: ${newAdDocument._id}`);
    } catch (error) {
        logger.error('BACKEND: Erreur Mongoose lors de Ad.create:', { message: error.message, name: error.name, errors: error.errors });
        if (error.name === 'ValidationError') {
            // Construire un message d'erreur plus spécifique à partir des erreurs de validation Mongoose
            const messages = Object.values(error.errors).map(val => val.message);
            const userFriendlyMessage = `Erreur de validation des données: ${messages.join('. ')}`;
            return next(new AppError(userFriendlyMessage, 400));
        }
        // Pour d'autres erreurs (ex: problème de connexion à la DB)
        return next(error); // Laisser le gestionnaire d'erreurs global s'occuper
    }

    // 6. Peupler les informations de l'utilisateur pour la réponse
    // Utiliser .lean() pour obtenir un objet JS simple, ce qui est généralement plus performant.
    const populatedAd = await Ad.findById(newAdDocument._id)
                                .populate('userId', 'name avatarUrl') // Sélectionner les champs de l'utilisateur
                                .lean(); // Important pour la performance et pour éviter les objets Mongoose complexes

    if (!populatedAd) {
        // Ce cas est très improbable si Ad.create a réussi et que l'annonce n'a pas été supprimée immédiatement après.
        logger.error(`BACKEND: CRITIQUE - L'annonce ${newAdDocument._id} a été créée mais n'a pas pu être récupérée pour la réponse.`);
        return next(new AppError('Erreur interne: L\'annonce a été créée mais sa récupération a échoué.', 500));
    }

    // 7. Formater et envoyer la réponse
    res.status(201).json({
        success: true,
        message: 'Annonce créée avec succès.',
        data: {
            // mapImageUrls transforme les chemins relatifs en URLs complètes
            ad: mapImageUrls(req, populatedAd) // populatedAd est déjà un plain object
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
