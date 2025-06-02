// js/messages.js

/**
 * @file messages.js
 * @description Gestion de la messagerie instantanée (type Leboncoin).
 * Gère les threads de discussion, l'envoi/réception de messages texte et image,
 * les notifications temps réel via WebSocket (Socket.IO), la gestion du statut lu/non-lu,
 * le scroll infini, le blocage, la suppression locale, le signalement.
 * AMÉLIORATIONS: Gestion images (drag&drop, preview, suppression), signalement,
 * stubs pour suppression/édition message, blocage/déblocage, archivage,
 * notification sonore simple, accessibilité et validations.
 */

import * as state from './state.js';
import {
    showToast,
    secureFetch,
    toggleGlobalLoader,
    sanitizeHTML,
    formatDate,
    generateUUID,
    debounce // Ajout du debounce pour certaines actions
} from './utils.js';

const API_MESSAGES_URL = '/api/messages';
const API_USERS_URL = '/api/users';
const API_REPORTS_URL = '/api/reports'; // Pour les signalements
const SOCKET_NAMESPACE = '/chat';

// --- Éléments du DOM ---
let messagesModal, threadListView, chatView;
let threadListUl, threadItemTemplate, noThreadsPlaceholder;
let backToThreadsBtn, chatRecipientAvatar, chatRecipientName, chatOptionsMenu, chatOptionsBtn;
let archiveChatBtn, deleteChatBtn, blockUserChatBtn, unblockUserChatBtn; // Ajout unblock
let chatMessagesContainer, chatMessageTemplate, chatHistoryLoader;
let chatTypingIndicator;
let chatInputArea, chatMessageInput, sendChatMessageBtn, emojiPickerBtn;
let chatAttachImageBtn, chatImageUploadInput, chatImagePreviewContainer, chatImagePreviewImg, chatRemoveImagePreviewBtn;
let messagesNavBadge;
let newMessagesSound; // Pour la notification sonore

// --- État du module ---
let socket = null;
let activeThreadId = null;
let currentRecipient = null;
let messageObserver = null;
let isLoadingHistory = false;
let allMessagesLoaded = false;
const TYPING_TIMEOUT = 3000;
let typingTimer = null;
const MAX_IMAGE_SIZE_CHAT_MB = 2;
const MAX_IMAGE_SIZE_CHAT_BYTES = MAX_IMAGE_SIZE_CHAT_MB * 1024 * 1024;
const VALID_IMAGE_TYPES_CHAT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']; // Ajout GIF
let tempImageFileMessages = null; // Fichier image en cours de prévisualisation

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour la messagerie.
 */
function initMessagesUI() {
    messagesModal = document.getElementById('messages-modal');
    if (!messagesModal) {
        console.error("La modale de messagerie (messages-modal) est introuvable.");
        return;
    }

    threadListView = document.getElementById('thread-list-view');
    chatView = document.getElementById('chat-view');

    threadListUl = document.getElementById('thread-list');
    threadItemTemplate = document.getElementById('thread-item-template');
    noThreadsPlaceholder = document.getElementById('no-threads-placeholder');

    backToThreadsBtn = document.getElementById('back-to-threads-btn');
    chatRecipientAvatar = document.getElementById('chat-recipient-avatar');
    chatRecipientName = document.getElementById('chat-recipient-name');
    chatOptionsBtn = document.getElementById('chat-options-btn');
    chatOptionsMenu = document.getElementById('chat-options-menu');
    archiveChatBtn = document.getElementById('archive-chat-btn');
    deleteChatBtn = document.getElementById('delete-chat-btn');
    blockUserChatBtn = document.getElementById('block-user-chat-btn');
    unblockUserChatBtn = document.getElementById('unblock-user-chat-btn'); // À ajouter au HTML du menu d'options

    chatMessagesContainer = document.getElementById('chat-messages-container');
    chatMessageTemplate = document.getElementById('chat-message-template');
    chatHistoryLoader = document.getElementById('chat-history-loader');
    chatTypingIndicator = document.getElementById('chat-typing-indicator');

    chatInputArea = document.getElementById('chat-input-area');
    chatMessageInput = document.getElementById('chat-message-input');
    sendChatMessageBtn = document.getElementById('send-chat-message-btn');
    emojiPickerBtn = document.getElementById('emoji-picker-btn');

    // Éléments pour l'upload d'image
    chatAttachImageBtn = document.getElementById('chat-attach-image-btn');
    chatImageUploadInput = document.getElementById('chat-image-upload-input');
    chatImagePreviewContainer = document.getElementById('chat-image-preview-container');
    // Les éléments img et remove button de la preview sont créés dynamiquement

    messagesNavBadge = document.getElementById('messages-nav-badge');

    // Initialisation du son (s'assurer que le fichier audio est accessible)
    try {
        newMessagesSound = new Audio('sounds/new_message_notification.mp3'); // Chemin vers votre fichier son
        newMessagesSound.load(); // Précharger pour une lecture plus rapide
    } catch (e) {
        console.warn("Impossible de charger le son de notification:", e);
        newMessagesSound = null;
    }


    // --- Écouteurs d'événements ---
    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'messages-modal') {
            handleOpenMessagesModal();
        }
    });
    document.addEventListener('mapMarket:modalClosed', (event) => {
        if (event.detail.modalId === 'messages-modal') {
            handleCloseMessagesModal();
        }
    });

    if (backToThreadsBtn) {
        backToThreadsBtn.addEventListener('click', showThreadList);
    }
    if (sendChatMessageBtn && chatMessageInput) {
        sendChatMessageBtn.addEventListener('click', sendMessage);
        chatMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            } else if (e.key !== 'Enter') { // Ne pas envoyer 'typing' sur Entrée
                sendTypingEvent();
            }
        });
        // Drag & Drop sur la zone de texte pour les images
        chatMessageInput.addEventListener('dragover', handleDragOver);
        chatMessageInput.addEventListener('dragleave', handleDragLeave);
        chatMessageInput.addEventListener('drop', handleDropImage);
        // Drag & Drop sur toute la zone de chat (plus large)
        if (chatInputArea) {
            chatInputArea.addEventListener('dragover', handleDragOver);
            chatInputArea.addEventListener('dragleave', handleDragLeave);
            chatInputArea.addEventListener('drop', handleDropImage);
        }

    }

    if (chatAttachImageBtn && chatImageUploadInput) {
        chatAttachImageBtn.addEventListener('click', () => chatImageUploadInput.click());
        chatImageUploadInput.addEventListener('change', handleImageFileSelection);
    }


    if (chatOptionsBtn && chatOptionsMenu) {
        chatOptionsBtn.addEventListener('click', toggleChatOptionsMenu);
        document.addEventListener('click', (e) => {
            if (chatOptionsBtn && !chatOptionsBtn.contains(e.target) &&
                chatOptionsMenu && !chatOptionsMenu.contains(e.target)) {
                chatOptionsMenu.classList.add('hidden');
                chatOptionsBtn.setAttribute('aria-expanded', 'false');
            }
        }, true); // Use capture phase to close menu reliably
    }
    if (archiveChatBtn) archiveChatBtn.addEventListener('click', handleArchiveChat);
    if (deleteChatBtn) deleteChatBtn.addEventListener('click', handleDeleteChatLocally); // Changé pour suppression locale
    if (blockUserChatBtn) blockUserChatBtn.addEventListener('click', () => handleToggleBlockUser(true));
    if (unblockUserChatBtn) unblockUserChatBtn.addEventListener('click', () => handleToggleBlockUser(false));


    state.subscribe('currentUserChanged', handleUserChangeForSocket);
    document.addEventListener('mapMarket:initiateChat', handleInitiateChatEvent);
    updateGlobalUnreadCount(state.get('messages.unreadGlobalCount') || 0);

    // Accessibilité: s'assurer que la zone de chat est bien annoncée
    if (chatMessagesContainer) {
        chatMessagesContainer.setAttribute('aria-live', 'polite'); // Annonce les nouveaux messages
        chatMessagesContainer.setAttribute('role', 'log');
    }
}

