const messageController = require('./controllers/messageController');

let onlineUsers = new Map();

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log('Un utilisateur est connecté:', socket.id);

    socket.on('authenticate', (userId) => {
      if (userId) {
        onlineUsers.set(userId.toString(), socket.id);
        console.log(`Utilisateur ${userId} authentifié avec le socket ${socket.id}`);
        io.emit('onlineUsers', Array.from(onlineUsers.keys()));
      }
    });

    socket.on('joinThread', (threadId) => {
      socket.join(threadId);
      console.log(`Socket ${socket.id} a rejoint la conversation ${threadId}`);
    });

    socket.on('sendMessage', async ({ threadId, senderId, content }) => {
      const newMessage = await messageController.createMessageFromSocket(threadId, senderId, content);
      if (newMessage) {
        io.to(threadId).emit('newMessage', newMessage);
      }
    });

    socket.on('startTyping', ({ threadId, userId }) => {
      socket.to(threadId).broadcast.emit('userTyping', { threadId, userId });
    });

    socket.on('stopTyping', ({ threadId, userId }) => {
      socket.to(threadId).broadcast.emit('userStoppedTyping', { threadId, userId });
    });

    socket.on('markAsRead', async ({ threadId, userId }) => {
      await messageController.markThreadAsRead(threadId, userId);
      socket.emit('threadMarkedAsRead', threadId);
    });

    socket.on('disconnect', () => {
      console.log('Un utilisateur s\'est déconnecté:', socket.id);
      for (let [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          break;
        }
      }
      io.emit('onlineUsers', Array.from(onlineUsers.keys()));
    });
  });
};
