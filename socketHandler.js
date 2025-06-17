/**
 * Gestionnaire principal des événements Socket.IO.
 * Définit l'ensemble des listeners utilisés pour la messagerie temps réel.
 */
const Thread = require('./models/threadModel');
const Message = require('./models/messageModel');

/** Map des utilisateurs connectés -> socketId */
const connectedUsers = new Map();

module.exports = function(io) {
  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    console.log(`User connected via socket: ${socket.id} - UserID: ${userId}`);

    connectedUsers.set(userId, socket.id);

    socket.join(userId);

    socket.on('joinThread', (threadId) => {
      socket.join(threadId);
      console.log(`User ${userId} joined thread room: ${threadId}`);
    });

    socket.on('leaveThread', (threadId) => {
      socket.leave(threadId);
      console.log(`User ${userId} left thread room: ${threadId}`);
    });

    socket.on('sendMessage', async (data) => {
      const { threadId, content, recipientId } = data;

      if (!threadId || !content || !recipientId) {
        socket.emit('error', { message: 'Missing data for sendMessage' });
        return;
      }
      try {
        const message = new Message({
          thread: threadId,
          sender: socket.user.id,
          content: content,
        });
        await message.save();

        await Thread.findByIdAndUpdate(threadId, { lastMessage: message._id });

        const populatedMessage = await Message.findById(message._id).populate('sender', 'username profilePicture');

        io.to(threadId).emit('newMessage', populatedMessage);

        if (connectedUsers.has(recipientId.toString())) {
          io.to(recipientId.toString()).emit('newMessageNotification', {
            message: populatedMessage,
            threadId: threadId
          });
        }
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Indicateur de saisie
    socket.on('typing_start', ({ threadId }) => {
      socket.to(threadId).emit('user_typing', {
        username: socket.user?.name || 'Utilisateur'
      });
    });

    socket.on('typing_stop', ({ threadId }) => {
      socket.to(threadId).emit('user_stopped_typing');
    });

    // Confirmation de lecture
    socket.on('message_read', async ({ messageId, threadId }) => {
      try {
        await Message.findByIdAndUpdate(messageId, { status: 'read' });
        io.to(threadId).emit('message_status_updated', {
          messageId,
          status: 'read'
        });
      } catch (err) {
        console.error('Error updating read status:', err);
        socket.emit('chat_error', 'Failed to update read status');
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      if (socket.user && socket.user.id) {
        connectedUsers.delete(userId);
      }
    });
  });
};
