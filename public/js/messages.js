// js/messages.js

/**
 * @file messages.js
 * @description Gestion complète de la messagerie instantanée pour MapMarket.
 * @version 5.0.0 (Version finale par Gemini, avec correction de la logique d'ouverture et des conflits d'événements)
 */

import * as state from './state.js';
import {
    showToast,
    secureFetch,
    toggleGlobalLoader,
    sanitizeHTML,
    formatDate
} from './utils.js';

// --- Constantes ---
const API_MESSAGES_URL = '/api/messages';
const SOCKET_NAMESPACE = '/chat';
const MAX_IMAGE_SIZE_MB = 2;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TYPING_TIMEOUT = 3000;

// --- Éléments du DOM ---
let messagesModal, threadListView, chatView, threadListUl, threadItemTemplate, noThreadsPlaceholder;
let backToThreadsBtn, chatRecipientAvatar, chatRecipientName, chatOptionsBtn, chatOptionsMenu, blockUserChatBtn, deleteChatBtn;
let chatMessagesContainer, chatMessageTemplate, chatHistoryLoader, chatTypingIndicator;
let chatInputArea, chatMessageInput, sendChatMessageBtn, chatAttachImageBtn, chatImageUploadInput, chatImagePreviewContainer;
let messagesNavBadge, navMessagesBtn;
let newMessagesSound;

// --- État du module ---
let socket = null;
let activeThreadId = null;
let currentRecipient = null;
let messageObserver = null;
let isLoadingHistory = false;
let allMessagesLoaded = false;
let typingTimer = null;
let tempImageFile = null;
let lastSentMessageId = null;

export function init() {
    if (!initializeUI()) return;
    setupEventListeners();
    console.log('Module Messages initialisé.');
}

function initializeUI() {
    const ids = ['messages-modal', 'thread-list-view', 'chat-view', 'thread-list', 'thread-item-template', 'no-threads-placeholder', 'back-to-threads-btn', 'chat-recipient-avatar', 'chat-recipient-name', 'chat-options-btn', 'chat-options-menu', 'block-user-chat-btn', 'delete-chat-btn', 'chat-messages-container', 'chat-message-template', 'chat-history-loader', 'chat-typing-indicator', 'chat-input-area', 'chat-message-input', 'send-chat-message-btn', 'messages-nav-badge', 'nav-messages-btn', 'chat-attach-image-btn', 'chat-image-upload-input', 'chat-image-preview-container'];
    const elements = ids.map(id => document.getElementById(id));
    
    for (let i = 0; i < ids.length; i++) {
        if (!elements[i]) {
            console.error(`Élément critique de la messagerie manquant: #${ids[i]}.`);
            return false;
        }
    }
    
    [messagesModal, threadListView, chatView, threadListUl, threadItemTemplate, noThreadsPlaceholder, backToThreadsBtn, chatRecipientAvatar, chatRecipientName, chatOptionsBtn, chatOptionsMenu, blockUserChatBtn, deleteChatBtn, chatMessagesContainer, chatMessageTemplate, chatHistoryLoader, chatTypingIndicator, chatInputArea, chatMessageInput, sendChatMessageBtn, messagesNavBadge, navMessagesBtn, chatAttachImageBtn, chatImageUploadInput, chatImagePreviewContainer] = elements;

    try {
        newMessagesSound = new Audio('/sounds/new_message_notification.mp3');
        newMessagesSound.load();
    } catch (e) {
        console.warn("Impossible de charger le son de notification:", e);
    }
    return true;
}

/**
 * Met en place les écouteurs d'événements. La logique d'ouverture de la modale est maintenant gérée par des fonctions dédiées.
 */
