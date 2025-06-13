/**
 * @file messages.js
 * @description Gestion complète de la messagerie instantanée pour MapMarket.
 * Ce module gère la connexion Socket.IO, l'affichage des conversations (threads),
 * l'envoi et la réception de messages (texte et images), les indicateurs de frappe,
 * et la mise à jour en temps réel de l'interface utilisateur.
 * @version 2.0.0 (Version Auditée et Corrigée)
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
// ✅ NOUVEL ÉTAT : Contexte pour une nouvelle discussion (non liée à un thread existant)
let newChatContext = null; 
let messageObserver = null;
let isLoadingHistory = false;
let allMessagesLoaded = false;
let typingTimer = null;
let tempImageFile = null;
/**
 * Initialise le module de messagerie.
 */
export function init() {
    if (!initializeUI()) return;
    setupEventListeners();
    console.log('Module Messages initialisé.');
}

/**
 * Récupère tous les éléments du DOM nécessaires et vérifie leur existence.
 * @returns {boolean} - True si tous les éléments sont trouvés, false sinon.
 */
function initializeUI() {
    const elementsToFind = {
        messagesModal: 'messages-modal',
        threadListView: 'thread-list-view',
        chatView: 'chat-view',
        threadListUl: 'thread-list',
        threadItemTemplate: 'thread-item-template',
        noThreadsPlaceholder: 'no-threads-placeholder',
        backToThreadsBtn: 'back-to-threads-btn',
        chatRecipientAvatar: 'chat-recipient-avatar',
        chatRecipientName: 'chat-recipient-name',
        chatOptionsBtn: 'chat-options-btn',
        chatOptionsMenu: 'chat-options-menu',
        blockUserChatBtn: 'block-user-chat-btn',
        deleteChatBtn: 'delete-chat-btn',
        chatMessagesContainer: 'chat-messages-container',
        chatMessageTemplate: 'chat-message-template',
        chatHistoryLoader: 'chat-history-loader',
        chatTypingIndicator: 'chat-typing-indicator',
        chatInputArea: 'chat-input-area',
        chatMessageInput: 'chat-message-input',
        sendChatMessageBtn: 'send-chat-message-btn',
        messagesNavBadge: 'messages-nav-badge',
        navMessagesBtn: 'nav-messages-btn',
        chatAttachImageBtn: 'chat-attach-image-btn',
        chatImageUploadInput: 'chat-image-upload-input',
        chatImagePreviewContainer: 'chat-image-preview-container'
    };

    const elements = {
        messagesModal, threadListView, chatView, threadListUl, threadItemTemplate, noThreadsPlaceholder,
        backToThreadsBtn, chatRecipientAvatar, chatRecipientName, chatOptionsBtn, chatOptionsMenu,
        blockUserChatBtn, deleteChatBtn, chatMessagesContainer, chatMessageTemplate, chatHistoryLoader,
        chatTypingIndicator, chatInputArea, chatMessageInput, sendChatMessageBtn, messagesNavBadge,
        navMessagesBtn, chatAttachImageBtn, chatImageUploadInput, chatImagePreviewContainer
    };

    let allFound = true;
    for (const key in elementsToFind) {
        const element = document.getElementById(elementsToFind[key]);
        if (!element) {
            console.error(`Élément critique de la messagerie manquant: #${elementsToFind[key]}.`);
            allFound = false;
        }
        // Assignation à la variable globale correspondante
        eval(`${key} = element;`);
    }

    if (allFound) {
        try {
            newMessagesSound = new Audio('/sounds/new_message_notification.mp3');
            newMessagesSound.load();
        } catch (e) {
            console.warn("Impossible de charger le son de notification:", e);
        }
    }
    return allFound;
}

/**
 * Met en place les écouteurs d'événements principaux pour le module de messagerie.
 */
