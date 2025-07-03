let socket;
import * as state from './state.js';
import { appendNewMessage, showTypingIndicator, hideTypingIndicator, updateUnreadBadge } from './messages.js';

const chat = {
  initialize: () => {
    if (state.getCurrentUser() && !socket) {
      socket = io({ autoConnect: false });
      socket.connect();

      socket.on('connect', () => {
        console.log('Connecté au serveur WebSocket avec l\'ID:', socket.id);
        const user = state.getCurrentUser();
        if (user) socket.emit('authenticate', user._id || user.id);
      });

      socket.on('newMessage', (message) => {
        appendNewMessage(message);
        updateUnreadBadge(message.thread);
      });

      socket.on('userTyping', ({ threadId, userId }) => {
        if (state.get('currentThreadId') === threadId) {
          showTypingIndicator(userId);
        }
      });

      socket.on('userStoppedTyping', ({ threadId, userId }) => {
        if (state.get('currentThreadId') === threadId) {
          hideTypingIndicator(userId);
        }
      });
    }
  },

  joinThread: (threadId) => {
    if (socket) {
      socket.emit('joinThread', threadId);
      state.set('currentThreadId', threadId);
    }
  },

  sendMessage: (threadId, content) => {
    if (socket) {
      const user = state.getCurrentUser();
      socket.emit('sendMessage', { threadId, senderId: user._id || user.id, content });
    }
  },

  startTyping: (threadId) => {
    const user = state.getCurrentUser();
    if (socket) socket.emit('startTyping', { threadId, userId: user._id || user.id });
  },

  stopTyping: (threadId) => {
    const user = state.getCurrentUser();
    if (socket) socket.emit('stopTyping', { threadId, userId: user._id || user.id });
  },

  markAsRead: (threadId) => {
    const user = state.getCurrentUser();
    if (socket) socket.emit('markAsRead', { threadId, userId: user._id || user.id });
  }
};

export default chat;