function setupEventListeners() {
    state.subscribe('currentUserChanged', handleUserChangeForSocket);
    document.addEventListener('mapMarket:initiateChat', handleInitiateChatEvent);
    
    // Clic sur le bouton de navigation "Messages" -> Ouvre la liste des conversations
    navMessagesBtn.addEventListener('click', openThreadListView);

    // Interactions dans la modale
    backToThreadsBtn.addEventListener('click', showThreadList);
    sendChatMessageBtn.addEventListener('click', sendMessage);
    chatMessageInput.addEventListener('keypress', handleInputKeypress);
    chatMessageInput.addEventListener('input', sendTypingEvent);
    chatOptionsBtn.addEventListener('click', toggleChatOptionsMenu);
    document.addEventListener('click', closeOptionsMenuOnClickOutside, true);
    chatAttachImageBtn.addEventListener('click', () => chatImageUploadInput.click());
    chatImageUploadInput.addEventListener('change', handleImageFileSelection);
}

// --- GESTION DE LA CONNEXION SOCKET.IO ---

function handleUserChangeForSocket(user) {
    if (!user) {
        disconnectSocket();
        clearMessagesUI();
    }
}

function connectSocket() {
    const token = localStorage.getItem('mapmarket_auth_token');
    if (!token) return;
    if (socket && socket.connected) return;
    if (socket) socket.disconnect();

    socket = io(SOCKET_NAMESPACE, { auth: { token } });

    socket.on('connect', () => {
        console.log('Socket.IO connecté:', socket.id);
        socket.emit('joinUserRoom', { userId: state.getCurrentUser()?.id });
    });
    socket.on('disconnect', (reason) => console.log('Socket.IO déconnecté:', reason));
    socket.on('connect_error', (err) => showToast(`Erreur de messagerie: ${err.message}`, 'error'));
    socket.on('newMessage', handleNewMessageReceived);
    socket.on('typing', handleTypingEventReceived);
    socket.on('newThread', loadThreads);
}

function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

// --- GESTION DE L'UI ET DES FLUX ---

/**
 * Gère l'ouverture de la modale depuis la barre de navigation pour afficher la liste des threads.
 */
function openThreadListView() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        showToast("Veuillez vous connecter pour accéder à vos messages.", "warning");
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal' } }));
        return;
    }
    connectSocket();
    showThreadList();
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'messages-modal' } }));
}

function showThreadList() {
    activeThreadId = null;
    currentRecipient = null;
    chatView.classList.remove('active-view');
    threadListView.classList.add('active-view');
    if(chatOptionsMenu) chatOptionsMenu.classList.add('hidden');
    loadThreads();
}

async function openChatView(threadId, recipient) {
    activeThreadId = threadId;
    currentRecipient = recipient;
    allMessagesLoaded = false;
    isLoadingHistory = false;

    chatRecipientAvatar.src = recipient.avatarUrl || 'avatar-default.svg';
    chatRecipientName.textContent = sanitizeHTML(recipient.name);

    threadListView.classList.remove('active-view');
    chatView.classList.add('active-view');
    
    chatMessagesContainer.innerHTML = '';
    chatMessageInput.value = '';
    chatMessageInput.focus();
    removeImagePreview();
    
    if (threadId) {
        markThreadAsRead(threadId);
        await loadMessageHistory(threadId, true);
        setupInfiniteScroll();
    } else {
        chatHistoryLoader.innerHTML = `<p class="text-center text-muted">Envoyez le premier message !</p>`;
        chatHistoryLoader.classList.remove('hidden');
    }
}

function clearMessagesUI() {
    if (threadListUl) threadListUl.innerHTML = '';
    if (chatMessagesContainer) chatMessagesContainer.innerHTML = '';
    if (noThreadsPlaceholder) noThreadsPlaceholder.classList.remove('hidden');
    activeThreadId = null;
    currentRecipient = null;
    updateGlobalUnreadCount(0);
}

// --- LOGIQUE DES DONNÉES ---

async function loadThreads() {
    if (!threadListUl) return;
    threadListUl.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    try {
        const response = await secureFetch(`${API_MESSAGES_URL}/threads`, {}, false);
        renderThreadList(response?.data?.threads || []);
    } catch (error) {
        console.error("Erreur chargement threads:", error);
        renderThreadList([]);
    }
}