// ... (handleOpenMessagesModal, handleCloseMessagesModal, handleUserChangeForSocket, clearMessagesUI - restent similaires) ...
// ... (connectSocket, disconnectSocket - restent similaires, mais s'assurer que `auth.token` est bien géré) ...
// ... (loadThreads, renderThreadList, displayNoThreads - restent similaires) ...
// ... (openChatView, showThreadList - restent similaires) ...
// ... (loadMessageHistory, scrollToBottom, setupInfiniteScroll - restent similaires) ...

/**
 * Gère l'ouverture de la modale de messagerie.
 */
function handleOpenMessagesModal() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        showToast("Veuillez vous connecter pour accéder à la messagerie.", "warning");
        document.dispatchEvent(new CustomEvent('mapmarket:closeModal', {
            detail: {
                modalId: 'messages-modal'
            }
        }));
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
            detail: {
                modalId: 'auth-modal'
            }
        }));
        return;
    }
    connectSocket();
    loadThreads();
    showThreadList();
    if (chatMessageInput) chatMessageInput.value = ''; // Vider le champ de saisie
    removeImagePreview(); // S'assurer qu'aucune preview ne reste
}

/**
 * Gère la fermeture de la modale de messagerie.
 */
function handleCloseMessagesModal() {
    activeThreadId = null;
    currentRecipient = null;
    removeImagePreview();
    // Optionnel: disconnectSocket(); // Ou garder la connexion active en arrière-plan
}

/**
 * Gère le changement d'utilisateur pour la connexion/déconnexion du socket.
 */
function handleUserChangeForSocket(user) {
    if (user) {
        // La connexion se fait à l'ouverture de la modale
    } else {
        disconnectSocket();
        clearMessagesUI();
    }
}

/**
 * Vide l'UI de la messagerie (threads, messages, etc.).
 */
function clearMessagesUI() {
    if (threadListUl) threadListUl.innerHTML = '';
    if (chatMessagesContainer) chatMessagesContainer.innerHTML = '';
    if (noThreadsPlaceholder) noThreadsPlaceholder.classList.remove('hidden');
    activeThreadId = null;
    currentRecipient = null;
    updateGlobalUnreadCount(0);
    removeImagePreview();
}

/**
 * Établit la connexion WebSocket avec Socket.IO.
 */
function connectSocket() {
    const currentUser = state.getCurrentUser();
    if (!currentUser || (socket && socket.connected)) {
        return;
    }
    const token = localStorage.getItem('mapmarket_auth_token');
    if (!token) {
        console.warn("Messagerie: Token JWT non trouvé, connexion socket annulée.");
        return;
    }
    if (typeof io === 'undefined') {
        showToast("Erreur: Librairie de messagerie (Socket.IO) non chargée.", "error");
        console.error("Socket.IO client library is not loaded.");
        return;
    }
    if (socket) socket.disconnect();

    socket = io(SOCKET_NAMESPACE, {
        auth: { token },
        reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
        console.log('Socket connecté:', socket.id);
        // showToast("Connecté à la messagerie.", "success", 1500); // Peut être un peu bruyant
        socket.emit('joinUserRoom', { userId: currentUser.id });
    });
    socket.on('disconnect', (reason) => console.log('Socket déconnecté:', reason));
    socket.on('connect_error', (error) => {
        console.error('Erreur de connexion socket:', error.message);
        showToast(`Erreur de connexion messagerie: ${error.message}`, "error");
    });
    socket.on('newMessage', handleNewMessageReceived);
    socket.on('messageStatusUpdate', handleMessageStatusUpdate);
    socket.on('typing', handleTypingEventReceived);
    socket.on('unreadCountUpdate', ({ unreadGlobalCount }) => updateGlobalUnreadCount(unreadGlobalCount));
    socket.on('newThread', () => loadThreads());
    socket.on('userBlockedStatus', ({ userId, isBlocked }) => {
        if (currentRecipient && currentRecipient.id === userId) {
            updateBlockedUserUI(isBlocked);
        }
    });
    socket.on('messageDeleted', ({ messageId, threadId: msgThreadId }) => {
        if (activeThreadId === msgThreadId) {
            const messageEl = chatMessagesContainer.querySelector(`.chat-message[data-message-id="${messageId}"]`);
            if (messageEl) {
                messageEl.classList.add('message-deleted-notice');
                messageEl.innerHTML = `<p class="message-text-deleted" data-i18n="chat.messageDeleted"><em>Ce message a été supprimé.</em></p><time class="message-time">${messageEl.querySelector('.message-time')?.textContent || ''}</time>`;
            }
        }
    });
    socket.on('error', (errorData) => {
        console.error("Erreur serveur via socket:", errorData);
        showToast(errorData.message || "Une erreur est survenue avec la messagerie.", "error");
    });
}

/**
 * Ferme la connexion WebSocket.
 */
function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
        console.log('Socket déconnecté manuellement.');
    }
}


/**
 * Charge les threads de discussion de l'utilisateur.
 */
async function loadThreads() {
    if (!threadListUl) return;
    threadListUl.innerHTML = '<div class="loader-container" style="padding: 20px;"><div class="spinner"></div> <p data-i18n="chat.loadingThreads">Chargement des discussions...</p></div>';
    if (noThreadsPlaceholder) noThreadsPlaceholder.classList.add('hidden');

    try {
        const threads = await secureFetch(API_MESSAGES_URL + '/threads', {}, false);
        if (threads && Array.isArray(threads)) {
            renderThreadList(threads);
            const globalUnread = threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
            updateGlobalUnreadCount(globalUnread);
            state.set('messages.unreadGlobalCount', globalUnread);
            state.set('messages.threads', threads);
        } else {
            displayNoThreads();
        }
    } catch (error) {
        console.error("Erreur lors du chargement des threads:", error);
        displayNoThreads();
        showToast("Impossible de charger vos discussions.", "error");
    }
}
/**
 * Affiche la liste des threads.
 * @param {Array<Object>} threadsData
 */
