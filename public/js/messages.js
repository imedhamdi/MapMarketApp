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
    formatDate,
    formatPrice,
    generateUUID
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
let backToThreadsBtn, chatRecipientAvatar, chatRecipientName, chatRecipientStatus, chatOptionsBtn, chatOptionsMenu, blockUserChatBtn, deleteChatBtn;
let chatMessagesContainer, chatMessageTemplate, chatHistoryLoader, chatTypingIndicator;
let chatInputArea, chatMessageInput, sendChatMessageBtn, chatAttachImageBtn, chatImageUploadInput, chatImagePreviewContainer;
let chatComposerBtn, chatComposerMenu, chatMakeOfferBtn, chatShareLocationBtn, chatMeetBtn, offerModal, submitOfferBtn, appointmentModal, submitAppointmentBtn;
let threadsTabs;
let messagesNavBadge, navMessagesBtn;
let newMessagesSound;

// --- État du module ---
let socket = null;
let activeThreadId = null;
let currentRecipient = null;
let newChatContext = null; // Contexte pour une nouvelle discussion (non liée à un thread existant)
let messageObserver = null;
let isLoadingHistory = false;
let allMessagesLoaded = false;
let typingTimer = null;
let tempImageFile = null;
let currentTabRole = 'purchases';

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
        chatRecipientStatus: 'chat-recipient-status',
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
        chatComposerBtn: 'chat-composer-btn',
        chatComposerMenu: 'chat-composer-menu',
        chatAttachImageBtn: 'chat-attach-image-btn',
        chatImageUploadInput: 'chat-image-upload-input',
        chatImagePreviewContainer: 'chat-image-preview-container',
        chatMakeOfferBtn: 'chat-make-offer-btn',
        chatShareLocationBtn: 'chat-share-location-btn',
        chatMeetBtn: 'chat-meet-btn',
        offerModal: 'offer-modal',
        submitOfferBtn: 'submit-offer-btn',
        appointmentModal: 'appointment-modal',
        submitAppointmentBtn: 'submit-appointment-btn',
        threadsTabs: 'threads-tabs'
    };

    const elements = {
        messagesModal, threadListView, chatView, threadListUl, threadItemTemplate, noThreadsPlaceholder,
        backToThreadsBtn, chatRecipientAvatar, chatRecipientName, chatRecipientStatus, chatOptionsBtn, chatOptionsMenu,
        blockUserChatBtn, deleteChatBtn, chatMessagesContainer, chatMessageTemplate, chatHistoryLoader,
        chatTypingIndicator, chatInputArea, chatMessageInput, sendChatMessageBtn, messagesNavBadge,
        navMessagesBtn, chatComposerBtn, chatComposerMenu, chatAttachImageBtn, chatImageUploadInput, chatImagePreviewContainer,
        chatMakeOfferBtn, chatShareLocationBtn, chatMeetBtn, offerModal, submitOfferBtn,
        appointmentModal, submitAppointmentBtn, threadsTabs
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

    if (sendChatMessageBtn) {
        sendChatMessageBtn.disabled = true;
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
    chatMessageInput.addEventListener('input', () => {
        sendTypingEvent();
        updateSendButtonState();
    });
    chatMessageInput.addEventListener('input', adjustTextareaHeight);
    chatOptionsBtn.addEventListener('click', toggleChatOptionsMenu);
    document.addEventListener('click', closeOptionsMenuOnClickOutside, true);
    chatComposerBtn?.addEventListener('click', toggleComposerMenu);
    document.addEventListener('click', closeComposerMenuOnClickOutside);
    chatAttachImageBtn.addEventListener('click', () => {
        chatImageUploadInput.click();
        toggleComposerMenu(true);
    });
    chatImageUploadInput.addEventListener('change', handleImageFileSelection);
    threadsTabs?.addEventListener('click', handleThreadsTabClick);
    chatMakeOfferBtn?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'offer-modal', triggerElement: chatMakeOfferBtn } }));
        toggleComposerMenu(true);
    });
    submitOfferBtn?.addEventListener('click', () => {
        const input = document.getElementById('offer-amount-input');
        const amount = parseFloat(input?.value);
        if (!amount) { showToast('Montant invalide', 'warning'); return; }
        sendOfferMessage(amount);
    });
    chatShareLocationBtn?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            showToast('Géolocalisation non supportée', 'error');
            return;
        }
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            sendLocationMessage({ latitude, longitude });
        }, () => showToast('Impossible de récupérer la position', 'error'));
        toggleComposerMenu(true);
    });
    chatMeetBtn?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'appointment-modal', triggerElement: chatMeetBtn } }));
        toggleComposerMenu(true);
    });
    submitAppointmentBtn?.addEventListener('click', () => {
        const date = document.getElementById('appointment-date')?.value;
        const time = document.getElementById('appointment-time')?.value;
        const location = document.getElementById('appointment-location')?.value?.trim();
        if (!date || !time || !location) { showToast('Informations RDV manquantes', 'warning'); return; }
        const iso = new Date(`${date}T${time}`).toISOString();
        sendAppointmentMessage({ date: iso, location, status: 'pending' });
    });

    if (deleteChatBtn) {
        deleteChatBtn.addEventListener('click', () => {
            const threadIdToDelete = activeThreadId;
            if (!threadIdToDelete) {
                showToast("Aucune conversation active à supprimer.", "error");
                return;
            }

            // Fermer le petit menu d'options avant d'ouvrir la modale de confirmation
            if (chatOptionsMenu) chatOptionsMenu.classList.add('hidden');

            document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                detail: {
                    modalId: 'confirmation-modal',
                    title: 'Masquer la conversation',
                    message: 'Cette action masquera la conversation de votre liste. Elle réapparaîtra si vous ou votre interlocuteur envoyez un nouveau message. Continuer ?',
                    confirmButtonText: 'Masquer',
                    cancelButtonText: 'Annuler',
                    isDestructive: true,
                    onConfirm: async () => {
                        toggleGlobalLoader(true, "Masquage en cours...");
                        try {
                            const response = await secureFetch(`${API_MESSAGES_URL}/threads/${threadIdToDelete}/local`, {
                                method: 'DELETE'
                            }, false);

                            if (response && response.success) {
                                showToast("Conversation masquée de votre liste.", "success");
                                showThreadList(); // Revenir à la liste qui sera mise à jour
                            } else {
                                throw new Error(response.message || 'Impossible de masquer la conversation.');
                            }

                        } catch (error) {
                            showToast(error.message, 'error');
                        } finally {
                            toggleGlobalLoader(false);
                        }
                    }
                }
            }));
        });
    }
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
    socket.on('newThread', (newThreadData) => {
        console.log('Nouveau thread reçu !', newThreadData);
        loadThreads(currentTabRole);
    });
    socket.on('messagesRead', ({ threadId, readerId }) => {
        if (activeThreadId === threadId) {
            document.querySelectorAll('.chat-message[data-sender-id="me"]').forEach(msgEl => {
                const statusContainer = msgEl.querySelector('.message-status-icons');
                if (statusContainer) {
                    statusContainer.innerHTML = '<i class="fa-solid fa-check-double" style="color: #4fc3f7;"></i>';
                }
            });
        }
        handleMessagesReadByOther({ threadId, readerId });
    });
    socket.on('userStatusUpdate', handleUserStatusUpdate);
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
    loadThreads(currentTabRole);
}

