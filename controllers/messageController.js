// controllers/messageController.js
const Thread = require('../models/threadModel');
const mongoose = require('mongoose');
const Message = require('../models/messageModel');
const User = require('../models/userModel');
const Ad = require('../models/adModel');
const { AppError } = require('../middlewares/errorHandler');
const { logger } = require('../config/winston');
const APIFeatures = require('../utils/apiFeatures');
const fs = require('fs');
const path = require('path');
// const sendEmail = require('../utils/email'); // Pour les notifications email
// const { io } = require('../server'); // Importer l'instance io de server.js

// Pour éviter les dépendances circulaires avec server.js pour `io`,
// une meilleure approche est d'initialiser un gestionnaire de socket séparé
// ou de passer `io` aux fonctions qui en ont besoin.
// Pour l'instant, on supposera que `io` peut être accédé ou qu'on a une fonction pour émettre.

let ioInstance = null; // Sera initialisée par server.js
exports.initializeSocketIO = (io) => {
    ioInstance = io;
    logger.info('Socket.IO instance initialisée dans messageController.');
};


const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Helper pour construire les URLs complètes des images
const mapMessageImageUrls = (req, message) => {
    if (message.imageUrl && !message.imageUrl.startsWith('http')) {
        // Cloner si c'est une instance Mongoose pour éviter de modifier l'original par référence
        const messageObj = message.toObject ? message.toObject() : { ...message };
        messageObj.imageUrl = `${req.protocol}://${req.get('host')}/uploads/${message.imageUrl}`;
        return messageObj;
    }
    return message;
};


/**
 * Initie ou récupère un thread de discussion existant.
 * POST /api/messages/threads/initiate
 * Body: { recipientId: "ID de l'autre utilisateur", adId: "ID de l'annonce (optionnel)" }
 */
exports.initiateOrGetThread = asyncHandler(async (req, res, next) => {
    const { recipientId, adId } = req.body;
    const initiatorId = req.user.id;

    if (!recipientId || !adId) {
        return next(new AppError('Les champs recipientId et adId sont requis pour démarrer une discussion.', 400));
    }
    if (recipientId === initiatorId) {
        return next(new AppError('Vous ne pouvez pas discuter avec vous-même.', 400));
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) return next(new AppError('Destinataire introuvable.', 404));
    if (req.user.blockedUsers?.includes(recipientId)) {
        return next(new AppError(`Vous avez bloqué ${recipient.name}.`, 403));
    }
    if (recipient.blockedUsers?.includes(initiatorId)) {
        return next(new AppError('Cet utilisateur vous a bloqué.', 403));
    }

    const ad = await Ad.findById(adId);
    if (!ad) return next(new AppError('Annonce introuvable.', 404));

    let thread = await Thread.findOrCreateThread(initiatorId, recipientId, adId);

    thread = await Thread.findById(thread._id)
        .populate('participants.user', 'name avatarUrl')
        .populate('ad', 'title imageUrls price');

    thread.participants.forEach(p => {
        p.locallyDeletedAt = undefined;
    });
    await thread.save({ validateBeforeSave: false });

    res.status(200).json({
        success: true,
        message: 'Thread récupéré ou créé.',
        data: { thread }
    });
});



/**
 * Récupérer tous les threads de discussion pour l'utilisateur connecté.
 * GET /api/messages/threads
 * Query: page, limit, sort
 */
exports.getMyThreads = asyncHandler(async (req, res, next) => {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const threads = await Thread.aggregate([
        { $match: { 'participants.user': userId } },
        { $sort: { updatedAt: -1 } },
        {
            $addFields: {
                currentUserParticipant: {
                    $arrayElemAt: [
                        { $filter: { input: '$participants', as: 'p', cond: { $eq: ['$$p.user', userId] } } },
                        0
                    ]
                }
            }
        },
        {
            $match: {
                $or: [
                    { 'currentUserParticipant.locallyDeletedAt': { $exists: false } },
                    { $expr: { $gt: ['$updatedAt', '$currentUserParticipant.locallyDeletedAt'] } }
                ]
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'participants.user',
                foreignField: '_id',
                as: 'participantDetails',
                pipeline: [{ $project: { name: 1, avatarUrl: 1, isOnline: 1, lastSeen: 1 } }]
            }
        },
        {
            $lookup: {
                from: 'ads',
                localField: 'ad',
                foreignField: '_id',
                as: 'adDetails',
                pipeline: [{ $project: { title: 1, imageUrls: 1, price: 1 } }]
            }
        },
        {
            $project: {
                _id: 1,
                participants: '$participantDetails',
                ad: {
                    _id: { $arrayElemAt: ['$adDetails._id', 0] },
                    title: { $arrayElemAt: ['$adDetails.title', 0] },
                    price: { $arrayElemAt: ['$adDetails.price', 0] },
                    imageUrls: { $arrayElemAt: ['$adDetails.imageUrls', 0] }
                },
                lastMessage: 1,
                createdAt: 1,
                updatedAt: 1
            }
        }
    ]);

    res.status(200).json({
        success: true,
        results: threads.length,
        data: { threads }
    });
});




