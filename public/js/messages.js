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
    formatCurrency,
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
let chatMessagesContainer, chatMessageTemplate, chatHistoryLoader, typingIndicator;
let chatInputArea, chatMessageInput, sendChatMessageBtn, chatAttachImageBtn, chatImageUploadInput, chatImagePreviewContainer;
let chatComposerBtn, chatComposerMenu, chatMakeOfferBtn, chatShareLocationBtn, chatMeetBtn, offerModal, submitOfferBtn, appointmentModal, submitAppointmentBtn;
let threadsTabs;
let messagesNavBadge, navMessagesBtn;
let newMessagesSound;

// --- État du module ---
let activeThreadId = null;
let currentRecipient = null;
let newChatContext = null; // Contexte pour une nouvelle discussion (non liée à un thread existant)
let messageObserver = null;
let isLoadingHistory = false;
let allMessagesLoaded = false;
let currentPage = 1;
let typingTimer = null;
let typingIndicatorTimer = null;
let tempImageFile = null;
let currentTabRole = 'purchases';

/**
 * Initialise le module de messagerie.
 */
export function init() {
    if (!initializeUI()) return;
    setupEventListeners();
    
    // Ajoutez ceci :
    state.subscribe('messages.unreadGlobalCountChanged', (count) => {
        updateGlobalUnreadCount(count);
    });
    
    // Initialisez avec la valeur actuelle
    updateGlobalUnreadCount(state.get('messages.unreadGlobalCount') || 0);
    
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
        typingIndicator: 'typing-indicator',
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
        typingIndicator, chatInputArea, chatMessageInput, sendChatMessageBtn, messagesNavBadge,
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
    if (chatComposerBtn) chatComposerBtn.addEventListener('click', () => toggleComposerMenu());
    document.addEventListener('click', closeComposerMenuOnClickOutside);
    if (chatAttachImageBtn) {
        chatAttachImageBtn.addEventListener('click', () => chatImageUploadInput.click());
    }
    if (chatImageUploadInput) {
        chatImageUploadInput.addEventListener('change', handleImageFileSelection);
    }
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
                                method: 'PATCH'
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
    showThreadList(); // Afficher la liste des conversations
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'messages-modal' } }));
}

/**
 * Affiche la vue de la liste des conversations et charge les données.
 */
