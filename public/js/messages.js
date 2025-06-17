/**
 * @file messages.js
 * @description Version WebSocket (Socket.IO) de la messagerie instantanée de MapMarket.
 * Cette version supprime tout le polling et repose sur la communication en temps réel.
 */

// Socket.IO est chargé via le CDN dans index.html et exposé globalement sous la variable `io`.
import * as state from './state.js';
import { fetchInitialUnreadCount } from './main.js';
import {
  showToast,
  secureFetch,
  toggleGlobalLoader,
  sanitizeHTML,
  formatDate,
  formatCurrency,
  generateUUID
} from './utils.js';

// --- Constantes ---
const API_MESSAGES_URL = '/api/messages';
const SOCKET_NAMESPACE = '/chat';
const socket = io(SOCKET_NAMESPACE);
const MAX_IMAGE_SIZE_MB = 2;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TYPING_TIMEOUT = 3000;

// --- Éléments du DOM ---
let messagesModal, threadListView, chatView, threadListUl, threadItemTemplate, noThreadsPlaceholder;
let backToThreadsBtn, chatRecipientAvatar, chatRecipientName, chatRecipientStatus, chatOptionsBtn, chatOptionsMenu, blockUserChatBtn, deleteChatBtn;
let chatForm, chatInput, chatMessages, chatSendBtn, fileInput;

let typingTimeout;
let currentThreadId = null;
let currentRecipientId = null;
let typing = false;

// --- Initialisation ---
export function initMessagesUI() {
  messagesModal = document.getElementById('messagesModal');
  threadListView = document.getElementById('threadListView');
  chatView = document.getElementById('chatView');
  threadListUl = document.getElementById('threadList');
  threadItemTemplate = document.getElementById('threadItemTemplate');
  noThreadsPlaceholder = document.getElementById('noThreadsPlaceholder');

  backToThreadsBtn = document.getElementById('backToThreadsBtn');
  chatRecipientAvatar = document.getElementById('chatRecipientAvatar');
  chatRecipientName = document.getElementById('chatRecipientName');
  chatRecipientStatus = document.getElementById('chatRecipientStatus');
  chatOptionsBtn = document.getElementById('chatOptionsBtn');
  chatOptionsMenu = document.getElementById('chatOptionsMenu');
  blockUserChatBtn = document.getElementById('blockUserChatBtn');
  deleteChatBtn = document.getElementById('deleteChatBtn');

  chatForm = document.getElementById('chatForm');
  chatInput = document.getElementById('chatInput');
  chatMessages = document.getElementById('chatMessages');
  chatSendBtn = document.getElementById('chatSendBtn');
  fileInput = document.getElementById('fileInput');

  addEventListeners();
  fetchThreads();
}

// --- Événements UI ---
function addEventListeners() {
  chatForm.addEventListener('submit', sendMessage);
  chatInput.addEventListener('input', emitTyping);
  backToThreadsBtn.addEventListener('click', () => switchView('threads'));
  fileInput.addEventListener('change', handleFileUpload);
}

function switchView(view) {
  threadListView.style.display = view === 'threads' ? 'block' : 'none';
  chatView.style.display = view === 'chat' ? 'block' : 'none';
}

// --- Threads ---
async function fetchThreads() {
  try {
    const threads = await secureFetch(`${API_MESSAGES_URL}/threads`);
    renderThreads(threads);
  } catch (error) {
    showToast('Erreur lors du chargement des discussions');
  }
}

function renderThreads(threads) {
  threadListUl.innerHTML = '';
  threads.forEach(thread => {
    const clone = threadItemTemplate.content.cloneNode(true);
    const item = clone.querySelector('.thread-item');
    item.dataset.threadId = thread._id;
    item.addEventListener('click', () => openThread(thread));
    item.querySelector('.thread-name').textContent = thread.otherUser?.name || 'Utilisateur';
    item.querySelector('.thread-last-message').textContent = thread.lastMessage?.text || '';
    threadListUl.appendChild(clone);
  });
  noThreadsPlaceholder.style.display = threads.length === 0 ? 'block' : 'none';
}

// --- Messages ---
function openThread(thread) {
  currentThreadId = thread._id;
  currentRecipientId = thread.otherUser._id;
  socket.emit('joinRoom', currentThreadId);
  switchView('chat');
  renderChatHeader(thread.otherUser);
  loadMessages(currentThreadId);
}

async function loadMessages(threadId) {
  try {
    const messages = await secureFetch(`${API_MESSAGES_URL}/threads/${threadId}/messages`);
    renderMessages(messages);
    scrollToBottom();
  } catch {
    showToast('Impossible de charger les messages');
  }
}

function renderMessages(messages) {
  chatMessages.innerHTML = '';
  messages.forEach(msg => appendMessage(msg));
}

function appendMessage(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.sender === state.currentUser._id ? 'sent' : 'received'}`;
  div.textContent = msg.text;
  chatMessages.appendChild(div);
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage(event) {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  const message = {
    threadId: currentThreadId,
    text,
    recipientId: currentRecipientId
  };

  socket.emit('sendMessage', message);
  chatInput.value = '';
  appendMessage({ text, sender: state.currentUser._id });
  scrollToBottom();
}

// --- Typing ---
function emitTyping() {
  if (!typing) {
    socket.emit('typing', { threadId: currentThreadId });
    typing = true;
    setTimeout(() => (typing = false), TYPING_TIMEOUT);
  }
}

// --- Socket.IO Listeners ---
socket.on('message', msg => {
  if (msg.threadId === currentThreadId) {
    appendMessage(msg);
    scrollToBottom();
  } else {
    fetchInitialUnreadCount();
  }
});

socket.on('typing', ({ senderId }) => {
  if (senderId === currentRecipientId) {
    chatRecipientStatus.textContent = 'Écrit...';
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      chatRecipientStatus.textContent = '';
    }, TYPING_TIMEOUT);
  }
});

// --- Upload fichiers ---
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file || !VALID_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE_BYTES) {
    return showToast('Image invalide');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('threadId', currentThreadId);

  try {
    const res = await fetch(`${API_MESSAGES_URL}/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.message) {
      socket.emit('sendMessage', {
        threadId: currentThreadId,
        imageUrl: data.message.imageUrl,
        recipientId: currentRecipientId
      });
      appendMessage({ imageUrl: data.message.imageUrl, sender: state.currentUser._id });
      scrollToBottom();
    }
  } catch {
    showToast('Échec de l\'envoi du fichier');
  }
}
