// controllers/notificationController.js
const Notification = require('../models/notificationModel');
const { AppError } = require('../middlewares/errorHandler');
const { logger } = require('../config/winston');
const APIFeatures = require('../utils/apiFeatures');
const User = require('../models/userModel');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Récupérer toutes les notifications pour l'utilisateur connecté.
 * GET /api/notifications
 * Query params: page, limit, sort, isRead (true/false)
 */
exports.getMyNotifications = asyncHandler(async (req, res, next) => {
    const userId = req.user.id;
    const filter = { userId };

    if (req.query.isRead === 'true') {
        filter.isRead = true;
    } else if (req.query.isRead === 'false') {
        filter.isRead = false;
    }
    // Si req.query.isRead n'est pas défini, on récupère toutes les notifications (lues et non lues)

    const features = new APIFeatures(Notification.find(filter), req.query)
        .sort() // Tri par défaut -createdAt (plus récent en premier)
        .limitFields('-__v') // Exclure __v
        .paginate();

    const notifications = await features.query;
    const totalNotifications = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });


    res.status(200).json({
        success: true,
        results: notifications.length,
        pagination: {
            total: totalNotifications,
            limit: features.limit,
            page: features.page,
            totalPages: Math.ceil(totalNotifications / features.limit)
        },
        unreadCount: unreadCount, // Renvoyer le nombre total de non lues pour le badge
        data: {
            notifications,
        },
    });
});

/**
 * Marquer une notification spécifique comme lue.
 * POST /api/notifications/:id/read
 */
exports.markNotificationAsRead = asyncHandler(async (req, res, next) => {
    const notification = await Notification.findOne({ _id: req.params.id, userId: req.user.id });

    if (!notification) {
        return next(new AppError('Notification non trouvée ou non autorisée.', 404));
    }

    if (!notification.isRead) {
        notification.isRead = true;
        notification.readAt = Date.now();
        await notification.save({ validateBeforeSave: false }); // Pas besoin de revalider
        logger.info(`Notification ${req.params.id} marquée comme lue pour l'utilisateur ${req.user.id}`);
    }

    const unreadCount = await Notification.countDocuments({ userId: req.user.id, isRead: false });

    res.status(200).json({
        success: true,
        message: 'Notification marquée comme lue.',
        data: {
            notification,
            unreadCount: unreadCount
        },
    });
});

/**
 * Marquer plusieurs notifications comme lues.
 * POST /api/notifications/mark-as-read
 */
exports.markMultipleNotificationsAsRead = asyncHandler(async (req, res, next) => {
    const { notificationIds } = req.body;
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return next(new AppError('Liste d\'IDs requise.', 400));
    }

    await Notification.markMultipleAsRead(req.user.id, notificationIds);
    const unreadCount = await Notification.countDocuments({ userId: req.user.id, isRead: false });

    res.status(200).json({
        success: true,
        message: 'Notifications marquées comme lues.',
        data: { unreadCount }
    });
});

/**
 * Marquer toutes les notifications de l'utilisateur comme lues.
 * POST /api/notifications/read-all
 */
exports.markAllNotificationsAsRead = asyncHandler(async (req, res, next) => {
    const result = await Notification.updateMany(
        { userId: req.user.id, isRead: false },
        { $set: { isRead: true, readAt: Date.now() } }
    );

    logger.info(`${result.modifiedCount} notifications marquées comme lues pour l'utilisateur ${req.user.id}`);

    res.status(200).json({
        success: true,
        message: `${result.modifiedCount} notification(s) marquée(s) comme lue(s).`,
        data: {
            modifiedCount: result.modifiedCount,
            unreadCount: 0 // Toutes sont maintenant lues
        }
    });
});

/**
 * Supprimer une notification spécifique.
 * DELETE /api/notifications/:id
 */
exports.deleteNotification = asyncHandler(async (req, res, next) => {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });

    if (!notification) {
        return next(new AppError('Notification non trouvée ou vous n\'êtes pas autorisé à la supprimer.', 404));
    }

    logger.info(`Notification ${req.params.id} supprimée pour l'utilisateur ${req.user.id}`);
    const unreadCount = await Notification.countDocuments({ userId: req.user.id, isRead: false });


    res.status(200).json({ // Ou 204 No Content
        success: true,
        message: 'Notification supprimée avec succès.',
        data: {
            unreadCount: unreadCount
        }
    });
});

/**
 * Supprimer toutes les notifications (lues) d'un utilisateur.
 * DELETE /api/notifications/all-read (ou /api/notifications/clear)
 */
exports.deleteAllReadNotifications = asyncHandler(async (req, res, next) => {
    const result = await Notification.deleteMany({ userId: req.user.id, isRead: true });

    logger.info(`${result.deletedCount} notifications lues supprimées pour l'utilisateur ${req.user.id}`);
    // Le nombre de non-lues ne change pas par cette action.

    res.status(200).json({
        success: true,
        message: `${result.deletedCount} notification(s) lue(s) supprimée(s).`,
        data: {
            deletedCount: result.deletedCount
        }
    });
});


// Fonction pour créer une notification (utilisée en interne par d'autres services/contrôleurs)
// Elle ne sera pas exposée directement en tant que route API POST /api/notifications
exports.createInternalNotification = async (notificationData) => {
    try {
        if (!notificationData.userId || !notificationData.title || !notificationData.body || !notificationData.type) {
            logger.error('createInternalNotification: Champs requis manquants.', notificationData);
            return null;
        }
        const notification = await Notification.create(notificationData);
        logger.info(`Notification interne créée pour l'utilisateur ${notificationData.userId}, type: ${notificationData.type}`);
        
        // Envoyer via Socket.IO à l'utilisateur concerné
        const { io } = require('../server');
        if (io && notificationData.userId) {
            const userRoom = `user_${notificationData.userId}`;
            const unreadCount = await Notification.countDocuments({ userId: notificationData.userId, isRead: false });

            // On utilise le namespace '/chat' et la room de l'utilisateur comme défini dans server.js
            io.of('/chat').to(userRoom).emit('new_notification', {
                notification,
                unreadCount
            });
            logger.info(`Notification émise via Socket.IO à la room ${userRoom}`);
        }

    //    Envoyer un email si les préférences de l'utilisateur le permettent
        const user = await User.findById(notificationData.userId);
        if (user && user.settings && user.settings.notifications && user.settings.notifications.emailEnabled) {
            if (typeof sendEmail === 'function') {
                await sendEmail({
                    to: user.email,
                    subject: notificationData.title,
                    html: `<p>${notificationData.body}</p>${notificationData.data && notificationData.data.url ? `<p><a href="${notificationData.data.url}">Voir les détails</a></p>` : ''}`,
                    // text: ...
                });
                logger.info(`Notification par email (simulée) envoyée à ${user.email} pour type: ${notificationData.type}`);
            } else {
                logger.warn("Fonction sendEmail non disponible pour la notification par email.");
            }
        }

        return notification;
    } catch (error) {
        logger.error('Erreur lors de la création de la notification interne:', error);
        return null;
    }
};