function showThreadList() {
    if (window.socket && activeThreadId) {
        window.socket.emit('leaveThread', activeThreadId);
    }
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
    const previousThread = activeThreadId;
    activeThreadId = threadId;
    currentRecipient = recipient;
    allMessagesLoaded = false;
    isLoadingHistory = false;
    currentPage = 1;

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
        const { statusClass, text } = formatUserStatus(recipient.lastSeen, recipient.isOnline);
        chatRecipientStatus.textContent = text;
        const dot = document.getElementById('chat-recipient-status-dot');
        if (dot) {
            dot.classList.remove('online', 'offline');
            dot.classList.add(statusClass);
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

        if (thumb) thumb.src = (adForSummary.imageUrls && adForSummary.imageUrls[0]) ? adForSummary.imageUrls[0] : 'https://placehold.co/60x60/e0e0e0/757575?text=Ad';
        if (link) link.textContent = sanitizeHTML(adForSummary.title);
        if (price) price.textContent = formatCurrency(adForSummary.price, adForSummary.currency);

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

    if (window.socket) {
        if (previousThread) window.socket.emit('leaveThread', previousThread);
        if (threadId) window.socket.emit('joinThread', threadId);
    }

    if (threadId) {
        await loadMessageHistory(threadId, true);
        await markMessagesAsRead(threadId);
        const counts = state.get('messages.unreadCounts') || {};
        counts[threadId] = 0;
        state.set('messages.unreadCounts', counts);
        const item = document.querySelector(`.thread-item[data-thread-id="${threadId}"]`);
        if (item) {
            const badge = item.querySelector('.unread-badge');
            if (badge) {
                badge.textContent = '';
                badge.classList.remove('visible');
            }
            item.classList.remove('thread-unread');
        }
        updateUnreadBadges();
        updatePresenceIndicators();
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

    // Le compte global de threads non lus est géré par le backend via l'événement socket 'unreadCountUpdated'
    // et potentiellement via la réponse de l'API loadThreads si le backend l'inclut.
    // Calculer ici la somme des messages non lus par thread pour le badge global serait incorrect.
    // updateGlobalUnreadCount(state.get('messages.unreadGlobalCount') || 0); // S'assurer que le badge est à jour avec l'état actuel

    threadsData.forEach((thread, index) => {
        // La logique pour trouver le 'recipient' et 'currentUser' reste la même
        const recipient = thread.participants.find(p => p._id !== currentUser._id);
        if (!recipient) return;

        const clone = threadItemTemplate.content.cloneNode(true);
        const li = clone.querySelector('.thread-item');

        // Cibler les nouveaux éléments
        const thumbnail = li.querySelector('.thread-item__thumbnail');
        const adTitle = li.querySelector('.thread-item__ad-title');
        const userNameEl = li.querySelector('.thread-item__user-name');
        const messagePreviewEl = li.querySelector('.thread-item__message-preview');
        const timeEl = li.querySelector('.thread-time');
        const unreadBadge = li.querySelector('.unread-badge');
        const statusDot = li.querySelector('.status-dot');

        li.dataset.threadId = thread._id;
        li.dataset.recipientId = recipient._id;

        // Remplir avec les données de l'annonce
        if (thread.ad) {
            if (thumbnail) {
                thumbnail.src = (thread.ad.imageUrls && thread.ad.imageUrls[0])
                    ? thread.ad.imageUrls[0]
                    : 'https://placehold.co/60x60/e0e0e0/757575?text=Ad';
                thumbnail.alt = `Image pour ${sanitizeHTML(thread.ad.title)}`;
            }
            if (adTitle) {
                adTitle.textContent = sanitizeHTML(thread.ad.title);
            }
        } else {
            // Fallback si la discussion n'est pas liée à une annonce
            if (thumbnail) thumbnail.src = recipient.avatarUrl || 'https://placehold.co/60x60/e0e0e0/757575?text=User';
            if (adTitle) adTitle.textContent = "Discussion directe";
        }

        // Remplir avec les détails du message
        const lastMessageSender = thread.lastMessage?.sender?.toString() === currentUser._id ? "Vous" : recipient.name;
        const previewText = thread.lastMessage?.text
            ? sanitizeHTML(thread.lastMessage.text)
            : (thread.lastMessage?.imageUrl ? '[Image]' : 'Début de la conversation');

        const truncatedPreview =
            previewText.length > 60 ? previewText.slice(0, 60) + '...' : previewText;

        if (userNameEl) userNameEl.textContent = `${sanitizeHTML(lastMessageSender)}: `;
        if (messagePreviewEl) messagePreviewEl.textContent = truncatedPreview;

        // La logique pour l'heure et le badge non lu reste la même
        if (timeEl) timeEl.textContent = thread.lastMessage ? formatDate(thread.lastMessage.createdAt, { hour: '2-digit', minute: '2-digit' }) : '';
        const unreadCountForThread = thread.unreadCount || 0;
        const counts = state.get('messages.unreadCounts') || {};
        counts[thread._id] = unreadCountForThread;
        state.set('messages.unreadCounts', counts, true);

        if (unreadCountForThread > 0) {
            li.classList.add('thread-unread');
        }

        if (unreadBadge) {
            unreadBadge.textContent = unreadCountForThread;
            unreadBadge.classList.toggle('hidden', unreadCountForThread === 0);
        }
        if (statusDot) {
            statusDot.classList.toggle('online', state.get('onlineUsers')?.[recipient._id]);
        }

        // Appliquer un délai d'animation pour un effet de cascade
        li.style.animationDelay = `${index * 60}ms`;

        // L'écouteur d'événement reste le même
        li.addEventListener('click', () => openChatView(thread._id, recipient, thread));
        threadListUl.appendChild(clone);
    });
    updateUnreadBadges();
    updatePresenceIndicators();
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
        chatMessagesContainer.innerHTML = '';
        chatHistoryLoader.classList.remove('hidden');
    }

    try {
        const url = `${API_MESSAGES_URL}/threads/${threadId}/messages?page=${currentPage}&limit=20`;
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

        if (msg._id) messageEl.dataset.messageId = msg._id;
        if (msg.tempId) messageEl.dataset.tempId = msg.tempId;
        messageEl.dataset.messageTimestamp = new Date(msg.createdAt).getTime();

        const isSentByMe = (msg.senderId?._id || msg.senderId) === currentUserId;
        messageEl.dataset.senderId = isSentByMe ? 'me' : 'other';
        if (msg.status === 'sending') messageEl.classList.add('sending');
        if (msg.status === 'failed') messageEl.classList.add('message-failed');
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
                    if (msg.text) {
                        const caption = document.createElement('p');
                        caption.textContent = sanitizeHTML(msg.text);
                        caption.style.marginTop = '4px';
                        textEl.appendChild(caption);
                    }
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
                    card.querySelector('.appointment-time').textContent = new Date(msg.metadata.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

        if (isSentByMe && statusEl) {
            statusEl.innerHTML = renderMessageStatus(msg);
        } else if (statusEl) {
            statusEl.innerHTML = '';
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

function renderMessageStatus(message) {
    const sentIcon = '<i class="fa-solid fa-check" title="Envoyé"></i>';
    const deliveredIcon = '<i class="fa-solid fa-check-double" title="Distribué"></i>';
    const readIcon = '<i class="fa-solid fa-check-double" title="Lu" style="color: #4fc3f7;"></i>';
    if (message.readAt) return readIcon;
    switch (message.status) {
        case 'delivered':
            return deliveredIcon;
        case 'sent':
        default:
            return sentIcon;
    }
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


/**
 * Fonction principale pour l'envoi de messages.
 * @param {object|string} [custom] - Texte ou objet personnalisé à envoyer.
 */
async function sendMessage() {
    const text = chatMessageInput.value.trim();
    if (!text) {
        return;
    }

    try {
        const res = await secureFetch(`${API_MESSAGES_URL}/messages`, {
            method: 'POST',
            body: { threadId: activeThreadId, text }
        }, false);

        if (res?.data?.message) {
            renderMessages([res.data.message], 'append');
            chatMessageInput.value = '';
            updateSendButtonState();
        }
    } catch (error) {
        console.error('Erreur envoi message:', error);
        showToast(error.message || "Erreur lors de l'envoi du message", 'error');
    }
}

async function sendOfferMessage(amount) {
    const val = parseFloat(amount);
    if (!val || !window.socket) { showToast('Montant invalide', 'warning'); return; }
    window.socket.emit('sendMessage', { threadId: activeThreadId, content: `Offre: ${val}` });
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'offer-modal' } }));
}

async function sendLocationMessage(coords) {
    if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number' || !window.socket) {
        showToast('Coordonnées invalides', 'warning');
        return;
    }
    window.socket.emit('sendMessage', { threadId: activeThreadId, content: `[Location: ${coords.latitude},${coords.longitude}]` });
}

async function sendAppointmentMessage(appointmentData) {
    if (!appointmentData?.date || !appointmentData?.location || !window.socket) {
        showToast('Informations RDV manquantes', 'warning');
        return;
    }
    window.socket.emit('sendMessage', { threadId: activeThreadId, content: `RDV: ${appointmentData.date} @ ${appointmentData.location}` });
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'appointment-modal' } }));
}

function handleImageFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validation côté client
    if (!VALID_IMAGE_TYPES.includes(file.type)) {
        return showToast("Format d'image non valide (JPEG, PNG, WebP).", "error");
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
        return showToast(`L'image est trop grande (max ${MAX_IMAGE_SIZE_MB}MB).`, "error");
    }

    tempImageFile = file;
    displayImagePreview(file);
    updateSendButtonState();
}

function displayImagePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        chatImagePreviewContainer.innerHTML = `
                <img src="${e.target.result}" alt="Aperçu" class="chat-image-preview-thumb" />
                <button type="button" class="btn btn-icon btn-danger btn-sm chat-remove-preview-btn" aria-label="Retirer l'image">
                    <i class="fa-solid fa-times"></i>
                </button>`;
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
    if (scrollHeight > maxHeight) {
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
        el.classList.remove('is-first-in-group', 'is-middle-in-group', 'is-last-in-group', 'is-single-message');
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

export function handleNewMessageReceived({ message, thread, unreadThreadCount }) {
    const currentUser = state.getCurrentUser();
    const isMyMessage = (message.senderId?._id || message.senderId) === currentUser?._id;

    if (threadListView.classList.contains('active-view')) {
        loadThreads(currentTabRole);
    }

    if (!isMyMessage && activeThreadId !== message.threadId) {
        const counts = state.get('messages.unreadCounts') || {};
        counts[message.threadId] = (counts[message.threadId] || 0) + 1;
        state.set('messages.unreadCounts', counts);
        const item = document.querySelector(`.thread-item[data-thread-id="${message.threadId}"]`);
        if (item) {
            const badge = item.querySelector('.unread-badge');
            const current = parseInt(badge?.textContent || '0', 10) || 0;
            if (badge) {
                badge.textContent = current + 1;
                badge.classList.add('visible');
            }
            item.classList.add('thread-unread');
        }
        updateGlobalUnreadCount(Object.values(counts).reduce((a,b)=>a+b,0));
    }

    
    if (isMyMessage && message.tempId) {
        const tempMessageEl = document.querySelector(`.chat-message[data-temp-id="${message.tempId}"]`);
        if (tempMessageEl) {
            tempMessageEl.dataset.messageId = message._id;
            tempMessageEl.classList.remove('sending');
            const statusContainer = tempMessageEl.querySelector('.message-status-icons');
            if (statusContainer) {
                statusContainer.innerHTML = renderMessageStatus({ status: 'sent' });
            }
            if (message.type === 'image' && message.imageUrl) {
                const imgEl = tempMessageEl.querySelector('.chat-image-attachment');
                if (imgEl) imgEl.src = message.imageUrl;
            }
            updateMessageGrouping();
            return;
        }
    }

    if (activeThreadId === message.threadId) {
        renderMessages([message], 'append');
        markMessagesAsRead(activeThreadId);
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
    if (window.socket?.connected && activeThreadId) {
        // ADDED: simple typing indication to recipient
        if (currentRecipient) {
            window.socket.emit('typing', { recipientId: currentRecipient._id || currentRecipient.id });
        }
        if (!typingTimer) window.socket.emit('startTyping', { threadId: activeThreadId });
        clearTimeout(typingTimer);
        typingTimer = setTimeout(stopTypingEvent, 1500);
    }
}

function stopTypingEvent() {
    if (window.socket?.connected && activeThreadId) {
        clearTimeout(typingTimer);
        typingTimer = null;
        window.socket.emit('stopTyping', { threadId: activeThreadId });
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

function handleTypingEventReceived({ isTyping }) {
    if (isTyping) {
        typingIndicator.style.display = 'block';
        clearTimeout(typingIndicatorTimer);
        typingIndicatorTimer = setTimeout(() => {
            typingIndicator.style.display = 'none';
        }, TYPING_TIMEOUT);
    } else {
        typingIndicator.style.display = 'none';
    }
}



export function setupSocket(socket) {
    if (!socket) return;
    socket.on('newMessage', handleNewMessageReceived);
    // ADDED: global listener example for new messages
    socket.on('newMessage', (message) => {
        console.log('Nouveau message reçu en temps réel:', message);
        // Example placeholder for UI update
        // updateChatUIWithNewMessage(message);
    });
    socket.on('userTyping', handleTypingEventReceived);
    // ADDED: handle simple typing event relay
    socket.on('userIsTyping', ({ senderId }) => {
        if (currentRecipient && senderId === currentRecipient._id) {
            handleTypingEventReceived({ isTyping: true });
            clearTimeout(typingIndicatorTimer);
            typingIndicatorTimer = setTimeout(() => {
                handleTypingEventReceived({ isTyping: false });
            }, TYPING_TIMEOUT);
        }
    });
    socket.on('messagesRead', ({ threadId }) => {
        if (threadId === activeThreadId) {
            const sentMessages = chatMessagesContainer.querySelectorAll('.chat-message[data-sender-id="me"]');
            sentMessages.forEach(msg => {
                const icons = msg.querySelector('.message-status-icons');
                if (icons) icons.innerHTML = renderMessageStatus({ readAt: true });
            });
        }
    });
    socket.on('user-online', (userId) => {
        const online = state.get('onlineUsers') || {};
        online[userId] = true;
        state.set('onlineUsers', online);
        updatePresenceIndicators();
    });
    socket.on('user-offline', ({ userId, lastSeen }) => {
        const online = state.get('onlineUsers') || {};
        online[userId] = false;
        state.set('onlineUsers', online);
        if (currentRecipient && currentRecipient._id === userId) {
            currentRecipient.lastSeen = lastSeen;
        }
        updatePresenceIndicators();
    });
    socket.on('messageError', function(error) {
        console.error('Failed to send message:', error);
        alert("Erreur: Votre message n'a pas pu être envoyé.");
    });
}

// --- FONCTIONS AUXILIAIRES ---

/**
 * Informe le serveur que le thread a été lu.
 * @param {string} threadId - L'ID du thread.
 */
async function markThreadAsRead(threadId) {
    const threadItem = document.querySelector(`.thread-item[data-thread-id="${threadId}"]`);
    const wasUnread = threadItem && threadItem.classList.contains('unread');

    if (window.socket) {
        window.socket.emit('markThreadAsRead', threadId);
    }
    if (threadItem) {
        threadItem.classList.remove('unread');
    }
}

async function markMessagesAsRead(threadId) {
    try {
        await secureFetch(`/api/messages/${threadId}/mark-as-read`, { method: 'POST' }, false);
    } catch (error) {
        console.error('Erreur lors de la mise à jour du statut des messages:', error);
    }
}

function updateGlobalUnreadCount(count) {
    const newCount = Math.max(0, count || 0);
    if (messagesNavBadge) {
        // Mettre à jour l'attribut data-count
        messagesNavBadge.dataset.count = newCount;

        // Mettre à jour le texte seulement si > 0
        messagesNavBadge.textContent = newCount > 9 ? '9+' : newCount.toString();

        // Gérer la visibilité
        const shouldHide = newCount <= 0;
        messagesNavBadge.classList.toggle('hidden', shouldHide);
        messagesNavBadge.setAttribute('aria-hidden', shouldHide ? 'true' : 'false');

        // Mettre à jour le titre pour l'accessibilité
        messagesNavBadge.setAttribute('title', `${newCount} messages non lus`);
    }
}

function updateUnreadBadges() {
    const counts = state.get('messages.unreadCounts') || {};
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    updateGlobalUnreadCount(total);

    document.querySelectorAll('.thread-item').forEach(item => {
        const tid = item.dataset.threadId;
        const badge = item.querySelector('.unread-badge');
        const c = counts[tid] || 0;
        if (badge) {
            badge.textContent = c;
            badge.classList.toggle('visible', c > 0);
        }
        item.classList.toggle('thread-unread', c > 0);
    });
}

function formatUserStatus(lastSeenTimestamp, isOnline = false) {
    const now = Date.now();
    const last = lastSeenTimestamp ? new Date(lastSeenTimestamp).getTime() : 0;

    if (isOnline || now - last < 2 * 60 * 1000) {
        return { statusClass: 'online', text: 'En ligne' };
    }
    if (!lastSeenTimestamp) {
        return { statusClass: 'offline', text: '' };
    }
    const diffMinutes = Math.floor((now - last) / 60000);
    if (diffMinutes < 60) {
        return { statusClass: 'offline', text: 'Hors ligne depuis ' + diffMinutes + ' min' };
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return { statusClass: 'offline', text: 'Hors ligne depuis ' + diffHours + ' h' };
    }
    const diffDays = Math.floor(diffHours / 24);
    return { statusClass: 'offline', text: 'Hors ligne depuis ' + diffDays + ' j' };
}

export function updatePresenceIndicators() {
    const online = state.get('onlineUsers') || {};
    document.querySelectorAll('.thread-item').forEach(item => {
        const dot = item.querySelector('.status-dot, .status-indicator');
        const uid = item.dataset.recipientId;
        if (dot && uid) {
            dot.classList.toggle('online', online[uid]);
            dot.classList.toggle('offline', !online[uid]);
        }
    });
    const headerDot = document.getElementById('chat-recipient-status-dot');
    if (headerDot && currentRecipient) {
        const isOn = online[currentRecipient._id];
        headerDot.classList.toggle('online', isOn);
        headerDot.classList.toggle('offline', !isOn);
        const { text } = formatUserStatus(currentRecipient.lastSeen, isOn);
        if (chatRecipientStatus) chatRecipientStatus.textContent = text;
    }
}
function scrollToBottom(container) {
    if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
}

function setupInfiniteScroll() {
    if (!chatMessagesContainer) return;
    chatMessagesContainer.removeEventListener('scroll', handleScrollLoad);
    chatMessagesContainer.addEventListener('scroll', handleScrollLoad);
}

function handleScrollLoad() {
    if (chatMessagesContainer.scrollTop === 0 && !isLoadingHistory && !allMessagesLoaded) {
        currentPage += 1;
        loadMessageHistory(activeThreadId);
    }
}

/**
 * Gère l'initiation d'une conversation depuis une autre partie de l'application.
 * @param {CustomEvent} event - L'événement contenant les détails { adId, recipientId }.
 */
async function handleInitiateChatEvent(event) {
    const { recipientId, adId } = event.detail;

    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        showToast("Session non trouvée. Veuillez vous reconnecter.", "error");
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal' } }));
        return;
    }

    if (!recipientId || !adId) return showToast("Informations manquantes pour démarrer la discussion.", "error");

    toggleGlobalLoader(true, "Ouverture de la discussion...");
    try {
        const response = await secureFetch(`${API_MESSAGES_URL}/threads/initiate`, {
            method: 'POST',
            body: { recipientId, adId }
        });

        if (!response || !response.success) {
            throw new Error(response?.message || 'Erreur lors de l\'initiation de la discussion.');
        }

        const thread = response.data.thread;
        const recipientData = thread.participants.find(p => p.user._id !== currentUser._id)?.user;

        if (recipientData) {
            openChatView(thread._id, recipientData, thread);
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'messages-modal' } }));
        } else {
            throw new Error('Impossible de trouver les informations du destinataire.');
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

function toggleComposerMenu(forceHide = false) {
    if (!chatComposerMenu) return;

    const isHidden = chatComposerMenu.classList.contains('hidden');

    if (forceHide || !isHidden) {
        chatComposerMenu.classList.add('hidden');
        chatComposerMenu.setAttribute('aria-hidden', 'true');
        chatComposerBtn.setAttribute('aria-expanded', 'false');
    } else {
        chatComposerMenu.classList.remove('hidden');
        chatComposerMenu.setAttribute('aria-hidden', 'false');
        chatComposerBtn.setAttribute('aria-expanded', 'true');
    }
}

function closeComposerMenuOnClickOutside(event) {
    if (chatComposerMenu && !chatComposerMenu.classList.contains('hidden') &&
        !chatComposerBtn.contains(event.target) && !chatComposerMenu.contains(event.target)) {
        toggleComposerMenu(true);
    }
}

if (chatComposerMenu) {
    chatComposerMenu.addEventListener('click', (e) => {
        if (e.target.closest('button')) {
            toggleComposerMenu(true);
        }
    });
}