function renderThreadList(threadsData) {
    if (!threadListUl || !threadItemTemplate) return;
    threadListUl.innerHTML = '';

    if (threadsData.length === 0) {
        displayNoThreads();
        return;
    }
    if (noThreadsPlaceholder) noThreadsPlaceholder.classList.add('hidden');

    threadsData.forEach(thread => {
        if (thread.isArchived) return; // Ne pas afficher les threads archivés ici (nécessite une section "Archivés")

        const templateClone = threadItemTemplate.content.cloneNode(true);
        const listItem = templateClone.querySelector('.thread-item');
        // ... (remplissage des éléments comme avant) ...
        const avatarImg = listItem.querySelector('.thread-avatar');
        const userNameEl = listItem.querySelector('.thread-user');
        const previewEl = listItem.querySelector('.thread-preview');
        const timeEl = listItem.querySelector('.thread-time');
        const unreadBadge = listItem.querySelector('.unread-badge');

        listItem.dataset.threadId = thread.id;
        listItem.dataset.recipientId = thread.recipient.id;
        listItem.setAttribute('role', 'button');
        listItem.setAttribute('tabindex', '0'); // Pour accessibilité clavier

        if (avatarImg) {
            avatarImg.src = thread.recipient.avatarUrl || 'avatar-default.svg';
            avatarImg.alt = `Avatar de ${sanitizeHTML(thread.recipient.name)}`;
        }
        if (userNameEl) {
            userNameEl.textContent = sanitizeHTML(thread.recipient.name);
            if (thread.adTitle) {
                const adTitleSpan = document.createElement('span');
                adTitleSpan.className = 'thread-ad-title';
                adTitleSpan.textContent = ` (Annonce: ${sanitizeHTML(thread.adTitle)})`;
                userNameEl.appendChild(adTitleSpan);
            }
        }
        if (previewEl && thread.lastMessage) {
            let previewText = thread.lastMessage.text || (thread.lastMessage.imageUrl ? '[Image]' : 'Aucun contenu');
            previewEl.textContent = sanitizeHTML(previewText.substring(0, 50) + (previewText.length > 50 ? '...' : ''));
        } else if (previewEl) {
            previewEl.textContent = "Aucun message";
        }
        if (timeEl && thread.lastMessage) {
            timeEl.textContent = formatDate(thread.lastMessage.createdAt, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
            timeEl.setAttribute('datetime', new Date(thread.lastMessage.createdAt).toISOString());
        }
        if (unreadBadge) {
            unreadBadge.textContent = thread.unreadCount > 9 ? '9+' : thread.unreadCount;
            unreadBadge.classList.toggle('hidden', !thread.unreadCount || thread.unreadCount === 0);
            unreadBadge.setAttribute('aria-label', `${thread.unreadCount} messages non lus`);
        }

        const openChatHandler = () => openChatView(thread.id, thread.recipient);
        listItem.addEventListener('click', openChatHandler);
        listItem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') openChatHandler();
        });
        threadListUl.appendChild(listItem);
    });
}


function displayNoThreads() {
    if (threadListUl) threadListUl.innerHTML = '';
    if (noThreadsPlaceholder) noThreadsPlaceholder.classList.remove('hidden');
}


/**
 * Affiche la vue de chat pour un thread donné.
 * @param {string} threadId - L'ID du thread à ouvrir.
 * @param {Object} recipient - L'objet du destinataire { id, name, avatarUrl, isBlockedByCurrentUser, isBlockingCurrentUser }.
 */
async function openChatView(threadId, recipient) {
    activeThreadId = threadId;
    currentRecipient = recipient; // Stocker l'objet recipient complet
    allMessagesLoaded = false;
    isLoadingHistory = false;

    if (chatRecipientAvatar) {
        chatRecipientAvatar.src = recipient.avatarUrl || 'avatar-default.svg';
        chatRecipientAvatar.alt = `Avatar de ${sanitizeHTML(recipient.name)}`;
    }
    if (chatRecipientName) chatRecipientName.textContent = sanitizeHTML(recipient.name);
    if (chatView) chatView.classList.remove('hidden');
    if (threadListView) threadListView.classList.add('hidden');
    if (chatMessagesContainer) chatMessagesContainer.innerHTML = '';
    if (chatMessageInput) {
        chatMessageInput.value = ''; // Vider le champ de saisie
        chatMessageInput.focus();
    }
    removeImagePreview(); // S'assurer qu'aucune preview ne reste

    // Gérer l'état de blocage
    updateBlockedUserUI(recipient.isBlockedByCurrentUser || recipient.isBlockingCurrentUser);


    markThreadAsRead(threadId);
    loadMessageHistory(threadId, true);
    setupInfiniteScroll();
}

/**
 * Met à jour l'UI en fonction de l'état de blocage.
 * @param {boolean} isBlocked - True si l'utilisateur est bloqué ou bloque.
 */
function updateBlockedUserUI(isBlocked) {
    if (!currentRecipient) return;

    const isBlockedByMe = currentRecipient.isBlockedByCurrentUser; // Supposons que cette info vient de l'objet recipient
    const amIBlockedByThem = currentRecipient.isBlockingCurrentUser; // Idem

    if (chatInputArea) {
        chatInputArea.classList.toggle('blocked', isBlockedByMe || amIBlockedByThem);
        if (chatMessageInput) {
            chatMessageInput.disabled = isBlockedByMe || amIBlockedByThem;
            chatMessageInput.placeholder = (isBlockedByMe || amIBlockedByThem) ? "Vous ne pouvez pas envoyer de messages." : "Écrire un message...";
        }
        if (sendChatMessageBtn) sendChatMessageBtn.disabled = isBlockedByMe || amIBlockedByThem;
        if (chatAttachImageBtn) chatAttachImageBtn.disabled = isBlockedByMe || amIBlockedByThem;
    }

    if (blockUserChatBtn && unblockUserChatBtn) {
        blockUserChatBtn.classList.toggle('hidden', isBlockedByMe);
        unblockUserChatBtn.classList.toggle('hidden', !isBlockedByMe);
        // Mettre à jour le texte du bouton de déblocage si nécessaire
        if (unblockUserChatBtn && !unblockUserChatBtn.classList.contains('hidden')) {
            unblockUserChatBtn.textContent = `Débloquer ${sanitizeHTML(currentRecipient.name)}`;
        }
    }
    if (chatOptionsBtn) chatOptionsBtn.disabled = amIBlockedByThem; // On ne peut pas agir si on est bloqué

    if (isBlockedByMe) {
        showToast(`Vous avez bloqué ${sanitizeHTML(currentRecipient.name)}.`, "info", 4000);
    } else if (amIBlockedByThem) {
        showToast(`${sanitizeHTML(currentRecipient.name)} vous a bloqué.`, "info", 4000);
    }
}


/**
 * Revient à la liste des threads.
 */
