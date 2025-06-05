// controllers/messageController.js
const Thread = require('../models/threadModel');
const Message = require('../models/messageModel');
const User = require('../models/userModel');
const Ad = require('../models/adModel');
const Report = require('../models/reportModel');
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

    if (!recipientId) {
        return next(new AppError('L\'ID du destinataire est requis.', 400));
    }
    if (recipientId === initiatorId) {
        return next(new AppError('Vous ne pouvez pas démarrer une discussion avec vous-même.', 400));
    }

    // Vérifier si le destinataire existe et n'est pas bloqué/ne bloque pas
    const recipient = await User.findById(recipientId);
    if (!recipient) {
        return next(new AppError('Destinataire non trouvé.', 404));
    }
    if (req.user.blockedUsers && req.user.blockedUsers.includes(recipientId)) {
        return next(new AppError(`Vous avez bloqué cet utilisateur. Débloquez ${recipient.name} pour démarrer une discussion.`, 403));
    }
    if (recipient.blockedUsers && recipient.blockedUsers.includes(initiatorId)) {
        return next(new AppError('Cet utilisateur vous a bloqué. Vous ne pouvez pas démarrer de discussion.', 403));
    }
    
    let ad = null;
    if (adId) {
        ad = await Ad.findById(adId);
        if (!ad) return next(new AppError('Annonce non trouvée.', 404));
    }

    // Utiliser la méthode statique du modèle Thread
    let thread = await Thread.findOrCreateThread(initiatorId, recipientId, adId);

    // Populate les participants et l'annonce pour la réponse
    thread = await Thread.findById(thread._id)
        .populate('participants.user', 'name avatarUrl')
        .populate('ad', 'title imageUrls price');

    // Réinitialiser locallyDeletedAt pour les deux participants s'ils ouvrent le thread
    thread.participants.forEach(p => {
        p.locallyDeletedAt = undefined;
    });
    await thread.save({validateBeforeSave: false});


    res.status(200).json({ // 200 si trouvé, 201 si créé (findOrCreate gère cela)
        success: true,
        message: 'Thread récupéré ou initié avec succès.',
        data: {
            thread
        }
    });
});


/**
 * Récupérer tous les threads de discussion pour l'utilisateur connecté.
 * GET /api/messages/threads
 * Query: page, limit, sort
 */