/**
 * Récupérer les messages d'un thread spécifique (avec pagination).
 * GET /api/messages/threads/:threadId/messages
 * Query: limit, before (timestamp du message le plus ancien chargé pour la page précédente)
 */
exports.getMessagesForThread = asyncHandler(async (req, res, next) => {
    const { threadId } = req.params;
    const userId = req.user.id;

    const thread = await Thread.findOne({ _id: threadId, 'participants.user': userId });
    if (!thread) {
        return next(new AppError('Thread non trouvé ou accès non autorisé.', 404));
    }

    const queryOptions = { threadId };
    // Filtrer les messages "supprimés pour moi"
    queryOptions.deletedFor = { $ne: userId };
    queryOptions.isDeletedGlobally = { $ne: true };


    if (req.query.before) { // Pour charger les messages plus anciens (scroll vers le haut)
        queryOptions.createdAt = { $lt: new Date(parseInt(req.query.before, 10)) };
    }

    const limit = parseInt(req.query.limit, 10) || 20;

    const messages = await Message.find(queryOptions)
        .populate('senderId', 'name avatarUrl') // Populer l'expéditeur
        .sort({ createdAt: -1 }) // Les plus récents d'abord pour la pagination inversée
        .limit(limit);

    // Les messages sont récupérés du plus récent au plus ancien,
    // le client les affichera généralement dans l'ordre chronologique (donc inverser si besoin côté client ou ici).
    // Pour le scroll infini vers le haut, cet ordre est bon.

    const messagesWithFullImageUrls = messages.map(msg => mapMessageImageUrls(req, msg));

    res.status(200).json({
        success: true,
        results: messagesWithFullImageUrls.length,
        data: {
            messages: messagesWithFullImageUrls.reverse(), // Inverser pour l'affichage chronologique
        }
    });
});


/**
 * Envoyer un message (texte ou image).
 * POST /api/messages/messages (pour texte)
 * POST /api/messages/messages/image (pour image, géré par Multer avant)
 */
exports.sendMessage = asyncHandler(async (req, res, next) => {
    const { threadId, recipientId, text, adId } = req.body;
    const senderId = req.user.id;
    let currentThreadId = threadId;
    let isNewThread = false;

    // **CORRECTION AJOUTÉE : Vérification de sécurité en amont**
    if ((!text || text.trim() === '') && !req.file) {
        return next(new AppError('Un message doit contenir du texte ou une image.', 400));
    }

    if (!currentThreadId && (!recipientId || !adId)) {
        return next(new AppError('recipientId et adId sont requis pour démarrer une nouvelle discussion.', 400));
    }

    // --- Vérification de blocage ---
    let finalRecipientId = recipientId;
    if (currentThreadId) {
        const tempThread = await Thread.findById(currentThreadId).populate('participants.user', 'blockedUsers name');
        if (!tempThread) return next(new AppError('Thread non trouvé.', 404));
        const otherParticipant = tempThread.participants.find(p => p.user._id.toString() !== senderId);
        if (!otherParticipant) return next(new AppError('Destinataire non trouvé dans le thread.', 404));
        finalRecipientId = otherParticipant.user._id.toString();

        if (req.user.blockedUsers?.includes(finalRecipientId)) {
            return next(new AppError(`Vous avez bloqué ${otherParticipant.user.name}.`, 403));
        }
        if (otherParticipant.user.blockedUsers?.includes(senderId)) {
            return next(new AppError('Cet utilisateur vous a bloqué.', 403));
        }
    } else {
        const recipientUser = await User.findById(recipientId);
        if (!recipientUser) return next(new AppError('Destinataire non trouvé.', 404));
        if (req.user.blockedUsers?.includes(recipientId)) {
            return next(new AppError(`Vous avez bloqué cet utilisateur.`, 403));
        }
        if (recipientUser.blockedUsers?.includes(senderId)) {
            return next(new AppError('Cet utilisateur vous a bloqué.', 403));
        }
    }

    // --- Création du thread si nécessaire ---
    if (!currentThreadId && recipientId && adId) {
        const thread = await Thread.findOrCreateThread(senderId, recipientId, adId);
        currentThreadId = thread._id;
        isNewThread = !thread.lastMessage;
    }

    const messageData = {
        threadId: currentThreadId,
        senderId,
        text: text ? text.trim() : null,
    };

    if (req.file) {
        messageData.imageUrl = path.join('messages', req.file.filename).replace(/\\/g, '/');
    }

    const newMessage = await Message.create(messageData);
    const populatedMessage = await Message.findById(newMessage._id).populate('senderId', 'name avatarUrl');

    const updatedThread = await Thread.findById(currentThreadId)
        .populate('participants.user', 'name avatarUrl isOnline lastSeen')
        .populate('ad', 'title imageUrls price');

    if (ioInstance && updatedThread) {
        updatedThread.participants.forEach(participant => {
            const userSocketRoom = `user_${participant.user._id}`;
            ioInstance.of('/chat').to(userSocketRoom).emit('newMessage', {
                message: mapMessageImageUrls(req, populatedMessage.toObject()),
                thread: updatedThread.toObject()
            });
            if (isNewThread || (participant.locallyDeletedAt && participant.locallyDeletedAt < updatedThread.updatedAt)) {
                ioInstance.of('/chat').to(userSocketRoom).emit('newThread', updatedThread.toObject());
            }
        });
    }

    res.status(201).json({
        success: true,
        message: 'Message envoyé avec succès.',
        data: {
            message: mapMessageImageUrls(req, populatedMessage.toObject()),
            threadId: currentThreadId // Renvoyer l'ID du thread est utile pour le client
        }
    });
});