function showThreadList() {
    activeThreadId = null;
    currentRecipient = null;
    if (chatView) chatView.classList.add('hidden');
    if (threadListView) threadListView.classList.remove('hidden');
    if (chatOptionsMenu) chatOptionsMenu.classList.add('hidden');
    removeImagePreview();
    loadThreads();
}

/**
 * Charge l'historique des messages pour un thread.
 * @param {string} threadId
 * @param {boolean} [isInitialLoad=false]
 */
async function loadMessageHistory(threadId, isInitialLoad = false) {
    if (isLoadingHistory || allMessagesLoaded) return;
    isLoadingHistory = true;
    if (chatHistoryLoader) chatHistoryLoader.classList.remove('hidden');

    const oldestMessageEl = chatMessagesContainer.querySelector('.chat-message[data-message-timestamp]:first-child');
    const before = !isInitialLoad && oldestMessageEl ? oldestMessageEl.dataset.messageTimestamp : null;

    try {
        const messages = await secureFetch(`${API_MESSAGES_URL}/threads/${threadId}/messages?limit=20${before ? '&before=' + before : ''}`, {}, false);
        if (messages && Array.isArray(messages)) {
            if (messages.length < 20) {
                allMessagesLoaded = true;
                if (chatHistoryLoader && !isInitialLoad) {
                    chatHistoryLoader.innerHTML = '<p style="text-align:center; font-size:0.9em; color: var(--text-color-muted);" data-i18n="chat.startOfConversation">Début de la conversation.</p>';
                    setTimeout(() => {
                        if(chatHistoryLoader) chatHistoryLoader.classList.add('hidden');
                        if(chatHistoryLoader) chatHistoryLoader.innerHTML = '<div class="spinner"></div> <span data-i18n="chat.loadingHistory">Chargement des messages précédents...</span>';
                    }, 3000);
                }
            }
            renderMessages(messages, isInitialLoad ? 'append' : 'prepend');
            if (isInitialLoad) {
                 setTimeout(() => scrollToBottom(chatMessagesContainer, false), 50); // false pour scroll instantané au chargement
            }
        } else {
            allMessagesLoaded = true;
            if (chatHistoryLoader && isInitialLoad) chatHistoryLoader.classList.add('hidden');
        }
    } catch (error) {
        console.error("Erreur chargement historique messages:", error);
        showToast("Impossible de charger les messages.", "error");
    } finally {
        isLoadingHistory = false;
        if (chatHistoryLoader && (allMessagesLoaded || (messages && messages.length > 0))) {
             if(!allMessagesLoaded || isInitialLoad) chatHistoryLoader.classList.add('hidden');
        }
    }
}

/**
 * Affiche les messages dans la vue de chat.
 * @param {Array<Object>} messagesData
 * @param {string} [method='append']
 */
function renderMessages(messagesData, method = 'append') {
    if (!chatMessagesContainer || !chatMessageTemplate) return;
    const currentUser = state.getCurrentUser();
    if (!currentUser) return;

    const fragment = document.createDocumentFragment();

    messagesData.forEach(msg => {
        const templateClone = chatMessageTemplate.content.cloneNode(true);
        const messageEl = templateClone.querySelector('.chat-message');
        const messageContentWrapper = messageEl.querySelector('.message-content'); // Le nouveau wrapper
        const textEl = messageEl.querySelector('.message-text');
        const timeEl = messageEl.querySelector('.message-time');
        const actionsBtn = messageEl.querySelector('.message-actions-btn');
        const actionsMenu = messageEl.querySelector('.message-actions-menu');


        messageEl.dataset.messageId = msg.id;
        messageEl.dataset.senderId = msg.senderId;
        messageEl.dataset.messageTimestamp = new Date(msg.createdAt).getTime();

        if (msg.senderId === currentUser.id) {
            messageEl.classList.add('sent');
        } else {
            messageEl.classList.add('received');
        }

        if (msg.isDeleted) { // Si le message est marqué comme supprimé par le serveur
            textEl.innerHTML = `<em class="message-text-deleted" data-i18n="chat.messageDeletedBySender">Message supprimé par l'expéditeur.</em>`;
            if (actionsBtn) actionsBtn.classList.add('hidden'); // Cacher les actions pour un message supprimé
        } else if (msg.text) {
            textEl.innerHTML = sanitizeHTML(msg.text).replace(/\n/g, '<br>'); // Permettre les sauts de ligne
        } else if (msg.imageUrl) {
            const imgLink = document.createElement('a'); // Rendre l'image cliquable pour l'agrandir
            imgLink.href = msg.imageUrl;
            imgLink.target = '_blank';
            imgLink.setAttribute('aria-label', "Voir l'image en grand");

            const img = document.createElement('img');
            img.src = msg.imageUrl;
            img.alt = "Image envoyée";
            img.className = 'chat-image-attachment';
            img.onload = () => scrollToBottom(chatMessagesContainer, false);
            img.onerror = () => { img.alt = "Erreur chargement image"; img.src = "https://placehold.co/200x150/e0e0e0/757575?text=Image+erreur"; };
            imgLink.appendChild(img);
            textEl.innerHTML = ''; // Vider le p
            textEl.appendChild(imgLink);
        }

        if (timeEl) {
            timeEl.textContent = formatDate(msg.createdAt, { hour: '2-digit', minute: '2-digit' });
            timeEl.setAttribute('datetime', new Date(msg.createdAt).toISOString());
        }

        // Statut du message
        if (msg.senderId === currentUser.id && !msg.isDeleted) {
            let statusIndicator = messageEl.querySelector('.message-status-indicator');
            if (!statusIndicator) {
                statusIndicator = document.createElement('span');
                statusIndicator.className = 'message-status-indicator';
                // Insérer avant timeEl pour un meilleur placement visuel
                if(timeEl) timeEl.parentElement.insertBefore(statusIndicator, timeEl);
                else messageEl.appendChild(statusIndicator);
            }
            if (msg.status === 'read') statusIndicator.innerHTML = '<i class="fa-solid fa-check-double" style="color: var(--info-color);" aria-label="Lu"></i>';
            else if (msg.status === 'delivered') statusIndicator.innerHTML = '<i class="fa-solid fa-check-double" aria-label="Distribué"></i>';
            else if (msg.status === 'sent') statusIndicator.innerHTML = '<i class="fa-solid fa-check" aria-label="Envoyé"></i>';
            else if (msg.status === 'pending') statusIndicator.innerHTML = '<i class="fa-regular fa-clock" aria-label="En attente"></i>';
            else statusIndicator.innerHTML = ''; // Cacher si pas de statut pertinent
        }

        // Actions sur le message (report, delete, edit)
        if (actionsBtn && actionsMenu && !msg.isDeleted) {
            populateMessageActions(actionsMenu, msg, currentUser);
            actionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllMessageActionMenus(messageEl); // Fermer les autres menus
                actionsMenu.classList.toggle('hidden');
                actionsBtn.setAttribute('aria-expanded', actionsMenu.classList.contains('hidden') ? 'false' : 'true');
            });
        } else if (actionsBtn) {
            actionsBtn.classList.add('hidden'); // Cacher si pas de menu ou message supprimé
        }


        fragment.appendChild(messageEl);
    });

    const shouldScroll = method === 'append' && (chatMessagesContainer.scrollTop + chatMessagesContainer.clientHeight >= chatMessagesContainer.scrollHeight - 100);

    if (method === 'append') {
        chatMessagesContainer.appendChild(fragment);
        if(shouldScroll) scrollToBottom(chatMessagesContainer);
    } else {
        const oldScrollHeight = chatMessagesContainer.scrollHeight;
        const oldScrollTop = chatMessagesContainer.scrollTop;
        chatMessagesContainer.insertBefore(fragment, chatMessagesContainer.firstChild);
        chatMessagesContainer.scrollTop = oldScrollTop + (chatMessagesContainer.scrollHeight - oldScrollHeight);
    }
}