function setupEventListeners() {
    state.subscribe('currentUserChanged', handleUserChangeForSocket);
    document.addEventListener('mapMarket:initiateChat', handleInitiateChatEvent);

    navMessagesBtn.addEventListener('click', openThreadListView);
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

/**
 * Gère le changement d'utilisateur pour connecter ou déconnecter le socket.
 * @param {object|null} user - L'objet utilisateur actuel ou null.
 */
function handleUserChangeForSocket(user) {
    if (user) {
        connectSocket();
    } else {
        disconnectSocket();
        clearMessagesUI();
    }
}

/**
 * Établit la connexion Socket.IO si elle n'est pas déjà active.
 */
function connectSocket() {
    const token = localStorage.getItem('mapmarket_auth_token');
    if (!token) return;
    if (socket && socket.connected) return;
    if (socket) socket.disconnect();

    socket = io(SOCKET_NAMESPACE, { auth: { token } });

    socket.on('connect', () => {
        console.log('Socket.IO connecté au namespace /chat:', socket.id);
        const currentUser = state.getCurrentUser();
        if (currentUser) {
            socket.emit('joinUserRoom', { userId: currentUser._id });
        }
    });

    socket.on('disconnect', (reason) => console.log('Socket.IO déconnecté:', reason));
    socket.on('connect_error', (err) => showToast(`Erreur de messagerie: ${err.message}`, 'error'));

    // Écoute des événements serveur
    socket.on('newMessage', handleNewMessageReceived);
    socket.on('typing', handleTypingEventReceived);
    socket.on('newThread', loadThreads); // Un nouveau thread a été créé nous impliquant
    socket.on('messagesRead', handleMessagesReadByOther); // L'autre participant a lu nos messages
}

/**
 * Déconnecte le socket de messagerie.
 */
function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
        console.log('Socket.IO déconnecté.');
    }
}

// --- GESTION DE L'INTERFACE ET DES FLUX ---

/**
 * Ouvre la modale sur la vue de la liste des conversations (threads).
 */
function openThreadListView() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        showToast("Veuillez vous connecter pour accéder à vos messages.", "warning");
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal' } }));
        return;
    }
    connectSocket(); // S'assurer que le socket est connecté
    showThreadList(); // Afficher la liste des conversations
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'messages-modal' } }));
}

/**
 * Affiche la vue de la liste des conversations et charge les données.
 */
function showThreadList() {
    activeThreadId = null;
    currentRecipient = null;
    chatView.classList.remove('active-view');
    threadListView.classList.add('active-view');
    if (chatOptionsMenu) chatOptionsMenu.classList.add('hidden');
    loadThreads();
}

/**
 * ✅ FONCTION CORRIGÉE ET FIABILISÉE
 * Ouvre la vue de chat. Nettoie systématiquement le contexte de nouvelle discussion
 * si un thread existant est ouvert, évitant ainsi les conflits d'état.
 * @param {string|null} threadId - L'ID du thread, ou null pour une nouvelle discussion.
 * @param {object} recipient - L'objet de l'autre participant.
 */
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
    removeImagePreview();
    chatMessageInput.focus();

    if (threadId) {
        // ⚠️ MODIFICATION CRUCIALE : S'il s'agit d'un thread existant, on vide le contexte.
        newChatContext = null;
        
        markThreadAsRead(threadId);
        await loadMessageHistory(threadId, true);
        setupInfiniteScroll();
    } else {
        // C'est une NOUVELLE conversation, on affiche un message d'accueil.
        chatHistoryLoader.innerHTML = `<p class="text-center text-muted">Envoyez le premier message à ${sanitizeHTML(recipient.name)} !</p>`;
        chatHistoryLoader.classList.remove('hidden');
    }
}


/**
 * Nettoie l'interface de la messagerie lors de la déconnexion.
 */
function clearMessagesUI() {
    if (threadListUl) threadListUl.innerHTML = '';
    if (chatMessagesContainer) chatMessagesContainer.innerHTML = '';
    if (noThreadsPlaceholder) noThreadsPlaceholder.classList.remove('hidden');
    activeThreadId = null;
    currentRecipient = null;
    updateGlobalUnreadCount(0);
}


// --- LOGIQUE DE GESTION DES DONNÉES (API & RENDU) ---

/**
 * Récupère les conversations de l'utilisateur depuis l'API.
 */
