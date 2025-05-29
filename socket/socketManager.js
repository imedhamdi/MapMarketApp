// /socket/socketManager.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // Pour vérifier l'utilisateur du token
import Thread from '../models/Thread.js'; // Pour la logique de messageRead
import Message from '../models/Message.js'; // Pour la logique de messageRead
import { logger } from '../config/logger.js';

// Pour stocker les utilisateurs connectés et leurs sockets (simplifié)
// Dans un environnement de production avec plusieurs instances, utiliser Redis ou un adaptateur Socket.IO
const connectedUsers = new Map(); // Map<userId, socketId>

export default function initializeSocketIO(io) {
  // Middleware d'authentification pour Socket.IO
  io.use(async (socket, next) => {
    const token = socket.handshake.query?.token; // Récupérer le token depuis la query string de la connexion

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
          logger.warn(`Socket Auth: Utilisateur non trouvé pour token ID: ${decoded.id}`);
          return next(new Error('Authentification échouée: Utilisateur non trouvé.'));
        }
        if (user.changedPasswordAfter(decoded.iat)) {
          logger.warn(`Socket Auth: Mot de passe changé après émission token pour User ID: ${user._id}`);
          return next(new Error('Authentification échouée: Mot de passe changé.'));
        }

        socket.user = user; // Attacher l'utilisateur à l'objet socket
        logger.info(`Socket Auth: Utilisateur ID: ${user._id} authentifié pour socket ID: ${socket.id}`);
        next();
      } catch (err) {
        logger.error(`Socket Auth Error: ${err.message}`);
        next(new Error('Authentification échouée: Token invalide ou expiré.'));
      }
    } else {
      logger.warn('Socket Auth: Tentative de connexion sans token.');
      next(new Error('Authentification échouée: Token manquant.'));
    }
  });


  io.on('connection', (socket) => {
    logger.info(`Nouvelle connexion WebSocket: ${socket.id}, Utilisateur ID: ${socket.user?._id || 'Inconnu (pré-auth)'}`);

    // Stocker l'utilisateur connecté (après authentification réussie par le middleware io.use)
    if (socket.user) {
        connectedUsers.set(socket.user._id.toString(), socket.id);
        logger.info(`Utilisateur ID: ${socket.user._id} mappé au socket ID: ${socket.id}`);
    }


    // Gérer l'événement 'join' pour rejoindre un room de thread
    socket.on('join', ({ threadId }) => {
      if (!socket.user) {
        logger.warn(`Socket ID ${socket.id} a tenté de rejoindre un room sans être authentifié.`);
        return;
      }
      // Vérifier si l'utilisateur est un participant du thread avant de le laisser rejoindre
      Thread.findOne({ _id: threadId, participants: socket.user._id })
        .then(thread => {
          if (thread) {
            socket.join(threadId.toString());
            logger.info(`Utilisateur ID: ${socket.user._id} (Socket ID: ${socket.id}) a rejoint le room du thread: ${threadId}`);
          } else {
            logger.warn(`Utilisateur ID: ${socket.user._id} a tenté de rejoindre un room de thread invalide ou non autorisé: ${threadId}`);
          }
        })
        .catch(err => logger.error(`Erreur lors de la vérification du thread pour join room ${threadId}:`, err));
    });

    // Gérer l'événement 'sendMessage' (le message est déjà sauvegardé via API REST)
    // Le contrôleur REST émettra 'newMessage' au room approprié.
    // Cette section est plus pour la confirmation ou si le client émet directement.
    // Normalement, le client POST sur /api/messages/send, et le serveur émet.
    socket.on('sendMessage', async (data) => {
      if (!socket.user) return;
      const { threadId, text, receiverId /*, autres données si besoin */ } = data;
      logger.info(`Événement 'sendMessage' reçu de l'utilisateur ID: ${socket.user._id} pour thread: ${threadId}, texte: "${text}"`);
      
      // La logique de création de message est dans le contrôleur REST.
      // Ici, on pourrait juste re-diffuser si nécessaire, mais c'est redondant si le contrôleur le fait déjà.
      // Si le message est créé via API, l'API émettra 'newMessage'.
      // Si le client envoie 'sendMessage' directement au socket, il faudrait créer le message ici.
      // Pour la cohérence avec les endpoints REST, il est préférable que la création se fasse via l'API.
      // On peut utiliser cet événement pour des accusés de réception au client qui a envoyé, par exemple.
    });

    // Gérer l'événement 'messageRead'
    socket.on('messageRead', async (data) => {
      if (!socket.user) return;
      const { threadId, readerId /*, messageIds */ } = data; // readerId devrait être socket.user._id

      if (readerId !== socket.user._id.toString()) {
        logger.warn(`Socket ID ${socket.id} a tenté de marquer des messages comme lus pour un autre utilisateur.`);
        return;
      }

      try {
        const thread = await Thread.findOne({ _id: threadId, participants: socket.user._id });
        if (!thread) {
          logger.warn(`Utilisateur ID: ${socket.user._id} a tenté de marquer comme lus les messages d'un thread invalide: ${threadId}`);
          return;
        }

        // Mettre à jour les messages comme lus dans la DB (ceux où l'utilisateur est le destinataire)
        // et réinitialiser son compteur de non-lus pour ce thread.
        // Cette logique est aussi dans le contrôleur REST markThreadAsRead.
        // Il faut décider si c'est le client ou le serveur (via API) qui déclenche la mise à jour DB.
        // Ici, on suppose que le client émet 'messageRead' APRÈS que l'API ait marqué les messages.
        // Cet événement sert donc à notifier les autres participants.

        // Trouver l'ID de l'autre/des autres participant(s)
        const otherParticipantIds = thread.participants.filter(pId => pId.toString() !== socket.user._id.toString());

        otherParticipantIds.forEach(otherPId => {
            const otherSocketId = Array.from(connectedUsers.entries()).find(([userId, id]) => userId === otherPId.toString())?.[1];
            if (otherSocketId) {
                io.to(otherSocketId).emit('messageReadUpdate', {
                    threadId,
                    readerId: socket.user._id,
                    // messageIds: data.messageIds // Si le client envoie les IDs des messages spécifiques lus
                });
                logger.info(`Notification de lecture envoyée à l'utilisateur ID: ${otherPId} (Socket: ${otherSocketId}) pour le thread ${threadId}`);
            }
        });
        logger.info(`Utilisateur ID: ${socket.user._id} a marqué les messages du thread ${threadId} comme lus (événement WebSocket).`);

      } catch (error) {
        logger.error(`Erreur lors du traitement de 'messageRead' pour thread ${threadId}:`, error);
      }
    });


    socket.on('disconnect', () => {
      if (socket.user) {
        connectedUsers.delete(socket.user._id.toString());
        logger.info(`Utilisateur ID: ${socket.user._id} (Socket ID: ${socket.id}) déconnecté.`);
      } else {
        logger.info(`Socket ID: ${socket.id} déconnecté (utilisateur non authentifié).`);
      }
    });
  });
}