/**
 * Ferme tous les menus d'actions de message, sauf celui spécifié.
 * @param {HTMLElement} [excludeMessageEl=null] - L'élément message dont le menu ne doit pas être fermé.
 */
function closeAllMessageActionMenus(excludeMessageEl = null) {
    chatMessagesContainer.querySelectorAll('.chat-message').forEach(msgEl => {
        if (msgEl !== excludeMessageEl) {
            const menu = msgEl.querySelector('.message-actions-menu');
            const btn = msgEl.querySelector('.message-actions-btn');
            if (menu) menu.classList.add('hidden');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        }
    });
}


/**
 * Remplit le menu d'actions pour un message donné.
 * @param {HTMLElement} menuEl - L'élément du menu déroulant.
 * @param {Object} message - L'objet message.
 * @param {Object} currentUser - L'utilisateur actuel.
 */
function populateMessageActions(menuEl, message, currentUser) {
    menuEl.innerHTML = ''; // Vider les actions précédentes

    // Action: Signaler un message
    const reportBtn = document.createElement('button');
    reportBtn.setAttribute('role', 'menuitem');
    reportBtn.innerHTML = '<i class="fa-solid fa-flag"></i> Signaler message';
    reportBtn.addEventListener('click', () => handleReportMessage(message.id));
    menuEl.appendChild(reportBtn);

    if (message.senderId === currentUser.id) {
        // Action: Modifier message (stub)
        // const editBtn = document.createElement('button');
        // editBtn.setAttribute('role', 'menuitem');
        // editBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Modifier';
        // editBtn.addEventListener('click', () => handleEditMessage(message.id, message.text));
        // menuEl.appendChild(editBtn);

        // Action: Supprimer message (pour l'expéditeur)
        const deleteForSenderBtn = document.createElement('button');
        deleteForSenderBtn.setAttribute('role', 'menuitem');
        deleteForSenderBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Supprimer pour tous';
        deleteForSenderBtn.addEventListener('click', () => handleDeleteMessageForEveryone(message.id));
        menuEl.appendChild(deleteForSenderBtn);
    }

    // Action: Supprimer message localement (pour moi uniquement)
    // const deleteLocallyBtn = document.createElement('button');
    // deleteLocallyBtn.setAttribute('role', 'menuitem');
    // deleteLocallyBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Supprimer pour moi';
    // deleteLocallyBtn.addEventListener('click', () => handleDeleteMessageLocally(message.id));
    // menuEl.appendChild(deleteLocallyBtn);
}


/**
 * Fait défiler le conteneur de messages vers le bas.
 * @param {HTMLElement} container
 * @param {boolean} [smooth=true]
 */
function scrollToBottom(container, smooth = true) {
    if (container) {
        // Si le conteneur n'est pas scrollé jusqu'en bas, ne pas forcer le scroll (sauf si c'est un message de l'utilisateur actuel)
        // Cette logique peut être affinée. Pour l'instant, on scrolle toujours.
        container.scrollTo({
            top: container.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        });
    }
}

/**
 * Configure l'IntersectionObserver pour le scroll infini.
 */
function setupInfiniteScroll() {
    if (messageObserver) messageObserver.disconnect();

    const options = {
        root: null, // Observe par rapport au viewport
        rootMargin: '200px 0px 0px 0px', // Déclenche quand le premier message est à 200px du haut du viewport
        threshold: 0
    };

    messageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoadingHistory && !allMessagesLoaded && activeThreadId) {
                loadMessageHistory(activeThreadId, false);
            }
        });
    }, options);

    setTimeout(() => {
        const firstMessage = chatMessagesContainer.querySelector('.chat-message:first-child');
        if (firstMessage) {
            messageObserver.observe(firstMessage);
        }
    }, 500);
}

// --- Gestion des images dans le chat ---
function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (chatInputArea) chatInputArea.classList.add('dragover');
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    if (chatInputArea) chatInputArea.classList.remove('dragover');
}

function handleDropImage(event) {
    event.preventDefault();
    event.stopPropagation();
    if (chatInputArea) chatInputArea.classList.remove('dragover');
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        handleImageFileSelection({
            target: {
                files: files
            }
        }); // Simuler l'événement de sélection
    }
}

function handleImageFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!VALID_IMAGE_TYPES_CHAT.includes(file.type)) {
        showToast(`Format d'image invalide. Acceptés: ${VALID_IMAGE_TYPES_CHAT.join(', ')}`, "error");
        if(chatImageUploadInput) chatImageUploadInput.value = '';
        return;
    }
    if (file.size > MAX_IMAGE_SIZE_CHAT_BYTES) {
        showToast(`L'image est trop grande (max ${MAX_IMAGE_SIZE_CHAT_MB}MB).`, "error");
        if(chatImageUploadInput) chatImageUploadInput.value = '';
        return;
    }

    tempImageFileMessages = file;
    displayImagePreview(file);
    if(chatImageUploadInput) chatImageUploadInput.value = ''; // Permettre de re-sélectionner le même fichier
}

