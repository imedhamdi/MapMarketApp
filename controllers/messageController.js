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
    if (req.user.blockedUsers?.some(id => id.toString() === recipientId)) {
        return next(new AppError(`Vous avez bloqué ${recipient.name}.`, 403));
    }
    if (recipient.blockedUsers?.some(id => id.toString() === initiatorId)) {
        return next(new AppError('Cet utilisateur vous a bloqué.', 403));
    }

    const ad = await Ad.findById(adId);
    if (!ad) return next(new AppError('Annonce introuvable.', 404));

    let thread = await Thread.findOrCreateThread(initiatorId, recipientId, adId);

    thread = await Thread.findById(thread._id)
        .populate('participants.user', 'name avatarUrl isOnline lastSeen')
        .populate('ad', 'title imageUrls price');

    const initiatorParticipant = thread.participants.find(p => p.user._id.toString() === initiatorId);
    if (initiatorParticipant && initiatorParticipant.locallyDeletedAt) {
        initiatorParticipant.locallyDeletedAt = undefined;
    }
    await thread.save({ validateBeforeSave: false });

    res.status(200).json({
        success: true,
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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20; // 20 conversations par page
    const skip = (page - 1) * limit;

    const pipeline = [
        { $match: { 'participants.user': userId, hiddenFor: { $ne: userId } } },
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
        { $sort: { updatedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
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
                pipeline: [{ $project: { title: 1, imageUrls: 1, price: 1, currency: 1 } }]
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
                    currency: { $arrayElemAt: ['$adDetails.currency', 0] },
                    imageUrls: { $arrayElemAt: ['$adDetails.imageUrls', 0] }
                },
                lastMessage: 1,
                unreadCount: '$currentUserParticipant.unreadCount',
                createdAt: 1,
                updatedAt: 1
            }
        }
    ];

    const threads = await Thread.aggregate(pipeline);

    const totalThreads = await Thread.countDocuments({
        'participants.user': userId,
        hiddenFor: { $ne: userId }
    });

    res.status(200).json({
        success: true,
        results: threads.length,
        pagination: {
            page,
            limit,
            total: totalThreads,
            totalPages: Math.ceil(totalThreads / limit)
        },
        data: { threads }
    });
});

/**
 * Récupère le nombre total de conversations non lues pour l'utilisateur.
 * GET /api/messages/threads/unread-count
 */
