// /controllers/messageController.js
import Message from '../models/Message.js';
import Thread from '../models/Thread.js';
import User from '../models/User.js'; // Pour peupler les infos
import AppError from '../utils/appError.js';
import { logger } from '../config/logger.js';
import APIFeatures from '../utils/apiFeatures.js';
import mongoose from 'mongoose';


/**
 * Contrôleur pour récupérer les fils de discussion de l'utilisateur connecté.
 * Trie les threads par la date du dernier message (updatedAt du thread).
 */
export const getThreads = async (req, res, next) => {
  try {
    const threads = await Thread.find({ participants: req.user.id })
      .populate({
        path: 'participants',
        select: 'username avatarUrl' // Ne pas peupler l'utilisateur courant ici, mais l'autre participant
      })
      .populate({
        path: 'lastMessage',
        select: 'text senderId createdAt isRead' // Pour afficher un aperçu
      })
      .populate({ // Si le thread est lié à un item
        path: 'itemContext',
        select: 'title images category'
      })
      .sort('-updatedAt'); // Trier par la dernière activité

    // Formater les threads pour le frontend
    const formattedThreads = threads.map(thread => {
      const otherParticipant = thread.participants.find(p => p._id.toString() !== req.user.id.toString());
      // Calculer le unreadCount pour l'utilisateur courant dans ce thread spécifique
      // Le modèle Thread stocke unreadCounts: Map<userId, count>
      const unreadCountForCurrentUser = thread.unreadCounts?.get(req.user.id.toString()) || 0;

      return {
        id: thread._id,
        // user1Id: thread.participants[0]._id, // Moins utile si on a déjà otherParticipant
        // user2Id: thread.participants[1]._id,
        user2Name: otherParticipant ? otherParticipant.username : 'Utilisateur Supprimé',
        user2Avatar: otherParticipant ? otherParticipant.avatarUrl : `https://ui-avatars.com/api/?name=?&background=random&color=fff&size=48`,
        lastMessage: thread.lastMessage ? thread.lastMessage.text : 'Aucun message échangé.',
        timestamp: thread.lastMessage ? thread.lastMessage.createdAt : thread.updatedAt,
        unreadCount: unreadCountForCurrentUser,
        itemContext: thread.itemContext ? {
          id: thread.itemContext._id,
          title: thread.itemContext.title,
          image: thread.itemContext.images && thread.itemContext.images.length > 0 ? thread.itemContext.images[0] : null
        } : null,
        // Ajouter les IDs des participants pour la logique client si besoin
        participantIds: thread.participants.map(p => p._id)
      };
    });

    logger.info(`Récupération de ${formattedThreads.length} fils de discussion pour l'utilisateur ID: ${req.user.id}`);
    res.status(200).json({
      status: 'success',
      results: formattedThreads.length,
      threads: formattedThreads
    });
  } catch (error) {
    logger.error(`Erreur lors de la récupération des fils de discussion pour l'utilisateur ID: ${req.user.id}:`, error);
    next(error);
  }
};

/**
 * Contrôleur pour récupérer les messages d'un fil de discussion spécifique.
 */
export const getMessagesForThread = async (req, res, next) => {
  try {
    const { threadId } = req.params;

    // Vérifier si l'utilisateur est un participant du thread
    const thread = await Thread.findOne({ _id: threadId, participants: req.user.id });
    if (!thread) {
      logger.warn(`Tentative d'accès non autorisé au thread ID: ${threadId} par l'utilisateur ID: ${req.user.id}`);
      return next(new AppError('Fil de discussion non trouvé ou accès non autorisé.', 404));
    }

    // Récupérer les messages, triés par date de création
    const messages = await Message.find({ threadId })
      .populate({ path: 'senderId', select: 'username avatarUrl' }) // Peupler l'expéditeur
      .sort('createdAt');

    logger.info(`Récupération de ${messages.length} messages pour le thread ID: ${threadId} par l'utilisateur ID: ${req.user.id}`);
    res.status(200).json({
      status: 'success',
      results: messages.length,
      messages
    });
  } catch (error) {
    logger.error(`Erreur lors de la récupération des messages pour le thread ID: ${req.params.threadId}:`, error);
    if (error.name === 'CastError') return next(new AppError('ID de thread invalide.', 400));
    next(error);
  }
};

/**
 * Contrôleur pour envoyer un message.
 * Crée un nouveau thread si nécessaire.
 */