/**
 * Ouvre la vue de chat pour un thread existant ou une nouvelle discussion.
 * @param {string|null} threadId - L'ID du thread, ou null pour une nouvelle discussion.
 * @param {object} recipient - L'objet de l'autre participant.
 * @param {object} [threadData] - Données optionnelles du thread (pour les nouvelles discussions).
 */
async function openChatView(threadId, recipient, threadData = null) {
    activeThreadId = threadId;
    currentRecipient = recipient;
    allMessagesLoaded = false;
    isLoadingHistory = false;

    // Contexte pour une nouvelle discussion
    if (!threadId && threadData && threadData.ad) {
        newChatContext = {
            recipientId: recipient.id || recipient._id,
            adId: threadData.ad._id || threadData.ad.id
        };
    } else {
        newChatContext = null;
    }

    // --- Mise à jour UI ---
    chatRecipientAvatar.src = recipient?.avatarUrl || 'avatar-default.svg';
    chatRecipientName.textContent = sanitizeHTML(recipient?.name || 'Nouveau contact');
    if (chatRecipientStatus) {
        if (recipient?.isOnline) {
            chatRecipientStatus.textContent = 'en ligne';
        } else if (recipient?.lastSeen) {
            const diff = Date.now() - new Date(recipient.lastSeen).getTime();
            const minutes = Math.floor(diff / 60000);
            if (minutes < 1) chatRecipientStatus.textContent = 'vu à l\'instant';
            else if (minutes < 60) chatRecipientStatus.textContent = `vu il y a ${minutes} minute${minutes>1?'s':''}`;
            else {
                const hours = Math.floor(minutes/60);
                chatRecipientStatus.textContent = `vu il y a ${hours}h`;
            }
        } else {
            chatRecipientStatus.textContent = '';
        }
    }

    // -- Mise à jour du bandeau de l'annonce --
    const chatAdSummary = document.getElementById('chat-ad-summary');
    const adForSummary = threadData?.ad;

    if (chatAdSummary && adForSummary) {
        chatAdSummary.classList.remove('hidden');
        const thumb = document.getElementById('chat-ad-thumbnail');
        const link = document.getElementById('chat-ad-link');
        const price = document.getElementById('chat-ad-price');

        if(thumb) thumb.src = (adForSummary.imageUrls && adForSummary.imageUrls[0]) ? adForSummary.imageUrls[0] : 'https://placehold.co/60x60/e0e0e0/757575?text=Ad';
        if(link) link.textContent = sanitizeHTML(adForSummary.title);
        if(price) price.textContent = formatPrice(adForSummary.price, adForSummary.currency);
        
        link.onclick = (e) => {
            e.preventDefault();
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'messages-modal' } }));
            setTimeout(() => {
                 document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', { detail: { adId: adForSummary._id } }));
            }, 100);
        };
    } else if (chatAdSummary) {
        chatAdSummary.classList.add('hidden');
    }

    // --- Fin mise à jour bandeau ---

    threadListView.classList.remove('active-view');
    chatView.classList.add('active-view');
    
    // Réinitialisation
    chatMessagesContainer.innerHTML = '';
    chatMessageInput.value = '';
    chatMessageInput.focus();
    adjustTextareaHeight();
    removeImagePreview();
    updateSendButtonState();
    
    if (threadId) {
        markThreadAsRead(threadId);
        await loadMessageHistory(threadId, true);
        setupInfiniteScroll();
    } else {
        chatHistoryLoader.innerHTML = `<p class="text-center text-muted">Envoyez le premier message !</p>`;
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
async function loadThreads(role = 'purchases') {
    if (!threadListUl) return;
    threadListUl.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    try {
        const response = await secureFetch(`${API_MESSAGES_URL}/threads?role=${role}`, {}, false);
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

        li.addEventListener('click', () => openChatView(thread._id, recipient, thread));
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

    let lastDay = null;
    messages.forEach((msg, index) => {
        const msgDate = new Date(msg.createdAt);
        const msgDayKey = msgDate.toDateString();
        if (lastDay && lastDay !== msgDayKey) {
            const sep = document.createElement('div');
            sep.className = 'date-separator';
            sep.textContent = msgDate.toLocaleDateString();
            fragment.appendChild(sep);
        }
        const clone = chatMessageTemplate.content.cloneNode(true);
        const messageEl = clone.querySelector('.chat-message');
        const textEl = messageEl.querySelector('.message-text');
        const timeEl = messageEl.querySelector('.message-time');
        const statusEl = messageEl.querySelector('.message-status-icons');
        const readEl = messageEl.querySelector('.read-indicator');

        if (msg._id) messageEl.dataset.messageId = msg._id;
        if (msg.tempId) messageEl.dataset.tempId = msg.tempId;
        messageEl.dataset.messageTimestamp = new Date(msg.createdAt).getTime();

        const isSentByMe = (msg.senderId?._id || msg.senderId) === currentUserId;
        messageEl.dataset.senderId = isSentByMe ? 'me' : 'other';
        // classes de groupage déterminées après insertion

        switch (msg.type) {
            case 'image':
                if (msg.imageUrl) {
                    const img = document.createElement('img');
                    img.src = msg.imageUrl;
                    img.className = 'chat-image-attachment';
                    img.alt = 'Image envoyée';
                    textEl.innerHTML = '';
                    textEl.appendChild(img);
                }
                break;
            case 'offer':
                const offerTpl = document.getElementById('offer-card-template');
                if (offerTpl) {
                    const card = offerTpl.content.firstElementChild.cloneNode(true);
                    card.querySelector('.offer-amount').textContent = msg.metadata.amount;
                    card.querySelector('.offer-status').textContent = msg.metadata.status || '';
                    if (!isSentByMe && msg.metadata.status === 'pending') {
                        card.querySelector('.offer-accept-btn')?.addEventListener('click', () => handleOfferAction(msg._id, true));
                        card.querySelector('.offer-decline-btn')?.addEventListener('click', () => handleOfferAction(msg._id, false));
                    } else {
                        card.querySelector('.offer-actions')?.remove();
                    }
                    textEl.innerHTML = '';
                    textEl.appendChild(card);
                } else {
                    textEl.textContent = `Offre: ${msg.metadata.amount}`;
                }
                break;
            case 'appointment':
                const appTpl = document.getElementById('appointment-card-template');
                if (appTpl) {
                    const card = appTpl.content.firstElementChild.cloneNode(true);
                    card.querySelector('.appointment-date').textContent = new Date(msg.metadata.date).toLocaleDateString();
                    card.querySelector('.appointment-time').textContent = new Date(msg.metadata.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
                    card.querySelector('.appointment-location').textContent = msg.metadata.location || '';
                    card.querySelector('.appointment-status').textContent = msg.metadata.status || '';
                    if (!isSentByMe && msg.metadata.status === 'pending') {
                        card.querySelector('.appointment-confirm-btn')?.addEventListener('click', () => sendMessage());
                        card.querySelector('.appointment-cancel-btn')?.addEventListener('click', () => sendMessage());
                    } else {
                        card.querySelector('.appointment-actions')?.remove();
                    }
                    textEl.innerHTML = '';
                    textEl.appendChild(card);
                }
                break;
            case 'location':
                const locTpl = document.getElementById('location-card-template');
                if (locTpl) {
                    const card = locTpl.content.firstElementChild.cloneNode(true);
                    card.querySelector('.location-coords').textContent = `${msg.metadata.latitude}, ${msg.metadata.longitude}`;
                    card.querySelector('.location-map-link').href = `https://maps.google.com/?q=${msg.metadata.latitude},${msg.metadata.longitude}`;
                    textEl.innerHTML = '';
                    textEl.appendChild(card);
                }
                break;
            case 'system':
                const sysTpl = document.getElementById('system-message-template');
                if (sysTpl) {
                    const card = sysTpl.content.firstElementChild.cloneNode(true);
                    card.textContent = sanitizeHTML(msg.text);
                    textEl.innerHTML = '';
                    textEl.appendChild(card);
                } else {
                    textEl.textContent = sanitizeHTML(msg.text);
                }
                messageEl.classList.add('system-message');
                break;
            default:
                textEl.innerHTML = sanitizeHTML(msg.text || '').replace(/\n/g, '<br>');
        }

        timeEl.textContent = formatDate(msg.createdAt, { hour: '2-digit', minute: '2-digit' });

        if (isSentByMe) {
            switch (msg.status) {
                case 'sending':
                    statusEl.innerHTML = '<i class="fa-regular fa-clock"></i>';
                    messageEl.classList.add('sending-message');
                    break;
                case 'sent':
                    statusEl.innerHTML = '<i class="fa-solid fa-check"></i>';
                    break;
                case 'read':
                    statusEl.innerHTML = '<i class="fa-solid fa-check-double"></i>';
                    break;
                case 'failed_to_send':
                case 'failed':
                    statusEl.innerHTML = '<i class="fa-solid fa-circle-exclamation text-danger"></i>';
                    messageEl.classList.add('message-failed');
                    break;
                default:
                    statusEl.innerHTML = '';
            }
        }

        if (isSentByMe && msg.status === 'read') {
            readEl.classList.remove('hidden');
        } else {
            readEl.classList.add('hidden');
        }
        fragment.appendChild(clone);
        lastDay = msgDayKey;
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
    updateMessageGrouping();
}

// --- ACTIONS UTILISATEUR ET ENVOI ---

function handleInputKeypress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function handleThreadsTabClick(e) {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    threadsTabs.querySelectorAll('[data-tab]').forEach(b => {
        b.classList.remove('active');
    });
    btn.classList.add('active');
    currentTabRole = btn.dataset.tab || 'purchases';
    loadThreads(currentTabRole);
}

// --- ENVOI INTERNE ---
async function _sendPayload(payload, imageFile) {
    const hasImage = Boolean(imageFile);
    const tempId = generateUUID(); // Génère un ID unique pour ce message
    payload.tempId = tempId; // Ajoute le tempId au payload qui sera envoyé

    const tempMessage = {
        tempId: tempId, // Important : on le garde pour le retrouver
        threadId: payload.threadId || activeThreadId,
        text: payload.text,
        type: payload.type,
        metadata: payload.metadata || undefined,
        imageUrl: hasImage ? URL.createObjectURL(imageFile) : undefined,
        senderId: {
            _id: state.getCurrentUser()._id,
            name: 'Moi',
            avatarUrl: state.getCurrentUser().avatarUrl
        },
        status: 'sending',
        createdAt: new Date().toISOString()
    };
    renderMessages([tempMessage], 'append');

    let endpoint;
    const requestOptions = { method: 'POST' };

    if (hasImage) {
        endpoint = `${API_MESSAGES_URL}/messages/image`;
        const formData = new FormData();
        formData.append('image', imageFile);
        for (const key in payload) {
            if (payload[key] !== undefined && payload[key] !== null) {
                 if (typeof payload[key] === 'object' && payload[key] !== null) {
                    formData.append(key, JSON.stringify(payload[key]));
                } else {
                    formData.append(key, payload[key]);
                }
            }
        }
        requestOptions.body = formData;
    } else {
        endpoint = `${API_MESSAGES_URL}/messages`;
        requestOptions.body = payload;
    }

    const messageInputBeforeSend = chatMessageInput.value;
    const imageFileBeforeSend = tempImageFile;

    chatMessageInput.value = '';
    removeImagePreview();
    stopTypingEvent();
    updateSendButtonState();

    try {
        const response = await secureFetch(endpoint, requestOptions, false);
        if (!response || !response.success) {
            throw new Error(response?.message || "Erreur lors de l'envoi du message.");
        }
        if (!activeThreadId && response.data?.threadId) {
            activeThreadId = response.data.threadId;
            newChatContext = null;
            loadThreads(currentTabRole);
        }
    } catch (error) {
        console.error("Erreur d'envoi de message interceptée dans _sendPayload:", error);
        chatMessageInput.value = messageInputBeforeSend;
        if (imageFileBeforeSend) {
            tempImageFile = imageFileBeforeSend;
            displayImagePreview(imageFileBeforeSend);
        }
        const failedEl = chatMessagesContainer.querySelector(`.chat-message[data-temp-id="${tempId}"]`);
        if (failedEl) {
            failedEl.classList.add('message-failed');
            const statusContainer = failedEl.querySelector('.message-status-icons');
            if (statusContainer) {
                statusContainer.innerHTML = '<i class="fa-solid fa-circle-exclamation text-danger" title="Échec de l\'envoi"></i>';
            }
        }
    }
}

/**
 * Fonction principale pour l'envoi de messages.
 * @param {object|string} [custom] - Texte ou objet personnalisé à envoyer.
 */
async function sendMessage() {
    const text = chatMessageInput.value.trim();
    const imageFile = tempImageFile;

    if (!text && !imageFile) {
        showToast('Veuillez saisir un message ou sélectionner une image.', 'warning');
        return;
    }

    const payload = {
        text: text,
        type: imageFile ? 'image' : 'text'
    };

    if (activeThreadId) {
        payload.threadId = activeThreadId;
    } else if (newChatContext) {
        payload.recipientId = newChatContext.recipientId;
        payload.adId = newChatContext.adId;
    } else {
        showToast('Contexte de discussion manquant.', 'error');
        return;
    }

    await _sendPayload(payload, imageFile);
}

async function sendOfferMessage(amount) {
    const val = parseFloat(amount);
    if (!val) { showToast('Montant invalide', 'warning'); return; }
    const payload = {
        type: 'offer',
        text: `Offre: ${formatPrice(val, 'EUR')}`,
        metadata: { amount: val, currency: 'EUR', status: 'pending' }
    };
    if (activeThreadId) {
        payload.threadId = activeThreadId;
    } else if (newChatContext) {
        payload.recipientId = newChatContext.recipientId;
        payload.adId = newChatContext.adId;
    } else {
        showToast('Contexte de discussion manquant.', 'error');
        return;
    }
    await _sendPayload(payload, null);
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'offer-modal' } }));
}

async function sendLocationMessage(coords) {
    if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
        showToast('Coordonnées invalides', 'warning');
        return;
    }
    const payload = { type: 'location', text: 'Localisation', metadata: coords };
    if (activeThreadId) {
        payload.threadId = activeThreadId;
    } else if (newChatContext) {
        payload.recipientId = newChatContext.recipientId;
        payload.adId = newChatContext.adId;
    } else {
        showToast('Contexte de discussion manquant.', 'error');
        return;
    }
    await _sendPayload(payload, null);
}