async function loadThreads() {
    if (!threadListUl) return;
    threadListUl.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    try {
        const response = await secureFetch(`${API_MESSAGES_URL}/threads`, {}, false);
        renderThreadList(response?.data?.threads || []);
    } catch (error) {
        console.error("Erreur chargement threads:", error);
        renderThreadList([]);
        noThreadsPlaceholder.textContent = "Erreur de chargement des conversations.";
    }
}

/**
 * Affiche la liste des conversations dans l'interface.
 * @param {Array} threadsData - Les données des conversations.
 */
function renderThreadList(threadsData) {
    if (!threadListUl || !threadItemTemplate) return;
    threadListUl.innerHTML = '';

    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        noThreadsPlaceholder.classList.remove('hidden');
        return;
    }

    if (!threadsData || threadsData.length === 0) {
        noThreadsPlaceholder.classList.remove('hidden');
        return;
    }
    noThreadsPlaceholder.classList.add('hidden');

    const totalUnread = threadsData.reduce((sum, t) => (sum + (t.unreadCount || 0)), 0);
    updateGlobalUnreadCount(totalUnread);

    threadsData.forEach(thread => {
        const recipient = thread.participants.find(p => p._id !== currentUser._id);
        if (!recipient) return;

        const clone = threadItemTemplate.content.cloneNode(true);
        const li = clone.querySelector('.thread-item');
        li.dataset.threadId = thread._id;
        li.querySelector('.thread-avatar').src = recipient.avatarUrl || 'avatar-default.svg';
        li.querySelector('.thread-user').textContent = sanitizeHTML(recipient.name);

        let previewText = thread.lastMessage?.text ? sanitizeHTML(thread.lastMessage.text) : (thread.lastMessage?.imageUrl ? '[Image]' : 'Début de la conversation');
        li.querySelector('.thread-preview').textContent = previewText;

        li.querySelector('.thread-time').textContent = thread.lastMessage ? formatDate(thread.lastMessage.createdAt, { hour: '2-digit', minute: '2-digit' }) : '';
        const unreadBadge = li.querySelector('.unread-badge');
        const unreadCount = thread.participants.find(p => p.user === currentUser._id)?.unreadCount || 0;
        unreadBadge.textContent = unreadCount;
        unreadBadge.classList.toggle('hidden', unreadCount === 0);

        li.addEventListener('click', () => openChatView(thread._id, recipient));
        threadListUl.appendChild(clone);
    });
}

/**
 * Charge l'historique des messages pour un thread donné.
 * @param {string} threadId - L'ID du thread.
 * @param {boolean} isInitialLoad - Indique s'il s'agit du premier chargement.
 */
async function loadMessageHistory(threadId, isInitialLoad = false) {
    if (isLoadingHistory || allMessagesLoaded) return;
    isLoadingHistory = true;
    if (isInitialLoad) {
        chatMessagesContainer.innerHTML = ''; // Nettoyer pour un nouveau chargement
        chatHistoryLoader.classList.remove('hidden');
    }

    const oldestMessage = chatMessagesContainer.querySelector('.chat-message:first-child');
    const beforeTimestamp = !isInitialLoad && oldestMessage ? oldestMessage.dataset.messageTimestamp : '';

    try {
        const url = `${API_MESSAGES_URL}/threads/${threadId}/messages?limit=20&before=${beforeTimestamp}`;
        const response = await secureFetch(url, {}, false);
        const messages = response?.data?.messages || [];

        if (messages.length < 20) {
            allMessagesLoaded = true;
            if (isInitialLoad && messages.length === 0) {
                chatHistoryLoader.innerHTML = `<p class="text-center text-muted">Envoyez le premier message !</p>`;
            } else {
                chatHistoryLoader.innerHTML = `<p class="text-center text-muted">Début de la conversation</p>`;
            }
        }
        renderMessages(messages, 'prepend');
    } catch (error) {
        showToast("Erreur de chargement de l'historique.", "error");
    } finally {
        isLoadingHistory = false;
        if (isInitialLoad && !allMessagesLoaded) {
            chatHistoryLoader.classList.add('hidden');
        }
    }
}

