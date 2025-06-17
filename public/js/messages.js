/**
 * @file messages.js
 * @description Version WebSocket (Socket.IO) de la messagerie instantanée de MapMarket.
 * Cette version est corrigée pour éviter les erreurs d'initialisation et utilise
 * un formulaire pour une gestion robuste de l'envoi de messages.
 */

// Socket.IO est chargé via le CDN dans index.html et exposé globalement sous la variable `io`.
import * as state from './state.js';
import { fetchInitialUnreadCount } from './main.js';
import {
  showToast,
  secureFetch,
  sanitizeHTML,
} from './utils.js';

// --- Constantes ---
const API_MESSAGES_URL = '/api/messages';
const TYPING_TIMEOUT = 3000; // 3 secondes

// --- État du module ---
let socket = null;
let currentThreadId = null;
let currentRecipientId = null;
let typing = false;
let typingTimeout;

// --- Éléments du DOM (statiques) ---
let messagesModal, threadListView, chatView, threadListUl, threadItemTemplate, noThreadsPlaceholder;
let backToThreadsBtn, chatRecipientAvatar, chatRecipientName, chatRecipientStatus;

/**
 * Initialise le socket et enregistre les écouteurs globaux.
 * @param {object} ioSocket - L'instance du socket connecté depuis main.js
 */
export function setSocket(ioSocket) {
  socket = ioSocket;
  registerSocketListeners();
}

/**
 * Initialise les composants principaux de l'interface de messagerie (ceux qui sont toujours présents).
 */
export function initMessagesUI() {
  console.log("Initialisation de l'UI des messages.");
  messagesModal = document.getElementById('messages-modal');
  threadListView = document.getElementById('thread-list-view');
  chatView = document.getElementById('chat-view');
  threadListUl = document.getElementById('thread-list');
  threadItemTemplate = document.getElementById('thread-item-template');
  noThreadsPlaceholder = document.getElementById('no-threads-placeholder');

  // Éléments de l'en-tête du chat (statiques dans la vue chat)
  backToThreadsBtn = document.getElementById('back-to-threads-btn');
  chatRecipientAvatar = document.getElementById('chat-recipient-avatar');
  chatRecipientName = document.getElementById('chat-recipient-name');
  chatRecipientStatus = document.getElementById('chat-recipient-status');

  // Ajout de l'écouteur pour le bouton de retour (toujours présent)
  if (backToThreadsBtn) {
    backToThreadsBtn.addEventListener('click', () => switchView('threads'));
  }

}

/**
 * Ajoute les écouteurs d'événements spécifiques à la vue de chat (formulaire, input, etc.).
 * Cette fonction est appelée UNIQUEMENT après que l'interface du chat ait été rendue.
 */
function addChatEventListeners() {
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chat-message-input');
  const fileInput = document.getElementById('chat-image-upload-input');

  if (chatForm) {
    // Gère à la fois le clic sur le bouton et la touche "Entrée"
    chatForm.addEventListener('submit', sendMessage);
  } else {
    console.error("Erreur critique : Le formulaire de chat 'chatForm' est introuvable.");
  }

  if (chatInput) {
    chatInput.addEventListener('input', emitTyping);
  }

  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
  }
}

/**
 * Bascule entre la vue de la liste des discussions et la vue du chat.
 * @param {'threads' | 'chat'} view - La vue à afficher.
 */
function switchView(view) {
  if (threadListView && chatView) {
    threadListView.style.display = view === 'threads' ? 'block' : 'none';
    chatView.style.display = view === 'chat' ? 'block' : 'none';
  }
}

// --- Gestion des Threads (Conversations) ---

/**
 * Récupère et affiche la liste des conversations de l'utilisateur.
 */
export async function fetchThreads() {
  try {
    const threads = await secureFetch(`${API_MESSAGES_URL}/threads`);
    renderThreads(threads);
  } catch (error) {
    console.error("Erreur lors du chargement des discussions:", error);
    showToast('Erreur lors du chargement des discussions', 'error');
  }
}

/**
 * Construit la liste des conversations dans le DOM.
 * @param {Array<object>} threads - La liste des threads.
 */