exports.getUnreadThreadCount = asyncHandler(async (req, res, next) => {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const threads = await Thread.find({
        'participants.user': userId,
        'participants.unreadCount': { $gt: 0 }
    }).select('participants');

    const unreadCount = threads.filter(thread => {
        const participant = thread.participants.find(p => p.user.equals(userId));
        return participant && participant.unreadCount > 0;
    }).length;

    res.status(200).json({
        success: true,
        data: {
            unreadCount: unreadCount
        }
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
 * Marquer les messages d'un thread comme lus par l'utilisateur connecté.
 * POST /api/messages/threads/:threadId/read
 */
exports.markThreadAsRead = asyncHandler(async (req, res, next) => {
    const { threadId } = req.params;
    const userId = req.user.id; // L'utilisateur qui lit les messages

    const thread = await Thread.findById(threadId);
    if (!thread || !thread.participants.find(p => p.user.toString() === userId)) {
        return next(new AppError('Thread non trouvé ou accès non autorisé.', 404));
    }

    // Marquer le compteur de non-lus de l'utilisateur à 0
    const participantIndex = thread.participants.findIndex(p => p.user.toString() === userId);
    if (participantIndex > -1 && thread.participants[participantIndex].unreadCount > 0) {
        thread.participants[participantIndex].unreadCount = 0;
        await thread.save({ validateBeforeSave: false });
    }

    // Mettre à jour le statut des messages que l'utilisateur a reçus dans ce thread
    const updateResult = await Message.updateMany(
        { threadId, senderId: { $ne: userId }, status: { $ne: 'read' } },
        { $set: { status: 'read' } }
    );

    logger.info(`Thread ${threadId}: ${updateResult.modifiedCount} message(s) marqué(s) comme lu(s) pour le destinataire ${userId}.`);

    // Si des messages ont été mis à jour, notifier l'autre participant
    if (updateResult.modifiedCount > 0) {
        const otherParticipant = thread.participants.find(p => p.user.toString() !== userId);
        if (otherParticipant && ioInstance) {
            const recipientRoom = `user_${otherParticipant.user.toString()}`;
            ioInstance.of('/chat').to(recipientRoom).emit('messagesRead', {
                threadId,
                readerId: userId
            });
            logger.info(`Événement 'messagesRead' émis à la room ${recipientRoom} pour le thread ${threadId}`);
        }
    }
    
    const totalUnreadCount = await Thread.countDocuments({
        'participants.user': userId,
        'participants.unreadCount': { $gt: 0 }
    });

    logger.info(`Envoi du décompte de threads non lus mis à jour (${totalUnreadCount}) à l'utilisateur ${userId}`);

    res.status(200).json({
        success: true,
        message: 'Thread marqué comme lu.',
        data: {
            unreadThreadCount: totalUnreadCount
        }
    });

    if (ioInstance) {
        ioInstance.of('/chat').to(`user_${userId}`).emit('unreadCountUpdated', { unreadThreadCount: totalUnreadCount });
    }
});

/**
 * Mettre à jour les messages comme lus via API.
 * PUT /api/messages/read/:threadId
 */
exports.markMessagesAsRead = asyncHandler(async (req, res, next) => {
    const { threadId } = req.params;
    const userId = req.user.id;

    const result = await Message.updateMany(
        { threadId, senderId: { $ne: userId }, status: { $ne: 'read' } },
        { $set: { status: 'read' } }
    );

    if (result.modifiedCount === 0) {
        return res.status(204).send();
    }

    const updatedMessages = await Message.find({ threadId, senderId: { $ne: userId }, status: 'read' });

    const thread = await Thread.findById(threadId).populate('participants.user');
    const otherParticipant = thread.participants.find(p => p.user._id.toString() !== userId);

    if (otherParticipant && ioInstance) {
        const room = `user_${otherParticipant.user._id}`;
        ioInstance.of('/chat').to(room).emit('messagesRead', {
            threadId,
            messages: updatedMessages.map(m => ({ _id: m._id, status: m.status }))
        });
    }

    await Thread.findOneAndUpdate(
        { _id: threadId, 'participants.user': userId },
        { $set: { 'participants.$[elem].unreadCount': 0 } },
        { arrayFilters: [{ 'elem.user': userId }] }
    );

    res.status(200).json({
        status: 'success',
        data: { messages: updatedMessages }
    });
});

/**
 * Masque une conversation pour l'utilisateur connecté (soft delete).
 * PATCH /api/messages/threads/:threadId/local
 */
exports.deleteThreadLocally = asyncHandler(async (req, res, next) => {
    await Thread.findByIdAndUpdate(req.params.threadId, {
        $addToSet: { hiddenFor: req.user.id }
    });

    logger.info(`Thread ${req.params.threadId} masqué pour l'utilisateur ${req.user.id}`);
    res.status(200).json({
        success: true,
        message: 'Conversation masquée avec succès.'
    });
});

exports.acceptOffer = asyncHandler(async (req, res, next) => {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);
    if (!message || message.type !== 'offer') {
        return next(new AppError('Offre non trouvée.', 404));
    }
    message.metadata.status = 'accepted';
    await message.save();

    const systemMsg = await Message.create({
        threadId: message.threadId,
        senderId: req.user.id,
        type: 'system',
        text: 'Offre acceptée',
        metadata: { offer: messageId }
    });

    const populatedSystem = await Message.findById(systemMsg._id).populate('senderId', 'name avatarUrl');
    if (ioInstance) {
        const thread = await Thread.findById(message.threadId).populate('participants.user', 'name avatarUrl isOnline lastSeen');
        thread.participants.forEach(p => {
            ioInstance.of('/chat').to(`user_${p.user._id}`).emit('newMessage', {
                message: populatedSystem.toObject(),
                thread: thread.toObject()
            });
        });
    }

    res.status(200).json({ success: true, message: 'Offre acceptée.' });
});

exports.declineOffer = asyncHandler(async (req, res, next) => {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);
    if (!message || message.type !== 'offer') {
        return next(new AppError('Offre non trouvée.', 404));
    }
    message.metadata.status = 'declined';
    await message.save();

    const systemMsg = await Message.create({
        threadId: message.threadId,
        senderId: req.user.id,
        type: 'system',
        text: 'Offre refusée',
        metadata: { offer: messageId }
    });

    const populatedSystem = await Message.findById(systemMsg._id).populate('senderId', 'name avatarUrl');
    if (ioInstance) {
        const thread = await Thread.findById(message.threadId).populate('participants.user', 'name avatarUrl isOnline lastSeen');
        thread.participants.forEach(p => {
            ioInstance.of('/chat').to(`user_${p.user._id}`).emit('newMessage', {
                message: populatedSystem.toObject(),
                thread: thread.toObject()
            });
        });
    }

    res.status(200).json({ success: true, message: 'Offre refusée.' });
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