/**
 * Affiche les messages dans le conteneur de chat.
 * @param {Array} messages - Tableau de messages à afficher.
 * @param {string} method - 'prepend' pour ajouter au début, 'append' pour ajouter à la fin.
 */
function renderMessages(messages, method) {
    if (!messages || messages.length === 0) return;

    const fragment = document.createDocumentFragment();
    const currentUserId = state.getCurrentUser()._id;

    messages.forEach(msg => {
        const clone = chatMessageTemplate.content.cloneNode(true);
        const messageEl = clone.querySelector('.chat-message');
        const textEl = messageEl.querySelector('.message-text');
        const timeEl = messageEl.querySelector('.message-time');

        messageEl.dataset.messageId = msg._id;
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
            textEl.innerHTML = sanitizeHTML(msg.text || '').replace(/\n/g, '<br>');
        }

        timeEl.textContent = formatDate(msg.createdAt, { hour: '2-digit', minute: '2-digit' });
        fragment.appendChild(clone);
    });

    if (method === 'prepend') {
        const oldScrollHeight = chatMessagesContainer.scrollHeight;
        const oldScrollTop = chatMessagesContainer.scrollTop;
        chatMessagesContainer.prepend(fragment);
        // Conserver la position du scroll pour ne pas sauter lors du chargement de l'historique
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight - oldScrollHeight + oldScrollTop;
    } else {
        chatMessagesContainer.appendChild(fragment);
        scrollToBottom(chatMessagesContainer);
    }
}


// --- ACTIONS UTILISATEUR ET ENVOI ---

function handleInputKeypress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

/**
 * ✅ FONCTION CORRIGÉE ET ROBUSTE
 * Fonction principale pour l'envoi de messages. Utilise `newChatContext`
 * pour obtenir adId lors de la création d'un nouveau thread.
 */
