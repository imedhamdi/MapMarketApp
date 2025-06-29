// controllers/settingController.js
const User = require('../models/userModel');
const { AppError } = require('../middlewares/errorHandler');
const { logger } = require('../config/winston');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Met à jour les paramètres de l'utilisateur connecté.
 * PUT /api/settings
 * Le corps de la requête devrait être de la forme: { settings: { darkMode: true, language: 'en', notifications: { pushEnabled: false } } }
 * ou pour un seul paramètre : { settings: { darkMode: true } }
 * ou pour un abonnement push : { settings: { pushSubscription: { endpoint: '...', keys: {...} } } }
 */
exports.updateMySettings = asyncHandler(async (req, res, next) => {
    const userId = req.user.id;
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object' || Object.keys(settings).length === 0) {
        return next(new AppError('Aucun paramètre fourni pour la mise à jour.', 400));
    }

    const user = await User.findById(userId);
    if (!user) {
        return next(new AppError('Utilisateur non trouvé.', 404));
    }

    // Fusionner les nouveaux paramètres avec les paramètres existants
    // On ne met à jour que les clés fournies dans req.body.settings
    // et on s'assure de ne pas écraser des sous-objets entiers si seulement une partie est mise à jour.

    const allowedTopLevelSettings = ['darkMode', 'language', 'notifications', 'pushSubscription'];
    const updates = {};

    for (const key in settings) {
        if (allowedTopLevelSettings.includes(key)) {
            if (key === 'notifications' && typeof settings.notifications === 'object') {
                // Gérer les sous-propriétés de 'notifications'
                if (!user.settings.notifications) user.settings.notifications = {};
                const allowedNotificationSettings = ['pushEnabled', 'emailEnabled'];
                for (const notifKey in settings.notifications) {
                    if (allowedNotificationSettings.includes(notifKey)) {
                        user.settings.notifications[notifKey] = settings.notifications[notifKey];
                    }
                }
            } else if (key === 'pushSubscription') {
                // Si la valeur est null, cela signifie une désinscription
                if (settings.pushSubscription === null) {
                    user.settings.notifications.pushSubscription = null;
                    user.settings.notifications.pushEnabled = false; // Assurer la cohérence
                } else if (typeof settings.pushSubscription === 'object') {
                    // --- VALIDATION DE L'ABONNEMENT PUSH ---
                    const sub = settings.pushSubscription;
                    if (sub && sub.endpoint && sub.keys && sub.keys.p256dh && sub.keys.auth) {
                        // L'abonnement semble valide, on le sauvegarde.
                        if (!user.settings.notifications) user.settings.notifications = {};
                        user.settings.notifications.pushSubscription = sub;
                        user.settings.notifications.pushEnabled = true; // Assurer la cohérence
                    } else {
                        logger.warn(`Tentative de sauvegarde d'un pushSubscription invalide pour l'utilisateur ${userId}. Données reçues: ${JSON.stringify(sub)}`);
                        // On ne sauvegarde pas un objet invalide. On pourrait retourner une erreur 400.
                    }
                }
            } else {
                // Pour les clés de premier niveau comme darkMode, language
                user.settings[key] = settings[key];
            }
        }
    }
    
    // Marquer le chemin 'settings' comme modifié pour que Mongoose le sauvegarde correctement
    user.markModified('settings');
    const updatedUser = await user.save({ validateBeforeSave: true }); // Exécuter les validateurs

    // Retirer les informations sensibles avant de renvoyer
    const userResponse = updatedUser.toObject();
    delete userResponse.password;
    delete userResponse.passwordChangedAt;
    delete userResponse.passwordResetToken;
    delete userResponse.passwordResetExpires;


    logger.info(`Paramètres mis à jour pour l'utilisateur ${userId}: ${JSON.stringify(settings)}`);
    res.status(200).json({
        success: true,
        message: 'Paramètres mis à jour avec succès.',
        data: {
            user: userResponse, // Renvoyer l'utilisateur mis à jour avec ses nouveaux paramètres
        },
    });
});

/**
 * Récupérer les paramètres de l'utilisateur connecté.
 * GET /api/settings
 * (Alternativement, ces informations sont souvent incluses dans GET /api/users/me)
 */
exports.getMySettings = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id).select('+settings'); // S'assurer que settings est sélectionné

    if (!user) {
        return next(new AppError('Utilisateur non trouvé.', 404));
    }

    res.status(200).json({
        success: true,
        data: {
            settings: user.settings,
        },
    });
});