function displayImagePreview(file) {
    if (!chatImagePreviewContainer) return;
    chatImagePreviewContainer.innerHTML = ''; // Vider les previews précédentes
    chatImagePreviewContainer.classList.remove('hidden');

    chatImagePreviewImg = document.createElement('img');
    chatImagePreviewImg.alt = "Aperçu de l'image";
    chatImagePreviewImg.className = 'chat-image-preview-thumb';

    const reader = new FileReader();
    reader.onload = (e) => {
        if (chatImagePreviewImg) chatImagePreviewImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
    chatImagePreviewContainer.appendChild(chatImagePreviewImg);

    chatRemoveImagePreviewBtn = document.createElement('button');
    chatRemoveImagePreviewBtn.type = 'button';
    chatRemoveImagePreviewBtn.className = 'btn btn-icon btn-danger btn-sm chat-remove-preview-btn';
    chatRemoveImagePreviewBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
    chatRemoveImagePreviewBtn.setAttribute('aria-label', "Retirer l'image en aperçu");
    chatRemoveImagePreviewBtn.onclick = removeImagePreview;
    chatImagePreviewContainer.appendChild(chatRemoveImagePreviewBtn);
}

function removeImagePreview() {
    tempImageFileMessages = null;
    if (chatImagePreviewContainer) {
        chatImagePreviewContainer.innerHTML = '';
        chatImagePreviewContainer.classList.add('hidden');
    }
    chatImagePreviewImg = null;
    chatRemoveImagePreviewBtn = null;
    if (chatMessageInput) chatMessageInput.focus(); // Redonner le focus au champ de texte
}

/**
 * Envoie un message texte ou image.
 */
async function sendMessage() {
    const currentUser = state.getCurrentUser();
    const text = chatMessageInput ? chatMessageInput.value.trim() : '';

    if ((!text && !tempImageFileMessages) || !activeThreadId || !currentUser) {
        if (!activeThreadId) showToast("Aucune discussion active.", "warning");
        return;
    }
     // Vérifier si l'utilisateur est bloqué ou bloque
    if (currentRecipient && (currentRecipient.isBlockedByCurrentUser || currentRecipient.isBlockingCurrentUser)) {
        showToast("Vous ne pouvez pas envoyer de message à cet utilisateur.", "warning");
        return;
    }


    const tempMessageId = 'temp_' + generateUUID();
    const optimisticMessageData = {
        id: tempMessageId,
        threadId: activeThreadId,
        senderId: currentUser.id,
        text: text,
        imageUrl: tempImageFileMessages ? URL.createObjectURL(tempImageFileMessages) : null,
        createdAt: new Date().toISOString(),
        status: 'pending'
    };

    renderMessages([optimisticMessageData], 'append');
    scrollToBottom(chatMessagesContainer);
    if (chatMessageInput) chatMessageInput.value = '';
    const imageFileToSend = tempImageFileMessages; // Copier la référence avant de la nettoyer
    removeImagePreview(); // Nettoyer la preview et tempImageFileMessages

    try {
        const formData = new FormData();
        formData.append('threadId', activeThreadId);
        formData.append('recipientId', currentRecipient.id);
        if (text) formData.append('text', text);
        if (imageFileToSend) formData.append('image', imageFileToSend);

        const endpoint = imageFileToSend ? `${API_MESSAGES_URL}/messages/image` : `${API_MESSAGES_URL}/messages`;

        const response = await secureFetch(endpoint, {
            method: 'POST',
            body: formData // secureFetch gère le Content-Type pour FormData
        }, false);

        if (response && response.id) {
            const existingMessageEl = chatMessagesContainer.querySelector(`.chat-message[data-message-id="${tempMessageId}"]`);
            if (existingMessageEl) {
                existingMessageEl.dataset.messageId = response.id;
                // Le statut sera mis à jour par WebSocket via 'messageStatusUpdate' ou 'newMessage'
                // Si l'image a été envoyée, l'URL de l'image du serveur doit remplacer la preview locale si différente
                if (response.imageUrl && existingMessageEl.querySelector('img')) {
                    existingMessageEl.querySelector('img').src = response.imageUrl;
                }
                 // Mettre à jour le statut visuel si nécessaire (le socket le fera aussi)
                const statusIndicator = existingMessageEl.querySelector('.message-status-indicator');
                if (statusIndicator) statusIndicator.innerHTML = '<i class="fa-solid fa-check" aria-label="Envoyé"></i>';
            }
        } else {
            throw new Error(response.message || "Erreur d'envoi du message.");
        }
    } catch (error) {
        console.error("Erreur d'envoi du message:", error);
        showToast(`Erreur: ${error.message || "Impossible d'envoyer le message."}`, "error");
        const failedMessageEl = chatMessagesContainer.querySelector(`.chat-message[data-message-id="${tempMessageId}"]`);
        if (failedMessageEl) {
            let statusIndicator = failedMessageEl.querySelector('.message-status-indicator');
            if (!statusIndicator) {
                statusIndicator = document.createElement('span');
                statusIndicator.className = 'message-status-indicator';
                failedMessageEl.appendChild(statusIndicator);
            }
            statusIndicator.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger-color);" aria-label="Échec"></i>';
        }
    }
    if (chatMessageInput) chatMessageInput.focus();
    stopTypingEvent();
}

/**
 * Gère la réception d'un nouveau message via WebSocket.
 * @param {Object} messageData
 */
function handleNewMessageReceived(messageData) {
    if (!messageData || !messageData.threadId) return;

    const isChatActive = messageData.threadId === activeThreadId;
    const isAppFocused = document.hasFocus(); // Simple vérification si l'onglet est actif

    if (isChatActive) {
        renderMessages([messageData], 'append');
        scrollToBottom(chatMessagesContainer);
        if (isAppFocused && messagesModal && messagesModal.getAttribute('aria-hidden') === 'false') {
            markMessageAsReadOnServer(messageData.id, messageData.threadId);
        }
    } else {
        // Notification pour un autre thread
        const senderName = messageData.senderName || 'Nouvelle discussion'; // Le backend devrait fournir senderName
        showToast(`Nouveau message de ${sanitizeHTML(senderName)}`, 'info');
        if (newMessagesSound && state.get('settings.soundNotificationsEnabled')) { // Vérifier un paramètre
            newMessagesSound.play().catch(e => console.warn("Erreur lecture son notification:", e));
        }
        // TODO: navigator.vibrate() si activé et supporté
        // if (navigator.vibrate && state.get('settings.vibrationEnabled')) navigator.vibrate(200);
    }

    // Mettre à jour la liste des threads si elle est visible ou pour le badge global
    if ((messagesModal && messagesModal.getAttribute('aria-hidden') === 'false' && threadListView && !threadListView.classList.contains('hidden')) || !isChatActive) {
        loadThreads(); // Recharge pour mettre à jour les compteurs et l'ordre
    } else if (!isChatActive) {
        // Si la modale n'est pas ouverte, on met juste à jour le compteur global via l'event server ou en rechargeant les threads en silence
        // Le serveur devrait envoyer 'unreadCountUpdate'
    }
}


// ... (handleMessageStatusUpdate, markThreadAsRead, markMessageAsReadOnServer, updateGlobalUnreadCount - restent similaires) ...
// ... (sendTypingEvent, stopTypingEvent, handleTypingEventReceived - restent similaires) ...
// ... (toggleChatOptionsMenu - reste similaire) ...

/**
 * Gère la mise à jour du statut d'un message (distribué, lu).
 * @param {Object} statusUpdate - { messageId, status, threadId, readerId }
 */
