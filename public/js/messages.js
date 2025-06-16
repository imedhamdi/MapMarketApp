// Simple real-time messaging client using Socket.IO
// This file replaces the previous HTTP based logic.

const socket = io();
let activeThread = null;

const threadList = document.getElementById('thread-list');
const messageList = document.getElementById('message-list');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

export function joinThread(threadId) {
  if (activeThread) {
    socket.emit('leaveThread', activeThread);
  }
  activeThread = threadId;
  socket.emit('joinThread', threadId);
}

socket.on('newMessage', (message) => {
  appendMessage(message);
});

function appendMessage(message) {
  const el = document.createElement('li');
  el.className = message.senderId === messageForm.dataset.userId ? 'message-sent' : 'message-received';
  el.textContent = message.content || message.text;
  messageList.appendChild(el);
  messageList.scrollTop = messageList.scrollHeight;
}

messageForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content || !activeThread) return;

  socket.emit('sendMessage', { threadId: activeThread, content });

  try {
    await fetch(`/api/messages/${activeThread}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
  } catch (err) {
    console.error('Erreur lors de l\'envoi du message', err);
  }

  messageInput.value = '';
});