function renderThreadList(threadsData) {
    if (!threadListUl || !threadItemTemplate) return;
    threadListUl.innerHTML = '';
    if (!threadsData || threadsData.length === 0) {
        if (noThreadsPlaceholder) noThreadsPlaceholder.classList.remove('hidden');
        return;
    }
    noThreadsPlaceholder.classList.add('hidden');

    const totalUnread = threadsData.reduce((sum, t) => (sum + (t.unreadCount || 0)), 0);
    updateGlobalUnreadCount(totalUnread);

    threadsData.forEach(thread => {
        const recipient = thread.participants.find(p => p._id !== state.getCurrentUser().id);
        if (!recipient) return;

        const clone = threadItemTemplate.content.cloneNode(true);
        const li = clone.querySelector('.thread-item');
        li.dataset.threadId = thread._id;
        li.querySelector('.thread-avatar').src = recipient.avatarUrl || 'avatar-default.svg';
        li.querySelector('.thread-user').textContent = sanitizeHTML(recipient.name);
        li.querySelector('.thread-preview').textContent = sanitizeHTML(thread.lastMessage?.text || '[Image]');
        li.querySelector('.thread-time').textContent = thread.lastMessage ? formatDate(thread.lastMessage.createdAt, { hour: '2-digit', minute: '2-digit' }) : '';
        const unreadBadge = li.querySelector('.unread-badge');
        unreadBadge.textContent = thread.unreadCount;
        unreadBadge.classList.toggle('hidden', !thread.unreadCount);

        li.addEventListener('click', () => openChatView(thread._id, recipient));
        threadListUl.appendChild(clone);
    });
}

async function loadMessageHistory(threadId, isInitialLoad = false) {
    if (isLoadingHistory || allMessagesLoaded) return;
    isLoadingHistory = true;
    chatHistoryLoader.classList.remove('hidden');
    const oldestMessage = chatMessagesContainer.querySelector('.chat-message:first-child');
    const beforeTimestamp = !isInitialLoad && oldestMessage ? oldestMessage.dataset.messageTimestamp : '';

    try {
        const url = `${API_MESSAGES_URL}/threads/${threadId}/messages?limit=20&before=${beforeTimestamp}`;
        const response = await secureFetch(url, {}, false);
        const messages = response?.data?.messages || [];
        if (messages.length < 20) {
            allMessagesLoaded = true;
            chatHistoryLoader.innerHTML = `<p class="text-center text-muted">${isInitialLoad ? 'Envoyez le premier message !' : 'Début de la conversation'}</p>`;
        }
        renderMessages(messages, 'prepend');
    } finally {
        isLoadingHistory = false;
        if (allMessagesLoaded || isInitialLoad) {
            setTimeout(() => { if (chatHistoryLoader) chatHistoryLoader.classList.add('hidden'); }, 2000);
        } else {
             if (chatHistoryLoader) chatHistoryLoader.classList.add('hidden');
        }
    }
}

function renderMessages(messages, method) {
    const fragment = document.createDocumentFragment();
    const currentUserId = state.getCurrentUser().id;
    messages.forEach(msg => {
        const clone = chatMessageTemplate.content.cloneNode(true);
        const messageEl = clone.querySelector('.chat-message');
        const textEl = messageEl.querySelector('.message-text');
        const timeEl = messageEl.querySelector('.message-time');
        messageEl.dataset.messageId = msg.id || msg._id;
        messageEl.dataset.messageTimestamp = new Date(msg.createdAt).getTime();
        const isSentByMe = (msg.senderId?._id || msg.senderId) === currentUserId;
        messageEl.dataset.senderId = isSentByMe ? 'me' : 'other';
        if (msg.imageUrl) {
            const img = document.createElement('img');
            img.src = msg.imageUrl;
            img.className = 'chat-image-attachment';
            img.alt = 'Image envoyée';
            textEl.innerHTML = '';
            textEl.appendChild(img);
        } else {
            textEl.innerHTML = sanitizeHTML(msg.text).replace(/\n/g, '<br>');
        }
        timeEl.textContent = formatDate(msg.createdAt, { hour: '2-digit', minute: '2-digit' });
        fragment.appendChild(clone);
    });
    if (method === 'prepend') {
        const oldScrollHeight = chatMessagesContainer.scrollHeight;
        chatMessagesContainer.prepend(fragment);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight - oldScrollHeight;
    } else {
        chatMessagesContainer.appendChild(fragment);
        scrollToBottom(chatMessagesContainer);
    }
}