function handleMessageStatusUpdate(statusUpdate) {
    if (!statusUpdate || !statusUpdate.messageId || !statusUpdate.threadId) return;

    if (statusUpdate.threadId === activeThreadId) {
        const messageEl = chatMessagesContainer.querySelector(`.chat-message[data-message-id="${statusUpdate.messageId}"]`);
        if (messageEl) {
            let statusIndicator = messageEl.querySelector('.message-status-indicator');
            if (!statusIndicator) { // S'il n'existe pas, le créer
                statusIndicator = document.createElement('span');
                statusIndicator.className = 'message-status-indicator';
                const timeEl = messageEl.querySelector('.message-time');
                if(timeEl) timeEl.parentElement.insertBefore(statusIndicator, timeEl);
                else messageEl.appendChild(statusIndicator);
            }

            const currentStatusIcon = statusIndicator.querySelector('i');
            const isAlreadyRead = currentStatusIcon && currentStatusIcon.style.color === 'var(--info-color)'; // Heuristique pour 'lu'

            if (statusUpdate.status === 'read') {
                statusIndicator.innerHTML = '<i class="fa-solid fa-check-double" style="color: var(--info-color);" aria-label="Lu"></i>';
            } else if (statusUpdate.status === 'delivered' && !isAlreadyRead) {
                statusIndicator.innerHTML = '<i class="fa-solid fa-check-double" aria-label="Distribué"></i>';
            }
            // 'sent' est généralement géré localement ou par la première réponse du serveur.
        }
    }
}

/**
 * Marque un thread comme lu (localement et informe le serveur).
 * @param {string} threadId
 */
function markThreadAsRead(threadId) {
    const threadItem = threadListUl ? threadListUl.querySelector(`.thread-item[data-thread-id="${threadId}"]`) : null;
    if (threadItem) {
        const unreadBadge = threadItem.querySelector('.unread-badge');
        if (unreadBadge && !unreadBadge.classList.contains('hidden')) {
            unreadBadge.classList.add('hidden');
            // Mettre à jour le compteur global en conséquence
            const currentGlobalCount = state.get('messages.unreadGlobalCount') || 0;
            const threadUnreadCount = parseInt(unreadBadge.textContent) || 0;
            updateGlobalUnreadCount(Math.max(0, currentGlobalCount - threadUnreadCount));
        }
    }
    if (socket && socket.connected) {
        socket.emit('markThreadRead', { threadId });
    }
}

/**
 * Informe le serveur qu'un message a été lu (si la fenêtre est active).
 * @param {string} messageId
 * @param {string} threadId
 */
function markMessageAsReadOnServer(messageId, threadId) {
    if (socket && socket.connected && activeThreadId === threadId && document.hasFocus()) {
        // Vérifier si la modale de chat est bien celle affichée
        if (messagesModal && messagesModal.getAttribute('aria-hidden') === 'false' &&
            chatView && !chatView.classList.contains('hidden')) {
            socket.emit('markMessageRead', { messageId, threadId });
        }
    }
}

/**
 * Met à jour le badge global des messages non lus.
 * @param {number} count - Le nombre total de messages non lus.
 */
function updateGlobalUnreadCount(count) {
    const newCount = Math.max(0, count); // S'assurer que ce n'est pas négatif
    if (messagesNavBadge) {
        const displayCount = newCount > 99 ? '99+' : newCount;
        messagesNavBadge.textContent = displayCount;
        messagesNavBadge.dataset.count = newCount;
        messagesNavBadge.classList.toggle('hidden', newCount === 0);
        messagesNavBadge.setAttribute('aria-label', `${newCount} messages non lus`);
    }
    state.set('messages.unreadGlobalCount', newCount, true); // true pour mise à jour silencieuse de l'état si le serveur est la source de vérité
}


// --- Typing Indicators ---
function sendTypingEvent() {
    if (!socket || !socket.connected || !activeThreadId || (currentRecipient && (currentRecipient.isBlockedByCurrentUser || currentRecipient.isBlockingCurrentUser)) ) return;
    if (typingTimer) clearTimeout(typingTimer);

    socket.emit('typing', {
        threadId: activeThreadId,
        isTyping: true
    });
    typingTimer = setTimeout(stopTypingEvent, TYPING_TIMEOUT);
}

function stopTypingEvent() {
    if (!socket || !socket.connected || !activeThreadId) return;
    if (typingTimer) clearTimeout(typingTimer);
    socket.emit('typing', {
        threadId: activeThreadId,
        isTyping: false
    });
}

function handleTypingEventReceived({ threadId, userId, userName, isTyping }) {
    if (threadId === activeThreadId && userId !== state.getCurrentUser()?.id) {
        if (chatTypingIndicator) {
            chatTypingIndicator.classList.toggle('hidden', !isTyping);
            if (isTyping) {
                const typingTextEl = chatTypingIndicator.querySelector('span:not(.dots)');
                if(typingTextEl) typingTextEl.textContent = `${sanitizeHTML(userName || 'Quelqu\'un')} écrit`;
            }
        }
    }
}

// --- Chat Options ---
function toggleChatOptionsMenu() {
    if (chatOptionsMenu && chatOptionsBtn) {
        const isHidden = chatOptionsMenu.classList.toggle('hidden');
        chatOptionsBtn.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
        if (!isHidden) { // Si on ouvre le menu
            // Mettre à jour l'état du bouton bloquer/débloquer
            if (currentRecipient && blockUserChatBtn && unblockUserChatBtn) {
                const isBlockedByMe = currentRecipient.isBlockedByCurrentUser; // Supposer que cette info est dans currentRecipient
                blockUserChatBtn.classList.toggle('hidden', isBlockedByMe);
                unblockUserChatBtn.classList.toggle('hidden', !isBlockedByMe);
                if(unblockUserChatBtn && !unblockUserChatBtn.classList.contains('hidden')) {
                    unblockUserChatBtn.textContent = `Débloquer ${sanitizeHTML(currentRecipient.name)}`;
                }
            }
            chatOptionsMenu.focus(); // Pour accessibilité clavier
        }
    }
}


async function handleArchiveChat() {
    if (!activeThreadId) return;
    toggleChatOptionsMenu();
    try {
        toggleGlobalLoader(true, "Archivage de la discussion...");
        const response = await secureFetch(`${API_MESSAGES_URL}/threads/${activeThreadId}/archive`, {
            method: 'POST'
        }, false);
        toggleGlobalLoader(false);
        if (response && response.success) {
            showToast("Discussion archivée.", "success");
            loadThreads(); // Recharger pour que le thread disparaisse de la liste principale
            showThreadList(); // Revenir à la liste
        } else {
            showToast(response.message || "Erreur lors de l'archivage.", "error");
        }
    } catch (error) {
        toggleGlobalLoader(false);
        console.error("Erreur archivage:", error);
    }
}

async function handleDeleteChatLocally() { // Suppression locale du thread
    if (!activeThreadId) return;
    toggleChatOptionsMenu();
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal',
            title: 'Masquer la discussion',
            message: 'Voulez-vous masquer cette discussion de votre liste ? Elle restera visible pour l\'autre utilisateur.',
            confirmButtonText: 'Masquer',
            onConfirm: async () => {
                try {
                    toggleGlobalLoader(true, "Masquage de la discussion...");
                    // L'API pourrait être un POST /api/messages/threads/{threadId}/hide
                    // Pour l'instant, on simule une suppression locale en filtrant l'état
                    // Ceci n'est PAS persistant sans appel API.
                    const currentThreads = state.get('messages.threads') || [];
                    const updatedThreads = currentThreads.filter(t => t.id !== activeThreadId);
                    state.set('messages.threads', updatedThreads); // Ceci va re-render la liste si elle est visible
                    toggleGlobalLoader(false);
                    showToast("Discussion masquée localement.", "info");
                    showThreadList();
                } catch (error) { // Si un appel API était fait
                    toggleGlobalLoader(false);
                    console.error("Erreur masquage discussion:", error);
                }
            }
        }
    }));
}