function renderThreads(threads) {
  if (!threadListUl || !threadItemTemplate) return;
  threadListUl.innerHTML = '';
  if (threads.length > 0) {
    threads.forEach(thread => {
      const clone = threadItemTemplate.content.cloneNode(true);
      const item = clone.querySelector('.thread-item');
      item.dataset.threadId = thread._id;
      // S'assure que otherUser existe avant d'essayer d'accéder à ses propriétés
      item.querySelector('.thread-name').textContent = thread.otherUser?.name || 'Utilisateur supprimé';
      item.querySelector('.thread-last-message').textContent = thread.lastMessage?.text ? sanitizeHTML(thread.lastMessage.text) : 'Aucun message';
      
      const avatar = item.querySelector('.thread-avatar');
      if (avatar) {
          avatar.src = thread.otherUser?.avatar || 'assets/default-avatar.png';
      }

      item.addEventListener('click', () => openThread(thread));
      threadListUl.appendChild(clone);
    });
  }
  noThreadsPlaceholder.style.display = threads.length === 0 ? 'block' : 'none';
}

// --- Gestion des Messages ---

/**
 * Ouvre une conversation spécifique.
 * @param {object} thread - L'objet de la conversation à ouvrir.
 */
function openThread(thread) {
  currentThreadId = thread._id;
  currentRecipientId = thread.otherUser._id;

  if (socket) {
    socket.emit('joinThread', currentThreadId);
  }

  switchView('chat');
  renderChatHeader(thread.otherUser);
  renderChatBody(); // **CORRECTION**: Affiche le formulaire et le conteneur de messages
  loadMessages(currentThreadId);
}

// Ouvre l'interface de messagerie pour un thread donné
export async function openMessagingUI(thread) {
  if (!messagesModal) {
    messagesModal = document.getElementById('messages-modal');
  }
  if (!messagesModal) return;
  messagesModal.classList.remove('hidden');
  messagesModal.setAttribute('aria-hidden', 'false');

  const currentUser = state.getCurrentUser();
  if (!currentUser) return;

  currentThreadId = thread._id;
  const otherParticipant = thread.participants.find(p => p.user._id !== currentUser._id);
  if (otherParticipant) {
    currentRecipientId = otherParticipant.user._id;
  }

  if (socket) {
    socket.emit('joinThread', currentThreadId);
  }

  switchView('chat');
  renderChatHeader(otherParticipant ? otherParticipant.user : {});
  renderChatBody();
  await loadMessages(currentThreadId);

  // Mettre à jour le résumé d'annonce
  if (thread.ad) {
    document.getElementById('chat-ad-thumbnail').src = thread.ad.imageUrls?.[0] || 'https://placehold.co/60x60/e0e0e0/757575?text=Ad';
    document.getElementById('chat-ad-link').textContent = thread.ad.title;
    document.getElementById('chat-ad-price').textContent = thread.ad.price != null ? thread.ad.price + '€' : '';
  }
}

/**
 * Met à jour l'en-tête de la vue de chat avec les informations du destinataire.
 * @param {object} otherUser - L'objet de l'utilisateur destinataire.
 */
function renderChatHeader(otherUser) {
    chatRecipientName.textContent = otherUser.name || 'Utilisateur';
    chatRecipientAvatar.src = otherUser.avatar || 'assets/default-avatar.png';
    chatRecipientStatus.textContent = ''; // Réinitialise le statut "écrit..."
}

/**
 * **NOUVELLE FONCTION**
 * Injecte le HTML pour le conteneur de messages et le formulaire, puis attache les écouteurs.
 */
function renderChatBody() {
    const chatBody = chatView.querySelector('.chat-body');
    if (!chatBody) return;

    // Injection de la structure HTML du chat
    chatBody.innerHTML = `
        <div id="chat-messages-container" class="chat-messages"></div>
        <form id="chatForm" class="chat-input-form">
            <input type="text" id="chat-message-input" class="chat-input" placeholder="Écrivez votre message..." autocomplete="off">
            <label for="chat-image-upload-input" class="chat-attach-btn">📎</label>
            <input type="file" id="chat-image-upload-input" accept="image/png, image/jpeg, image/webp" style="display: none;">
            <button type="submit" class="chat-send-btn">Envoyer</button>
        </form>
    `;
    
    // **CORRECTION**: Appel des écouteurs APRÈS la création des éléments.
    addChatEventListeners();
}

/**
 * Charge les messages d'une conversation et les affiche.
 * @param {string} threadId - L'ID de la conversation.
 */