// --- ACTIONS UTILISATEUR ---

function handleInputKeypress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const text = chatMessageInput.value.trim();
    if (!text && !tempImageFile) {
        showToast('Le message est vide.', 'warning');
        return;
    }

    const formData = new FormData();
    if (activeThreadId) {
        formData.append('threadId', activeThreadId);
    } else if (currentRecipient?.id || currentRecipient?._id) {
        formData.append('recipientId', currentRecipient.id || currentRecipient._id);
        if (currentRecipient.adId) formData.append('adId', currentRecipient.adId);
    } else {
        showToast("Erreur: discussion non identifiée.", 'error');
        return;
    }
    if (text) formData.append('text', text);
    if (tempImageFile) formData.append('image', tempImageFile);

    stopTypingEvent();

    try {
        const endpoint = tempImageFile ? `${API_MESSAGES_URL}/messages/image` : `${API_MESSAGES_URL}/messages`;
        const response = await secureFetch(endpoint, { method: 'POST', body: formData }, false);
        if (!response?.success) {
            throw new Error(response?.message || "Erreur d'envoi");
        }

        const sentMessage = response.data?.message;
        if (sentMessage) {
            lastSentMessageId = sentMessage.id || sentMessage._id;
            if (!activeThreadId) activeThreadId = sentMessage.threadId;
            renderMessages([sentMessage], 'append');
            loadThreads();
        }

        chatMessageInput.value = '';
        removeImagePreview();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function handleImageFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!VALID_IMAGE_TYPES.includes(file.type)) return showToast("Format d'image non valide.", "error");
    if (file.size > MAX_IMAGE_SIZE_BYTES) return showToast(`L'image est trop grande (max ${MAX_IMAGE_SIZE_MB}MB).`, "error");
    tempImageFile = file;
    displayImagePreview(file);
}

function displayImagePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        chatImagePreviewContainer.innerHTML = `<img src="${e.target.result}" alt="Aperçu" class="chat-image-preview-thumb" /><button type="button" class="btn btn-icon btn-danger btn-sm chat-remove-preview-btn" aria-label="Retirer l'image"><i class="fa-solid fa-times"></i></button>`;
        chatImagePreviewContainer.classList.remove('hidden');
        chatImagePreviewContainer.querySelector('.chat-remove-preview-btn').addEventListener('click', removeImagePreview);
    };
    reader.onerror = () => {
        showToast("Impossible de lire l'image.", 'error');
        removeImagePreview();
    };
    reader.readAsDataURL(file);
}

function removeImagePreview() {
    tempImageFile = null;
    if(chatImagePreviewContainer) {
        chatImagePreviewContainer.innerHTML = '';
        chatImagePreviewContainer.classList.add('hidden');
    }
    if(chatImageUploadInput) chatImageUploadInput.value = '';
}

// --- GESTION ÉVÉNEMENTS SOCKET ---

function handleNewMessageReceived({ message, thread }) {
    if (lastSentMessageId && (message.id || message._id) === lastSentMessageId) {
        lastSentMessageId = null; // déjà affiché localement
        return;
    }

    loadThreads();
    if (activeThreadId === message.threadId) {
        renderMessages([message], 'append');
        markThreadAsRead(activeThreadId);
    } else {
        const senderName = thread.participants.find(p => p.user._id !== state.getCurrentUser().id)?.user.name || 'inconnu';
        showToast(`Nouveau message de ${sanitizeHTML(senderName)}`, 'info');
        if (newMessagesSound) newMessagesSound.play().catch(e => console.warn('Erreur lecture son:', e));
    }
}