async function handleToggleBlockUser(blockAction) { // true pour bloquer, false pour débloquer
    if (!currentRecipient || !currentRecipient.id) return;
    toggleChatOptionsMenu();
    const actionText = blockAction ? "bloquer" : "débloquer";
    const userName = sanitizeHTML(currentRecipient.name);

    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal',
            title: `${blockAction ? 'Bloquer' : 'Débloquer'} ${userName}`,
            message: `Êtes-vous sûr de vouloir ${actionText} ${userName} ?`,
            confirmButtonText: blockAction ? 'Bloquer' : 'Débloquer',
            confirmButtonClass: blockAction ? 'btn-danger' : 'btn-success',
            onConfirm: async () => {
                try {
                    toggleGlobalLoader(true, `${blockAction ? 'Blocage' : 'Déblocage'} en cours...`);
                    const response = await secureFetch(`${API_USERS_URL}/${currentRecipient.id}/${actionText}`, {
                        method: 'POST'
                    }, false);
                    toggleGlobalLoader(false);

                    if (response && response.success) {
                        showToast(`${userName} a été ${actionText === 'bloquer' ? 'bloqué(e)' : 'débloqué(e)'}.`, "success");
                        // Mettre à jour l'état de `currentRecipient` et l'UI
                        currentRecipient.isBlockedByCurrentUser = blockAction; // Supposons que le backend confirme cet état
                        updateBlockedUserUI(blockAction);
                        // Recharger les threads peut être nécessaire si le backend filtre les threads des utilisateurs bloqués
                        loadThreads();
                    } else {
                        showToast(response.message || `Erreur lors du ${actionText}.`, "error");
                    }
                } catch (error) {
                    toggleGlobalLoader(false);
                    console.error(`Erreur ${actionText}:`, error);
                }
            }
        }
    }));
}

// --- Actions sur les messages individuels ---
async function handleReportMessage(messageId) {
    closeAllMessageActionMenus();
    if (!messageId) return;
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal', // Ou une modale de signalement plus spécifique
            title: 'Signaler le message',
            message: 'Êtes-vous sûr de vouloir signaler ce message comme inapproprié ?',
            // On pourrait ajouter un champ pour la raison du signalement ici.
            confirmButtonText: 'Signaler',
            onConfirm: async () => {
                try {
                    toggleGlobalLoader(true, "Envoi du signalement...");
                    const response = await secureFetch(API_REPORTS_URL, {
                        method: 'POST',
                        body: {
                            targetType: 'message',
                            targetId: messageId,
                            threadId: activeThreadId,
                            // reason: "..." // Si un champ de raison est ajouté
                        }
                    }, false);
                    toggleGlobalLoader(false);
                    if (response && response.success) {
                        showToast("Message signalé. Merci pour votre aide.", "success");
                    } else {
                        showToast(response.message || "Erreur lors du signalement.", "error");
                    }
                } catch (error) {
                    toggleGlobalLoader(false);
                    console.error("Erreur signalement message:", error);
                }
            }
        }
    }));
}

async function handleDeleteMessageForEveryone(messageId) {
    closeAllMessageActionMenus();
    if (!messageId || !activeThreadId) return;
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal',
            title: 'Supprimer le message',
            message: 'Voulez-vous supprimer ce message pour tous les participants ? Cette action est irréversible.',
            confirmButtonText: 'Supprimer pour tous',
            confirmButtonClass: 'btn-danger',
            onConfirm: async () => {
                try {
                    toggleGlobalLoader(true, "Suppression du message...");
                    const response = await secureFetch(`${API_MESSAGES_URL}/messages/${messageId}`, {
                        method: 'DELETE',
                        body: {
                            scope: 'everyone'
                        } // Indiquer la portée de la suppression
                    }, false);
                    toggleGlobalLoader(false);
                    if (response && response.success) {
                        showToast("Message supprimé.", "success");
                        // Le serveur devrait envoyer un événement WebSocket 'messageDeleted'
                        // pour que tous les clients mettent à jour leur UI.
                        // Si ce n'est pas le cas, on met à jour localement:
                        // const messageEl = chatMessagesContainer.querySelector(`.chat-message[data-message-id="${messageId}"]`);
                        // if (messageEl) {
                        //     messageEl.classList.add('message-deleted-notice');
                        //     messageEl.innerHTML = `<p class="message-text-deleted"><em>Message supprimé.</em></p><time class="message-time">${messageEl.querySelector('.message-time')?.textContent || ''}</time>`;
                        // }
                    } else {
                        showToast(response.message || "Erreur suppression message.", "error");
                    }
                } catch (error) {
                    toggleGlobalLoader(false);
                    console.error("Erreur suppression message:", error);
                }
            }
        }
    }));
}

// async function handleEditMessage(messageId, currentText) { ... stub ... }
// async function handleDeleteMessageLocally(messageId) { ... stub ... }


// --- Gestion de l'initiation d'un chat --- (reste similaire)
/**
 * Gère l'événement pour initier une nouvelle discussion.
 * @param {CustomEvent} event - event.detail doit contenir { adId (optionnel), recipientId }
 */
async function handleInitiateChatEvent(event) {
    const { adId, recipientId, recipientName, recipientAvatarUrl } = event.detail; // Peut recevoir plus d'infos
    if (!recipientId) {
        showToast("Destinataire non spécifié pour le chat.", "error");
        return;
    }
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        showToast("Veuillez vous connecter pour envoyer un message.", "warning");
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal' } }));
        return;
    }
    if (currentUser.id === recipientId) {
        showToast("Vous ne pouvez pas vous envoyer de message à vous-même.", "info");
        return;
    }

    try {
        toggleGlobalLoader(true, "Ouverture de la discussion...");
        const thread = await secureFetch(`${API_MESSAGES_URL}/threads/initiate`, {
            method: 'POST',
            body: { recipientId, adId }
        }, false);
        toggleGlobalLoader(false);

        if (thread && thread.id && thread.recipient) {
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'messages-modal' } }));
            setTimeout(() => {
                 openChatView(thread.id, thread.recipient); // thread.recipient devrait contenir les infos à jour
            }, 100);
        } else {
            showToast(thread.message || "Impossible de démarrer la discussion.", "error");
        }
    } catch (error) {
        toggleGlobalLoader(false);
        console.error("Erreur lors de l'initiation du chat:", error);
    }
}


/**
 * Initialise le module de messagerie.
 */
export function init() {
    initMessagesUI();
    console.log('Module Messages initialisé (avec améliorations).');
}