async function loadMessages(threadId) {
  try {
    const messages = await secureFetch(`${API_MESSAGES_URL}/threads/${threadId}/messages`);
    const chatMessagesContainer = document.getElementById('chat-messages-container');
    chatMessagesContainer.innerHTML = ''; // Vide les anciens messages
    messages.forEach(msg => appendMessage(msg));
    scrollToBottom();
  } catch (error) {
    console.error("Impossible de charger les messages:", error);
    showToast('Impossible de charger les messages', 'error');
  }
}

/**
 * Ajoute un seul message au conteneur de chat.
 * @param {object} msg - L'objet message.
 */
function appendMessage(msg) {
  const chatMessages = document.getElementById('chat-messages-container');
  if (!chatMessages) return;

  const div = document.createElement('div');
  const isSent = msg.sender === state.currentUser?._id;
  div.className = `message ${isSent ? 'sent' : 'received'}`;
  div.innerHTML = `
    <div class="message-content">
      ${msg.text ? sanitizeHTML(msg.text) : ''}
      ${msg.imageUrl ? `<img src="${msg.imageUrl}" alt="Image envoyée" class="message-image">` : ''}
    </div>
  `;
  chatMessages.appendChild(div);
}

function scrollToBottom() {
  const chatMessages = document.getElementById('chat-messages-container');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

/**
 * Gère la soumission du formulaire pour envoyer un message.
 * @param {Event} event - L'événement de soumission du formulaire.
 */
async function sendMessage(event) {
  event.preventDefault(); // Empêche le rechargement de la page
  const chatInput = document.getElementById('chat-message-input');
  const text = chatInput.value.trim();
  if (!text) return;

  const messagePayload = {
    threadId: currentThreadId,
    message: text,
    senderId: state.getCurrentUser()?._id || state.currentUser?._id
  };

  if (socket) {
    socket.emit('sendMessage', messagePayload);
  }

  // Ajout optimiste du message à l'UI
  appendMessage({
    threadId: currentThreadId,
    text,
    sender: state.getCurrentUser()?._id
  });
  
  chatInput.value = '';
  scrollToBottom();
  chatInput.focus();
}

// --- Indicateur "Typing" ---

function emitTyping() {
  if (!typing && socket) {
    typing = true;
    socket.emit('typing', { threadId: currentThreadId });
    setTimeout(() => {
      typing = false;
    }, TYPING_TIMEOUT);
  }
}

// --- Écouteurs Socket.IO ---

function registerSocketListeners() {
  if (!socket) return;

  socket.on('newMessage', (msg) => {
    if (msg.threadId === currentThreadId) {
      appendMessage(msg);
      scrollToBottom();
    } else {
      // Mettre à jour le compteur de messages non lus si ce n'est pas la conversation active
      showToast(`Nouveau message de ${msg.senderName || 'un utilisateur'}`);
      fetchInitialUnreadCount();
      fetchThreads(); // Met à jour la liste pour afficher le dernier message
    }
  });

  socket.on('typing', ({ senderId }) => {
    if (senderId === currentRecipientId) {
      chatRecipientStatus.textContent = 'Écrit...';
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        chatRecipientStatus.textContent = ''; // Ou statut en ligne
      }, TYPING_TIMEOUT);
    }
  });

  socket.on('connect_error', (err) => {
    console.error("Erreur de connexion Socket:", err.message);
    showToast("Connexion à la messagerie perdue", "error");
  });
}

// --- Gestion de l'upload de fichiers ---

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        return showToast("L'image est trop lourde (max 2MB)", "error");
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('threadId', currentThreadId);

    try {
        // Envoi via l'API REST qui retournera l'URL de l'image
        const data = await secureFetch(`${API_MESSAGES_URL}/upload`, {
            method: 'POST',
            body: formData,
            // secureFetch doit être capable de gérer les FormData (ne pas mettre de Content-Type)
        });

        if (data.imageUrl && socket) {
            // Une fois l'URL obtenue, on envoie le message via Socket.IO
            const message = {
                threadId: currentThreadId,
                message: '',
                imageUrl: data.imageUrl,
                senderId: state.getCurrentUser()?._id
            };
            socket.emit('sendMessage', message);
            
            // Ajout optimiste
            appendMessage({
                ...message,
                sender: state.currentUser._id
            });
            scrollToBottom();
        }
    } catch (error) {
        console.error("Échec de l'envoi de l'image:", error);
        showToast("Échec de l'envoi de l'image", 'error');
    }
}
