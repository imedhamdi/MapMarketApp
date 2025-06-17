// MapMarketApp-1 (Copie)/socketHandler.js

// Importer uniquement le logger depuis la configuration Winston
const { logger } = require('./config/winston');
const jwt = require('jsonwebtoken');
const User = require('./models/userModel');

// CRUCIAL: Déclarer la Map ici pour qu'elle persiste entre les connexions
const userSocketMap = new Map();
const onlineUsers = new Map();

const socketHandler = (io) => {
  io.use(async (socket, next) => {
    try {
      const tokenWithBearer = socket.handshake.auth?.token;
      if (!tokenWithBearer || !tokenWithBearer.startsWith('Bearer ')) {
        logger.error('Socket Auth Error: Token not found or malformed');
        return next(new Error('Authentication error'));
      }

      const token = tokenWithBearer.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        logger.error(`Socket Auth Error: User ${decoded.id} not found`);
        return next(new Error('Authentication error'));
      }

      if (user.changedPasswordAfter(decoded.iat)) {
        logger.warn(`Socket Auth Error: password changed for user ${decoded.id}`);
        return next(new Error('Authentication error'));
      }

      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket Auth Error:', error.message);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id.toString();
    userSocketMap.set(userId, socket.id);
    onlineUsers.set(userId, { socketId: socket.id, name: socket.user.name });
    User.findByIdAndUpdate(userId, { isOnline: true }).catch((err) => logger.error('Presence update error:', err));
    logger.info(`User connected: ${userId} with socket ID: ${socket.id}`);
    io.emit('userStatusUpdate', { userId, statusText: 'en ligne' });

    socket.on('joinThread', (threadId) => {
      if (threadId) {
        socket.join(threadId);
        logger.info(`Socket ${socket.id} joined thread room ${threadId}`);
      }
    });

    socket.on('leaveThread', (threadId) => {
      if (threadId) socket.leave(threadId);
    });

    socket.on('sendMessage', async (data, callback) => {
        try {
            const { threadId, message, senderId } = data;
            if (!message || message.trim() === '') {
              return callback({ status: 'error', message: 'Le message ne peut pas être vide.' });
            }
            if (!threadId) {
              return callback({ status: 'error', message: 'threadId manquant.' });
            }

            logger.info(`Message from ${senderId} in thread ${threadId}: "${message}"`);

            io.to(threadId).emit('newMessage', {
                message,
                senderId,
                threadId,
                timestamp: new Date()
            });

            callback({ status: 'ok' });
        } catch (err) {
            logger.error('sendMessage Error:', err);
            callback({ status: 'error', message: "Erreur du serveur lors de l'envoi du message." });
        }
    });

    socket.on('typing_start', ({ threadId, userName }) => {
      socket.to(threadId).emit('user_typing', { userName });
    });

    socket.on('typing_stop', ({ threadId }) => {
      socket.to(threadId).emit('user_stopped_typing');
    });

    socket.on('disconnect', () => {
      userSocketMap.delete(userId);
      onlineUsers.delete(userId);
      User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() }).catch((err) => logger.error('Presence update error:', err));
      io.emit('userStatusUpdate', { userId, statusText: 'hors ligne' });
      logger.info(`User disconnected and removed from map: ${userId}`);
    });
  });
};

module.exports = socketHandler;