async function sendMessage() {
    const text = chatMessageInput.value.trim();
    if (!text && !tempImageFile) {
        showToast('Le message est vide.', 'warning');
        return;
    }

    let endpoint;
    const options = { method: 'POST' };

    // Détermine si on est dans un nouveau thread ou un thread existant
    const isNewThread = !activeThreadId;
    
    // ✅ CORRECTION CRITIQUE : Logique de construction du payload rendue robuste.
    const getPayloadData = () => {
        if (isNewThread) {
            // Pour un nouveau thread, on a besoin de recipientId et adId.
            // On les récupère de `currentRecipient` et de notre nouvelle variable `newChatContext`.
            if (!currentRecipient?._id || !newChatContext?.adId) {
                // Cette erreur est celle que vous voyez. Elle se déclenche car newChatContext est vide.
                // Avec les corrections, `newChatContext` sera bien peuplé.
                showToast("Erreur critique : destinataire ou annonce manquant pour démarrer.", "error");
                throw new Error("Missing recipient or adId for new chat.");
            }
            return {
                recipientId: currentRecipient._id,
                adId: newChatContext.adId
            };
        } else {
            // Pour un thread existant, seul threadId est nécessaire.
            return { threadId: activeThreadId };
        }
    };
    
    try {
        const payloadData = getPayloadData();

        if (tempImageFile) {
            endpoint = `${API_MESSAGES_URL}/messages/image`;
            const formData = new FormData();
            Object.entries(payloadData).forEach(([key, value]) => formData.append(key, value));
            if (text) formData.append('text', text);
            formData.append('image', tempImageFile, tempImageFile.name);
            options.body = formData;

        } else {
            endpoint = `${API_MESSAGES_URL}/messages`;
            options.body = { text, ...payloadData };
        }

        stopTypingEvent();

        // On utilise secureFetch qui gère l'envoi de JSON ou FormData.
        const response = await secureFetch(endpoint, options);

        if (!response?.success) {
            throw new Error(response?.message || "Erreur d'envoi du message.");
        }
        
        // Si c'était un nouveau thread, la réponse du backend nous donne le threadId.
        if (isNewThread && response.data?.message?.threadId) {
             activeThreadId = response.data.message.threadId;
             newChatContext = null; // Le contexte a été utilisé, on le nettoie.
             // On peut recharger l'historique pour afficher le message "Début de la conversation".
             await loadMessageHistory(activeThreadId, true);
        }

        chatMessageInput.value = '';
        chatMessageInput.style.height = 'auto';
        removeImagePreview();

    } catch (error) {
        if (error.message !== "Missing recipient or adId for new chat.") {
            showToast(error.message || "L'envoi a échoué", 'error');
        }
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
    chatImagePreviewContainer.innerHTML = '';
    chatImagePreviewContainer.classList.add('hidden');
    chatImageUploadInput.value = '';
}


// --- GESTION DES ÉVÉNEMENTS SOCKET REÇUS ---

function handleNewMessageReceived({ message, thread }) {
    // Recharger la liste des conversations pour qu'elle remonte en haut
    if (threadListView.classList.contains('active-view')) {
        loadThreads();
    }

    if (activeThreadId === message.threadId) {
        renderMessages([message], 'append');
        markThreadAsRead(activeThreadId);
    } else {
        const sender = thread.participants.find(p => p.user._id === message.senderId);
        if (sender && sender.user._id !== state.getCurrentUser()._id) {
            showToast(`Nouveau message de ${sanitizeHTML(sender.user.name)}`, 'info');
            if (newMessagesSound) newMessagesSound.play().catch(e => console.warn('Erreur lecture son:', e));
            // Mettre à jour le badge global
            loadThreads(); // Recharge pour mettre à jour les compteurs
        }
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

function handleTypingEventReceived({ threadId, userName }) {
    if (threadId === activeThreadId && userName !== state.getCurrentUser()?.name) {
        chatTypingIndicator.classList.remove('hidden');
        chatTypingIndicator.querySelector('span').textContent = `${sanitizeHTML(userName)} est en train d'écrire`;
    }
}

function handleMessagesReadByOther({ threadId, readerId }) {
    if (threadId === activeThreadId) {
        // Optionnel : Mettre à jour l'UI pour montrer que les messages ont été lus (double coche bleue, etc.)
        console.log(`L'utilisateur ${readerId} a lu les messages dans ce thread.`);
    }
}

// --- FONCTIONS AUXILIAIRES ---

/**
 * Informe le serveur que le thread a été lu.
 * @param {string} threadId - L'ID du thread.
 */
function markThreadAsRead(threadId) {
    if (socket) {
        socket.emit('markThreadRead', { threadId });
    }
    // Mettre à jour le compteur local immédiatement
    loadThreads();
}

function updateGlobalUnreadCount(count) {
    const newCount = Math.max(0, count);
    if (messagesNavBadge) {
        messagesNavBadge.textContent = newCount > 9 ? '9+' : newCount;
        messagesNavBadge.classList.toggle('hidden', newCount === 0);
    }
}

function scrollToBottom(container) {
    if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
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
 * Gère l'initiation d'une conversation depuis une autre partie de l'application.
 * @param {CustomEvent} event - L'événement contenant les détails { adId, recipientId }.
 */
async function handleInitiateChatEvent(event) {
    const { adId, recipientId } = event.detail;

    if (!recipientId || !adId) {
        showToast("Impossible d’initier la discussion : annonce ou destinataire manquant.", "error");
        return;
    }

    toggleGlobalLoader(true, 'Ouverture de la discussion...');
    try {
        // Le `secureFetch` pour obtenir les détails du destinataire est bon.
        const recipientResponse = await secureFetch(`/api/users/${recipientId}`, {}, false);
        if (!recipientResponse?.success || !recipientResponse.data?.user) {
            throw new Error("Impossible de trouver le destinataire.");
        }

        const recipient = recipientResponse.data.user;

        // ✅ CORRECTION MAJEURE : On stocke adId dans notre variable d'état dédiée.
        newChatContext = { adId: adId };

        connectSocket();
        // On ouvre la vue de chat SANS threadId, ce qui indique une nouvelle conversation.
        await openChatView(null, recipient);

        // On ouvre la modale des messages.
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'messages-modal' } }));

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