async function sendAppointmentMessage(appointmentData) {
    if (!appointmentData?.date || !appointmentData?.location) {
        showToast('Informations RDV manquantes', 'warning');
        return;
    }
    const payload = { type: 'appointment', text: 'Rendez-vous', metadata: appointmentData };
    if (activeThreadId) {
        payload.threadId = activeThreadId;
    } else if (newChatContext) {
        payload.recipientId = newChatContext.recipientId;
        payload.adId = newChatContext.adId;
    } else {
        showToast('Contexte de discussion manquant.', 'error');
        return;
    }
    await _sendPayload(payload, null);
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'appointment-modal' } }));
}

function handleImageFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!VALID_IMAGE_TYPES.includes(file.type)) return showToast("Format d'image non valide.", "error");
    if (file.size > MAX_IMAGE_SIZE_BYTES) return showToast(`L'image est trop grande (max ${MAX_IMAGE_SIZE_MB}MB).`, "error");

    tempImageFile = file;
    displayImagePreview(file);
    updateSendButtonState();
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
    updateSendButtonState();
}

function updateSendButtonState() {
    const hasText = chatMessageInput.value.trim().length > 0;
    const hasImage = !!tempImageFile;
    if (sendChatMessageBtn) {
        sendChatMessageBtn.disabled = !(hasText || hasImage);
    }
}