export const sendMessage = async (req, res, next) => {
  try {
    const senderId = req.user.id;
    const { text, receiverId, itemContextId } = req.body;
    let { threadId } = req.body; // Peut être undefined si c'est un nouveau message direct

    if (!text || text.trim() === '') {
      return next(new AppError('Le message ne peut pas être vide.', 400));
    }
    if (!receiverId && !threadId) {
        return next(new AppError('Destinataire ou fil de discussion requis.', 400));
    }
    if (receiverId === senderId) {
        return next(new AppError('Vous ne pouvez pas vous envoyer de message à vous-même.', 400));
    }


    let thread;

    if (threadId) {
      thread = await Thread.findOne({ _id: threadId, participants: senderId });
      if (!thread) {
        return next(new AppError('Fil de discussion non trouvé ou accès non autorisé.', 404));
      }
    } else if (receiverId) {
      // Tenter de trouver un thread existant entre les deux utilisateurs, potentiellement lié à cet item
      // Pour éviter les doublons, on trie les IDs des participants
      const participants = [senderId, receiverId].sort();
      const query = { participants: { $all: participants, $size: 2 } };
      if (itemContextId) {
        query.itemContext = itemContextId;
      } else {
        query.itemContext = null; // Chercher un thread général s'il n'y a pas de contexte d'item
      }

      thread = await Thread.findOne(query);

      if (!thread) {
        // Créer un nouveau thread
        const newThreadData = { participants };
        if (itemContextId) {
          const item = await Item.findById(itemContextId);
          if (!item) return next(new AppError('Article de contexte non trouvé.', 404));
          newThreadData.itemContext = itemContextId;
        }
        // Initialiser unreadCounts pour le nouveau thread
        newThreadData.unreadCounts = new Map();
        newThreadData.unreadCounts.set(receiverId.toString(), 1); // Le destinataire a 1 message non lu
        newThreadData.unreadCounts.set(senderId.toString(), 0); // L'expéditeur n'a pas de message non lu (il vient de l'envoyer)

        thread = await Thread.create(newThreadData);
        logger.info(`Nouveau thread ID: ${thread._id} créé entre ${senderId} et ${receiverId}.`);
      }
      threadId = thread._id; // Utiliser l'ID du thread trouvé ou créé
    }

    // Créer le message
    const message = await Message.create({
      threadId,
      senderId,
      receiverId: thread.participants.find(p => p.toString() !== senderId.toString()), // L'autre participant
      text
    });

    // Le hook post('save') sur le modèle Message mettra à jour thread.lastMessage et thread.updatedAt
    // et les unreadCounts.

    // Émettre l'événement WebSocket via le gestionnaire Socket.IO
    // req.io est attaché dans server.js ou un middleware si vous passez l'instance io
    if (req.io) {
      const populatedMessage = await Message.findById(message._id).populate('senderId', 'username avatarUrl');
      
      // Émettre à tous les participants du thread, y compris l'expéditeur (pour la synchro)
      thread.participants.forEach(participantId => {
        // Trouver les sockets de ce participant
        // Cela nécessite une gestion des sockets connectés par userId dans socketManager.js
        // Pour l'instant, on émet à un "room" nommé d'après le threadId
        req.io.to(threadId.toString()).emit('newMessage', populatedMessage);
      });
      logger.info(`Message ID: ${message._id} émis via WebSocket au thread ID: ${threadId}`);
    } else {
        logger.warn('Instance req.io non trouvée. Impossible d\'émettre le message via WebSocket.');
    }


    res.status(201).json({
      status: 'success',
      message // Renvoyer le message créé
    });
  } catch (error) {
    logger.error(`Erreur lors de l'envoi du message par l'utilisateur ID: ${req.user?.id}:`, error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return next(new AppError(error.message, 400));
    }
    next(error);
  }
};

/**
 * Contrôleur pour marquer les messages d'un thread comme lus pour l'utilisateur connecté.
 */
export const markThreadAsRead = async (req, res, next) => {
    try {
        const { threadId } = req.params;
        const userId = req.user.id;

        const thread = await Thread.findOne({ _id: threadId, participants: userId });
        if (!thread) {
            return next(new AppError('Fil de discussion non trouvé ou accès non autorisé.', 404));
        }

        // Mettre à jour les messages comme lus (ceux où l'utilisateur est le destinataire)
        await Message.updateMany(
            { threadId, receiverId: userId, isRead: false },
            { $set: { isRead: true } }
        );

        // Réinitialiser le compteur de messages non lus pour cet utilisateur dans ce thread
        if (thread.unreadCounts && thread.unreadCounts.get(userId.toString()) > 0) {
            thread.unreadCounts.set(userId.toString(), 0);
            thread.markModified('unreadCounts'); // Important pour les Map Mongoose
            await thread.save({ validateBeforeSave: false }); // Sauvegarder le thread
        }
        
        // Informer les autres participants via WebSocket que les messages ont été lus
        if (req.io) {
            // Trouver l'ID de l'autre participant
            const otherParticipantId = thread.participants.find(p => p.toString() !== userId.toString());
            if (otherParticipantId) {
                // Émettre à l'autre participant (ou à tous dans le room du thread)
                // L'événement 'messageReadUpdate' devrait indiquer quels messages ont été lus par qui.
                // Pour simplifier, on peut juste indiquer que l'utilisateur a lu le thread.
                req.io.to(threadId.toString()).emit('messageReadUpdate', {
                    threadId,
                    readerId: userId,
                    // messageIds: [ tableau des IDs des messages lus ] // Optionnel, plus précis
                });
                 logger.info(`Événement messageReadUpdate émis pour thread ${threadId}, lecteur ${userId}`);
            }
        }


        logger.info(`Messages du thread ID: ${threadId} marqués comme lus pour l'utilisateur ID: ${userId}`);
        res.status(200).json({
            status: 'success',
            message: 'Messages marqués comme lus.'
        });
    } catch (error) {
        logger.error(`Erreur lors du marquage des messages comme lus pour le thread ID: ${req.params.threadId}:`, error);
        next(error);
    }
};


// Les fonctions deleteMessage et deleteThread sont optionnelles car non explicitement demandées par le frontend.
// Leur implémentation nécessiterait une logique de "soft delete" ou de masquage pour l'utilisateur.
export const deleteMessage = async (req, res, next) => {
    // Logique pour supprimer (soft) un message
    return next(new AppError('Fonctionnalité non implémentée.', 501));
};
export const deleteThread = async (req, res, next) => {
    // Logique pour supprimer (soft/masquer) un thread pour un utilisateur
    return next(new AppError('Fonctionnalité non implémentée.', 501));
};

