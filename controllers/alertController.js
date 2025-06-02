// controllers/alertController.js
const Alert = require('../models/alertModel');
const User = require('../models/userModel'); // Si besoin de vérifier des infos utilisateur
const { AppError } = require('../middlewares/errorHandler');
const { logger } = require('../config/winston');
const APIFeatures = require('../utils/apiFeatures'); // Pour la pagination, etc.

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Créer une nouvelle alerte pour l'utilisateur connecté.
 * POST /api/alerts
 */
exports.createAlert = asyncHandler(async (req, res, next) => {
    const { keywords, category, priceMin, priceMax, latitude, longitude, radius } = req.body;

    if (!keywords || !latitude || !longitude || !radius) {
        return next(new AppError('Veuillez fournir les mots-clés, la localisation et le rayon pour l\'alerte.', 400));
    }

    const alertData = {
        userId: req.user.id,
        keywords,
        category: category || null, // Permettre une catégorie vide/nulle pour "toutes"
        priceMin: priceMin ? parseFloat(priceMin) : null,
        priceMax: priceMax ? parseFloat(priceMax) : null,
        location: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)] // [longitude, latitude]
        },
        radius: parseInt(radius, 10),
        isActive: true // Nouvelle alerte active par défaut
    };

    const newAlert = await Alert.create(alertData);

    res.status(201).json({
        success: true,
        message: 'Alerte créée avec succès.',
        data: {
            alert: newAlert
        },
    });
});

/**
 * Récupérer toutes les alertes de l'utilisateur connecté.
 * GET /api/alerts
 */
exports.getMyAlerts = asyncHandler(async (req, res, next) => {
    // Utilisation de APIFeatures pour la pagination si nécessaire
    const features = new APIFeatures(Alert.find({ userId: req.user.id }), req.query)
        .sort() // Tri par défaut -createdAt (plus récent en premier)
        .paginate();

    const alerts = await features.query;
    const totalAlerts = await Alert.countDocuments({ userId: req.user.id });

    res.status(200).json({
        success: true,
        results: alerts.length,
        pagination: {
            total: totalAlerts,
            limit: features.limit,
            page: features.page,
            totalPages: Math.ceil(totalAlerts / features.limit)
        },
        data: {
            alerts
        },
    });
});

/**
 * Récupérer une alerte spécifique par son ID (appartenant à l'utilisateur connecté).
 * GET /api/alerts/:id
 */
exports.getAlertById = asyncHandler(async (req, res, next) => {
    const alert = await Alert.findOne({ _id: req.params.id, userId: req.user.id });

    if (!alert) {
        return next(new AppError('Alerte non trouvée ou vous n\'avez pas la permission de la voir.', 404));
    }

    res.status(200).json({
        success: true,
        data: {
            alert
        },
    });
});

/**
 * Mettre à jour une alerte (par son propriétaire).
 * PUT /api/alerts/:id
 */
exports.updateAlert = asyncHandler(async (req, res, next) => {
    // La ressource 'alert' est attachée à req par le middleware checkOwnership
    const alert = req.resource; 

    // Champs modifiables
    const allowedUpdates = ['keywords', 'category', 'priceMin', 'priceMax', 'radius', 'isActive'];
    const updates = {};
    allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    });

    // Gérer la mise à jour de la localisation si fournie
    if (req.body.latitude && req.body.longitude) {
        updates.location = {
            type: 'Point',
            coordinates: [parseFloat(req.body.longitude), parseFloat(req.body.latitude)]
        };
    }

    // Mettre à jour l'alerte
    Object.assign(alert, updates);
    const updatedAlert = await alert.save(); // .save() exécute les validateurs Mongoose

    res.status(200).json({
        success: true,
        message: 'Alerte mise à jour avec succès.',
        data: {
            alert: updatedAlert
        },
    });
});

/**
 * Supprimer une alerte (par son propriétaire).
 * DELETE /api/alerts/:id
 */
exports.deleteAlert = asyncHandler(async (req, res, next) => {
    // La ressource 'alert' est attachée à req par le middleware checkOwnership
    const alert = req.resource;

    await Alert.findByIdAndDelete(alert._id);

    logger.info(`Alerte ID ${alert._id} supprimée par l'utilisateur ${req.user.id}`);

    res.status(200).json({ // Ou 204 No Content
        success: true,
        message: 'Alerte supprimée avec succès.',
        data: null
    });
});