function adjustTextareaHeight() {
    chatMessageInput.style.height = 'auto';
    let scrollHeight = chatMessageInput.scrollHeight;
    const maxHeight = 120;
    if(scrollHeight > maxHeight) {
        chatMessageInput.style.height = maxHeight + 'px';
        chatMessageInput.style.overflowY = 'auto';
    } else {
        chatMessageInput.style.height = scrollHeight + 'px';
        chatMessageInput.style.overflowY = 'hidden';
    }
}

function updateMessageGrouping() {
    const messages = [...chatMessagesContainer.querySelectorAll('.chat-message:not(.system-message)')];
    messages.forEach((el, idx) => {
        el.classList.remove('is-first-in-group','is-middle-in-group','is-last-in-group','is-single-message');
        const prev = messages[idx - 1];
        const next = messages[idx + 1];
        const sender = el.dataset.senderId;
        const prevSender = prev?.dataset.senderId;
        const nextSender = next?.dataset.senderId;
        const isFirst = !prev || prevSender !== sender;
        const isLast = !next || nextSender !== sender;
        if (isFirst && isLast) el.classList.add('is-single-message');
        else if (isFirst) el.classList.add('is-first-in-group');
        else if (isLast) el.classList.add('is-last-in-group');
        else el.classList.add('is-middle-in-group');
    });
}