function sendTypingEvent() {
    if (socket?.connected && activeThreadId) {
        if (!typingTimer) socket.emit('typing', { threadId: activeThreadId, isTyping: true });
        clearTimeout(typingTimer);
        typingTimer = setTimeout(stopTypingEvent, TYPING_TIMEOUT);
    }
}

function stopTypingEvent() {
    if (socket?.connected && activeThreadId) {
        clearTimeout(typingTimer);
        typingTimer = null;
        socket.emit('typing', { threadId: activeThreadId, isTyping: false });
    }
}

function handleTypingEventReceived({ threadId, userName, isTyping }) {
    if (threadId === activeThreadId && userName !== state.getCurrentUser()?.name) {
        chatTypingIndicator.classList.toggle('hidden', !isTyping);
        if (isTyping) {
            chatTypingIndicator.querySelector('span').textContent = `${sanitizeHTML(userName)} est en train d'écrire...`;
        }
    }
}

// --- FONCTIONS AUXILIAIRES ---

function markThreadAsRead(threadId) {
    if(socket) socket.emit('markThreadRead', { threadId });
}

function updateGlobalUnreadCount(count) {
    const newCount = Math.max(0, count);
    if(messagesNavBadge) {
        messagesNavBadge.textContent = newCount > 9 ? '9+' : newCount;
        messagesNavBadge.classList.toggle('hidden', newCount === 0);
    }
}

function scrollToBottom(container, smooth = true) {
    if(container) container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

function setupInfiniteScroll() {
    if (messageObserver) messageObserver.disconnect();
    messageObserver = new IntersectionObserver(entries => {
        if (entries[0]?.isIntersecting && !isLoadingHistory && !allMessagesLoaded) {
            loadMessageHistory(activeThreadId);
        }
    }, { root: chatMessagesContainer, threshold: 0.1 });
    if (chatHistoryLoader) {
        messageObserver.observe(chatHistoryLoader);
    }
}

/**
 * Gère l'événement d'initiation d'une conversation en corrigeant le problème de timing.
 * @param {CustomEvent} event - L'événement contenant les détails.
 */
async function handleInitiateChatEvent(event) {
    const { adId, recipientId } = event.detail;
    if (!recipientId) return;

    toggleGlobalLoader(true, 'Ouverture de la discussion...');
    try {
        const response = await secureFetch(`${API_MESSAGES_URL}/threads/initiate`, {
            method: 'POST',
            body: { adId, recipientId }
        });

        if (response?.success && response.data?.thread) {
            const thread = response.data.thread;
            const recipient = thread.participants.find(p => p.user._id !== state.getCurrentUser().id)?.user;

            if (recipient) {
                connectSocket();
                await openChatView(thread._id, { ...recipient, adId });
                document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'messages-modal' } }));
            } else {
                throw new Error('Impossible de trouver le destinataire dans le thread retourné.');
            }
        } else {
            throw new Error(response.message || "Impossible de démarrer la conversation.");
        }
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        toggleGlobalLoader(false);
    }
}

function toggleChatOptionsMenu() {
    const isHidden = chatOptionsMenu.classList.toggle('hidden');
    chatOptionsBtn.setAttribute('aria-expanded', !isHidden);
}

function closeOptionsMenuOnClickOutside(event) {
    if (chatOptionsMenu && !chatOptionsMenu.classList.contains('hidden') &&
        !chatOptionsBtn.contains(event.target) && !chatOptionsMenu.contains(event.target)) {
        toggleChatOptionsMenu();
    }
}

async function handleDeleteThread() { /* Logique de suppression à implémenter */ }
async function handleToggleBlockUser(block) { /* Logique de blocage à implémenter */ }