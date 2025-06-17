// MapMarketApp-1 (Copie)/socketHandler.js

const logger = require('./config/winston');

// CRUCIAL: Déclarer la Map ici pour qu'elle persiste entre les connexions
const userSocketMap = new Map();

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    if (userId && userId !== 'null' && userId !== 'undefined') {
      userSocketMap.set(userId, socket.id);
      logger.info(`User connected: ${userId} with socket ID: ${socket.id}`);
      console.log('Current user map:', userSocketMap);
    }

    socket.on('sendMessage', (data) => {
        const { recipientId, message, senderId, threadId } = data;
        const recipientSocketId = userSocketMap.get(recipientId);

        logger.info(`Message from ${senderId} to ${recipientId}: "${message}"`);

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('newMessage', {
                message,
                senderId,
                threadId,
                timestamp: new Date()
            });
            logger.info(`Message successfully sent to recipient: ${recipientId}`);
        } else {
            logger.warn(`Recipient ${recipientId} is not connected. Message will be delivered on next login.`);
            // Ici, vous pourriez ajouter une logique pour les notifications push
        }
    });

    socket.on('disconnect', () => {
      // Itérer pour trouver l'utilisateur à supprimer
      for (let [uid, sid] of userSocketMap.entries()) {
        if (sid === socket.id) {
          userSocketMap.delete(uid);
          logger.info(`User disconnected and removed from map: ${uid}`);
          console.log('Current user map after disconnect:', userSocketMap);
          break;
        }
      }
    });
  });
};

module.exports = socketHandler;