exports.getMyThreads = asyncHandler(async (req, res, next) => {
    const userId = req.user.id;

    // Filtrer les threads où l'utilisateur n'a pas fait de suppression locale
    // ou où la suppression locale est antérieure au dernier message (updatedAt)
    const threadFilter = {
        'participants.user': userId,
        $or: [
            { 'participants.$.locallyDeletedAt': { $exists: false } },
            { 
                $expr: { 
                    $lt: [ '$participants.$.locallyDeletedAt', '$updatedAt' ] 
                } 
            }
        ]
    };
    // La requête ci-dessus avec $expr et $ est complexe pour un filtre direct sur un champ de tableau.
    // Une approche plus simple est de filtrer après récupération ou d'utiliser une agrégation.
    // Pour l'instant, on récupère tous les threads où l'utilisateur est participant,
    // et le client peut filtrer ceux marqués comme "supprimés localement" si updatedAt n'est pas plus récent.
    // Ou, mieux, on ajuste la requête:
    const userThreads = await Thread.find({
        'participants.user': userId,
        // On veut les threads où pour CET utilisateur, soit locallyDeletedAt n'existe pas,
        // soit locallyDeletedAt est plus ancien que le dernier message (updatedAt du thread)
    }).populate('participants.user', 'name avatarUrl isOnline lastSeen') // Populer les infos des participants
      .populate('ad', 'title imageUrls') // Populer les infos de l'annonce si liée
      .sort({ updatedAt: -1 }); // Trier par le plus récent message

    // Filtrer manuellement les threads supprimés localement par l'utilisateur
    const filteredThreads = userThreads.filter(thread => {
        const participantData = thread.participants.find(p => p.user._id.toString() === userId);
        if (!participantData) return false; // Ne devrait pas arriver
        return !participantData.locallyDeletedAt || (participantData.locallyDeletedAt < thread.updatedAt);
    });
    
    // TODO: Appliquer la pagination sur filteredThreads si nécessaire après le filtrage manuel.
    // Pour l'instant, on renvoie tous les threads non supprimés localement.

    res.status(200).json({
        success: true,
        results: filteredThreads.length,
        data: {
            threads: filteredThreads
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
 * Envoyer un message (texte ou image).
 * POST /api/messages/messages (pour texte)
 * POST /api/messages/messages/image (pour image, géré par Multer avant)
 */
exports.sendMessage = asyncHandler(async (req, res, next) => {
    const { threadId, recipientId, text } = req.body;
    const senderId = req.user.id;
    let currentThreadId = threadId;
    let isNewThread = false;

    if (!currentThreadId && !recipientId) {
        return next(new AppError('Un ID de thread ou un ID de destinataire est requis.', 400));
    }
    if (!text && !req.file) { // req.file vient de Multer pour les images
        return next(new AppError('Un message ne peut pas être vide (texte ou image requis).', 400));
    }
    
    // Vérifier le blocage avant d'envoyer
    let finalRecipientId = recipientId;
    if (currentThreadId) {
        const tempThread = await Thread.findById(currentThreadId).populate('participants.user', 'blockedUsers');
        if (!tempThread) return next(new AppError('Thread non trouvé.', 404));
        const otherParticipant = tempThread.participants.find(p => p.user._id.toString() !== senderId);
        if (!otherParticipant) return next(new AppError('Destinataire non trouvé dans le thread.', 404));
        finalRecipientId = otherParticipant.user._id.toString();

        if (req.user.blockedUsers && req.user.blockedUsers.includes(finalRecipientId)) {
            return next(new AppError(`Vous avez bloqué cet utilisateur.`, 403));
        }
        if (otherParticipant.user.blockedUsers && otherParticipant.user.blockedUsers.includes(senderId)) {
            return next(new AppError('Cet utilisateur vous a bloqué.', 403));
        }
    } else if (recipientId) { // Nouveau thread
        const recipientUser = await User.findById(recipientId);
        if (!recipientUser) return next(new AppError('Destinataire non trouvé.', 404));
        if (req.user.blockedUsers && req.user.blockedUsers.includes(recipientId)) {
            return next(new AppError(`Vous avez bloqué cet utilisateur.`, 403));
        }
        if (recipientUser.blockedUsers && recipientUser.blockedUsers.includes(senderId)) {
            return next(new AppError('Cet utilisateur vous a bloqué.', 403));
        }
    }


    // Si pas de threadId, c'est un nouveau message direct, trouver ou créer le thread
    if (!currentThreadId && recipientId) {
        const adId = req.body.adId || null; // adId est optionnel pour initier un chat
        const thread = await Thread.findOrCreateThread(senderId, recipientId, adId);
        currentThreadId = thread._id;
        isNewThread = !thread.lastMessage; // Considérer comme nouveau si pas de dernier message
    }

    const messageData = {
        threadId: currentThreadId,
        senderId,
        text: text || null, // Peut être null si c'est une image
    };

    if (req.file) { // Si une image est uploadée (via /messages/image)
        messageData.imageUrl = path.join('messages', req.file.filename).replace(/\\/g, '/');
    }

    const newMessage = await Message.create(messageData);
    const populatedMessage = await Message.findById(newMessage._id).populate('senderId', 'name avatarUrl');

    // Mettre à jour le thread (lastMessage, unreadCounts) - le hook post-save de Message le fait déjà.
    // Mais on a besoin des infos du thread mis à jour pour Socket.IO.
    const updatedThread = await Thread.findById(currentThreadId)
                                .populate('participants.user', 'name avatarUrl isOnline lastSeen')
                                .populate('ad', 'title');

    // Émission Socket.IO
    if (ioInstance && updatedThread) {
        updatedThread.participants.forEach(participant => {
            const userSocketRoom = `user_${participant.user._id.toString()}`;
            // Envoyer l'événement de nouveau message
            ioInstance.of('/chat').to(userSocketRoom).emit('newMessage', {
                message: mapMessageImageUrls(req, populatedMessage.toObject()),
                thread: updatedThread.toObject() // Envoyer le thread mis à jour (avec unreadCount)
            });
            // Si c'est un nouveau thread pour ce participant (ou réactivé)
            if (isNewThread || (participant.locallyDeletedAt && participant.locallyDeletedAt < updatedThread.updatedAt)) {
                 ioInstance.of('/chat').to(userSocketRoom).emit('newThread', updatedThread.toObject());
            }
        });
    }
    
    // Optionnel : Notification par email (simulée)
    // const recipient = updatedThread.participants.find(p => p.user._id.toString() !== senderId).user;
    // const sender = await User.findById(senderId);
    // if (recipient && sender && recipient.settings?.notifications?.emailEnabled) {
    //    logger.info(`SIMULATION: Envoi email à ${recipient.email} pour nouveau message de ${sender.name}`);
    // }


    res.status(201).json({
        success: true,
        message: 'Message envoyé avec succès.',
        data: {
            message: mapMessageImageUrls(req, populatedMessage.toObject())
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
    // Enregistrer le signalement dans la collection Reports
    await Report.create({
        messageId,
        reportedBy: reporterId,
        reason,
        threadId: message.threadId,
        content: message.text
    });

    res.status(200).json({
        success: true,
        message: 'Message signalé. Notre équipe examinera la situation.'
    });
});