// --- GESTION DES ÉVÉNEMENTS SOCKET REÇUS ---

function handleNewMessageReceived({ message, thread }) {
    if (threadListView.classList.contains('active-view')) {
        loadThreads(currentTabRole);
    }
    
    const currentUser = state.getCurrentUser();
    const isMyMessage = (message.senderId?._id || message.senderId) === currentUser?._id;

    if (isMyMessage && message.tempId) {
        const tempMessageEl = document.querySelector(`.chat-message[data-temp-id="${message.tempId}"]`);
        if (tempMessageEl) {
            tempMessageEl.dataset.messageId = message._id;
            tempMessageEl.classList.remove('sending-message');
            const statusContainer = tempMessageEl.querySelector('.message-status-icons');
            if (statusContainer) {
                statusContainer.innerHTML = '<i class="fa-solid fa-check"></i>';
            }
            if(message.type === 'image' && message.imageUrl) {
                const imgEl = tempMessageEl.querySelector('.chat-image-attachment');
                if (imgEl) imgEl.src = message.imageUrl;
            }
            updateMessageGrouping();
            return;
        }
    }
    
    if (activeThreadId === message.threadId) {
        renderMessages([message], 'append');
        markThreadAsRead(activeThreadId);
    } else {
        const sender = thread.participants.find(p => p.user._id === message.senderId);
        if (sender && sender.user._id !== currentUser._id) {
            showToast(`Nouveau message de ${sanitizeHTML(sender.user.name)}`, 'info');
            if (newMessagesSound) newMessagesSound.play().catch(e => console.warn('Erreur lecture son:', e));
            loadThreads(currentTabRole);
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

async function handleOfferAction(messageId, accept) {
    const endpoint = `${API_MESSAGES_URL}/messages/${messageId}/offer/${accept ? 'accept' : 'decline'}`;
    try {
        const res = await secureFetch(endpoint, { method: 'POST' }, false);
        if (!res || !res.success) throw new Error(res?.message || 'Erreur');
    } catch (e) {
        showToast(e.message, 'error');
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
        document.querySelectorAll('.chat-message[data-sender-id="me"]').forEach(msgEl => {
            const statusContainer = msgEl.querySelector('.message-status-icons');
            if (statusContainer) {
                statusContainer.innerHTML = '<i class="fa-solid fa-check-double" style="color: #4fc3f7;"></i>';
            }
        });
    }
}

function handleUserStatusUpdate({ userId, statusText }) {
    if (currentRecipient && currentRecipient._id === userId && chatRecipientStatus) {
        chatRecipientStatus.textContent = statusText;
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
    loadThreads(currentTabRole);
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
    const { recipientId, adId, adData, recipientName, recipientAvatar } = event.detail;
    if (!recipientId || !adId) return showToast("Informations manquantes.", "error");

    toggleGlobalLoader(true, "Ouverture de la discussion...");
    try {
        const response = await secureFetch(`${API_MESSAGES_URL}/threads/initiate`, {
            method: 'POST',
            body: JSON.stringify({ recipientId, adId }),
            headers: { 'Content-Type': 'application/json' }
        }, false);
        if (!response || !response.success) throw new Error(response?.message || 'Erreur');
        const thread = response.data.thread;
        const currentUser = state.getCurrentUser();
        const recipient = thread.participants.find(p => p._id !== currentUser._id) || {};
        openChatView(thread._id, recipient, thread);
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

function toggleComposerMenu(forceHide = false) {
    if (!chatComposerMenu) return;
    let shouldHide = forceHide ? true : chatComposerMenu.classList.contains('hidden');
    if (shouldHide) {
        chatComposerMenu.classList.add('hidden');
    } else {
        chatComposerMenu.classList.remove('hidden');
    }
}

function closeComposerMenuOnClickOutside(event) {
    if (chatComposerMenu && !chatComposerMenu.classList.contains('hidden') &&
        !chatComposerBtn.contains(event.target) && !chatComposerMenu.contains(event.target)) {
        toggleComposerMenu(true);
    }
}