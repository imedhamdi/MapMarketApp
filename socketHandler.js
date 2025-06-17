const Thread = require('./models/threadModel');
const Message = require('./models/messageModel');

const userSockets = new Map();

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log(`User connected via socket: ${socket.id} - UserID: ${socket.user.id}`);

    userSockets.set(socket.user.id.toString(), socket.id);

    socket.join(socket.user.id.toString());

    socket.on('joinThread', (threadId) => {
      socket.join(threadId);
      console.log(`User ${socket.user.id} joined thread room: ${threadId}`);
    });

    socket.on('leaveThread', (threadId) => {
      socket.leave(threadId);
      console.log(`User ${socket.user.id} left thread room: ${threadId}`);
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

        if (userSockets.has(recipientId.toString())) {
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

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      if (socket.user && socket.user.id) {
        userSockets.delete(socket.user.id.toString());
      }
    });
  });
};