/**
 * Marquer les messages d'un thread comme lus par l'utilisateur connecté.
 * POST /api/messages/threads/:threadId/read
 */
exports.markThreadAsRead = asyncHandler(async (req, res, next) => {
    const { threadId } = req.params;
    const userId = req.user.id;

    const thread = await Thread.findById(threadId);
    if (!thread || !thread.participants.find(p => p.user.toString() === userId)) {
        return next(new AppError('Thread non trouvé ou accès non autorisé.', 404));
    }

    // Mettre à jour le unreadCount pour cet utilisateur dans ce thread
    let participantUpdated = false;
    thread.participants.forEach(participant => {
        if (participant.user.toString() === userId && participant.unreadCount > 0) {
            participant.unreadCount = 0;
            participantUpdated = true;
        }
    });

    if (participantUpdated) {
        await thread.save({ validateBeforeSave: false });
    }

    // Mettre à jour les messages individuels comme lus (optionnel, dépend de la granularité souhaitée)
    await Message.updateMany(
        { threadId, senderId: { $ne: userId }, isRead: { $ne: true } }, // Marquer les messages reçus non lus
        { $set: { status: 'read' } } // Ou un champ `readBy: [{userId, readAt}]` pour plus de détails
    );

    // Émettre un événement Socket.IO pour informer les autres clients de la mise à jour du statut "lu"
    if (ioInstance) {
        // Informer l'expéditeur des messages que ses messages ont été lus par ce userId
        const otherParticipant = thread.participants.find(p => p.user.toString() !== userId);
        if (otherParticipant) {
            const recipientRoom = `user_${otherParticipant.user.toString()}`;
            ioInstance.of('/chat').to(recipientRoom).emit('messagesRead', { threadId, readerId: userId });
        }
    }


    logger.info(`Thread ${threadId} marqué comme lu pour l'utilisateur ${userId}`);
    res.status(200).json({
        success: true,
        message: 'Thread marqué comme lu.'
    });
});

/**
 * Supprimer une conversation localement pour l'utilisateur connecté.
 * DELETE /api/messages/threads/:threadId/local
 */
exports.deleteThreadLocally = asyncHandler(async (req, res, next) => {
    const { threadId } = req.params;
    const userId = req.user.id;

    const thread = await Thread.findOne({ _id: threadId, 'participants.user': userId });
    if (!thread) {
        return next(new AppError('Thread non trouvé ou accès non autorisé.', 404));
    }

    const participantIndex = thread.participants.findIndex(p => p.user.toString() === userId);
    if (participantIndex === -1) { // Ne devrait pas arriver si la requête ci-dessus réussit
        return next(new AppError('Utilisateur non trouvé dans ce thread.', 403));
    }

    thread.participants[participantIndex].locallyDeletedAt = Date.now();
    // Optionnel : si on veut aussi vider unreadCount lors de la suppression locale
    // thread.participants[participantIndex].unreadCount = 0;
    await thread.save({ validateBeforeSave: false });

    logger.info(`Thread ${threadId} supprimé localement pour l'utilisateur ${userId}`);
    res.status(200).json({
        success: true,
        message: 'Conversation supprimée de votre vue.',
    });
});


/**
 * Signaler un message.
 * POST /api/messages/messages/:messageId/report
 */
exports.reportMessage = asyncHandler(async (req, res, next) => {
    const { messageId } = req.params;
    const { reason } = req.body; // Raison optionnelle du signalement
    const reporterId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) {
        return next(new AppError('Message non trouvé.', 404));
    }

    // Logique de signalement :
    // - Marquer le message comme signalé
    // - Enregistrer le signalement (potentiellement dans une collection séparée 'Reports')
    // - Notifier les administrateurs/modérateurs

    message.isReported = true;
    // Vous pourriez vouloir ajouter des détails sur le signalement au message ou dans une collection Reports
    // message.reportDetails = { reportedBy: reporterId, reason: reason || 'Non spécifiée', reportedAt: Date.now() };
    await message.save({ validateBeforeSave: false });

    logger.info(`Message ${messageId} signalé par l'utilisateur ${reporterId}. Raison: ${reason || 'Non spécifiée'}`);
    // TODO: Créer une entrée dans une collection 'Reports'
    Report.create({ messageId, reportedBy: reporterId, reason, threadId: message.threadId, content: message.text });

    res.status(200).json({
        success: true,
        message: 'Message signalé. Notre équipe examinera la situation.'
    });
});
