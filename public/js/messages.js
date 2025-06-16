/**
 * @file messages.js
 * @description Gestion complète de la messagerie instantanée pour MapMarket.
 * Version corrigée avec gestion robuste des autorisations et des erreurs.
 */

import * as state from './store.js';
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
let newChatContext = null;
let messageObserver = null;
let isLoadingHistory = false;
let allMessagesLoaded = false;
let typingTimeout = null;
let typingIndicatorTimer = null;
let tempImageFile = null;
let currentTabRole = 'purchases';

/**
 * Initialise le module de messagerie.
 */
export function init() {
    if (!initializeUI()) return;
    setupEventListeners();
    state.subscribe('messages.unreadGlobalCountChanged', updateGlobalUnreadCount);
    console.log('Module Messages initialisé.');
}

function initializeUI() {
    const elements = {
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

    let allFound = true;
    for (const [key, id] of Object.entries(elements)) {
        const element = document.getElementById(id);
        if (!element) {
            console.error(`Élément critique de la messagerie manquant: #${id}`);
            allFound = false;
        }
        window[key] = element; // Assign to global scope
    }

    if (sendChatMessageBtn) sendChatMessageBtn.disabled = true;

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

function setupEventListeners() {
    state.subscribe('currentUserChanged', handleUserChangeForSocket);
    document.addEventListener('mapMarket:initiateChat', handleInitiateChatEvent);

    navMessagesBtn?.addEventListener('click', openThreadListView);
    backToThreadsBtn?.addEventListener('click', showThreadList);
    sendChatMessageBtn?.addEventListener('click', sendMessage);
    chatMessageInput?.addEventListener('keypress', handleInputKeypress);
    chatMessageInput?.addEventListener('input', () => {
        sendTypingEvent();
        updateSendButtonState();
        adjustTextareaHeight();
    });
    chatOptionsBtn?.addEventListener('click', toggleChatOptionsMenu);
    document.addEventListener('click', closeOptionsMenuOnClickOutside, true);
    
    chatComposerBtn?.addEventListener('click', () => toggleComposerMenu());
    document.addEventListener('click', closeComposerMenuOnClickOutside);
    
    chatAttachImageBtn?.addEventListener('click', () => chatImageUploadInput?.click());
    chatImageUploadInput?.addEventListener('change', handleImageFileSelection);
    
    threadsTabs?.addEventListener('click', handleThreadsTabClick);
    
    chatMakeOfferBtn?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { 
            detail: { modalId: 'offer-modal', triggerElement: chatMakeOfferBtn } 
        }));
        toggleComposerMenu(true);
    });
    
    submitOfferBtn?.addEventListener('click', handleOfferSubmit);
    chatShareLocationBtn?.addEventListener('click', handleShareLocation);
    chatMeetBtn?.addEventListener('click', handleMeetRequest);
    submitAppointmentBtn?.addEventListener('click', handleAppointmentSubmit);
    deleteChatBtn?.addEventListener('click', handleDeleteChat);
}

// --- GESTION SOCKET.IO ---

function handleUserChangeForSocket(user) {
    if (user) connectSocket();
    else {
        disconnectSocket();
        clearMessagesUI();
    }
}

function connectSocket() {
    const token = localStorage.getItem('mapmarket_auth_token');
    if (!token) return;
    if (socket?.connected) return;
    if (socket) socket.disconnect();

    socket = io(SOCKET_NAMESPACE, { 
        auth: { token },
        reconnectionAttempts: 3,
        reconnectionDelay: 1000
    });

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
    socket.on('unreadCountUpdated', ({ unreadThreadCount }) => {
        if (typeof unreadThreadCount === 'number') {
            state.set('messages.unreadGlobalCount', unreadThreadCount);
        }
    });
    socket.on('update_unread_count', fetchInitialUnreadCount);
    socket.on('typing', handleTypingEventReceived);
    socket.on('stopTyping', handleStopTypingEvent);
    socket.on('newThread', loadThreads.bind(null, currentTabRole));
    socket.on('messagesRead', handleMessagesReadEvent);
    socket.on('userStatusUpdate', handleUserStatusUpdate);
}

function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
        console.log('Socket.IO déconnecté.');
    }
}

// --- GESTION INTERFACE ---

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

async function showThreadList() {
    activeThreadId = null;
    currentRecipient = null;
    chatView?.classList.remove('active-view');
    threadListView?.classList.add('active-view');
    chatOptionsMenu?.classList.add('hidden');
    await loadThreads(currentTabRole);
}

async function openChatView(threadId, recipient, threadData = null) {
    // Vérification préalable de l'accès
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        showToast("Session expirée. Veuillez vous reconnecter.", "error");
        return;
    }

    if (threadId) {
        try {
            // Vérifier que l'utilisateur a bien accès à ce thread
            const canAccess = await verifyThreadAccess(threadId, currentUser._id);
            if (!canAccess) {
                showToast("Accès non autorisé à cette conversation.", "error");
                return showThreadList();
            }
        } catch (error) {
            console.error("Erreur de vérification d'accès:", error);
            showToast("Erreur de chargement de la conversation.", "error");
            return showThreadList();
        }
    }

    activeThreadId = threadId;
    currentRecipient = recipient;
    allMessagesLoaded = false;
    isLoadingHistory = false;

    if (!threadId && threadData?.ad) {
        newChatContext = {
            recipientId: recipient.id || recipient._id,
            adId: threadData.ad._id || threadData.ad.id
        };
    } else {
        newChatContext = null;
    }

    // Mise à jour UI
    updateChatUI(recipient, threadData);

    threadListView?.classList.remove('active-view');
    chatView?.classList.add('active-view');
    
    // Réinitialisation
    chatMessagesContainer.innerHTML = '';
    chatMessageInput.value = '';
    chatMessageInput.focus();
    adjustTextareaHeight();
    removeImagePreview();
    updateSendButtonState();
    
    if (threadId) {
        await loadMessageHistory(threadId, true);
        setupInfiniteScroll();
        chatMessagesContainer.dataset.threadId = threadId;
        socket?.emit('joinThread', threadId);
    } else {
        chatHistoryLoader.innerHTML = `<p class="text-center text-muted">Envoyez le premier message !</p>`;
        chatHistoryLoader.classList.remove('hidden');
    }
}

async function verifyThreadAccess(threadId, userId) {
    try {
        const response = await secureFetch(`${API_MESSAGES_URL}/threads/${threadId}/verify-access`, {}, false);
        return response?.success === true;
    } catch (error) {
        console.error("Erreur de vérification d'accès:", error);
        return false;
    }
}

function updateChatUI(recipient, threadData) {
    if (!recipient) return;

    if (chatRecipientAvatar) {
        chatRecipientAvatar.src = recipient?.avatarUrl || 'avatar-default.svg';
        chatRecipientAvatar.alt = `Avatar de ${recipient?.name}`;
    }
    
    if (chatRecipientName) {
        chatRecipientName.textContent = sanitizeHTML(recipient?.name || 'Nouveau contact');
    }
    
    if (chatRecipientStatus) {
        updateRecipientStatus(recipient);
    }

    updateChatAdSummary(threadData?.ad);
}

function updateRecipientStatus(recipient) {
    if (!recipient) return;
    
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

function updateChatAdSummary(ad) {
    const chatAdSummary = document.getElementById('chat-ad-summary');
    if (!chatAdSummary) return;

    if (ad) {
        chatAdSummary.classList.remove('hidden');
        const thumb = document.getElementById('chat-ad-thumbnail');
        const link = document.getElementById('chat-ad-link');
        const price = document.getElementById('chat-ad-price');

        if (thumb) {
            thumb.src = (ad.imageUrls?.[0]) ? ad.imageUrls[0] : 'https://placehold.co/60x60/e0e0e0/757575?text=Ad';
            thumb.alt = `Miniature pour ${ad.title}`;
        }
        
        if (link) {
            link.textContent = sanitizeHTML(ad.title);
            link.onclick = (e) => {
                e.preventDefault();
                document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'messages-modal' } }));
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', { 
                        detail: { adId: ad._id || ad.id } 
                    }));
                }, 100);
            };
        }
        
        if (price) {
            price.textContent = formatCurrency(ad.price, ad.currency);
        }
    } else {
        chatAdSummary.classList.add('hidden');
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

// --- GESTION DONNÉES ---

async function loadThreads(role = 'purchases') {
    if (!threadListUl) return;
    
    threadListUl.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    noThreadsPlaceholder?.classList.add('hidden');

    try {
        const response = await secureFetch(`${API_MESSAGES_URL}/threads?role=${role}`, {}, false);
        renderThreadList(response?.data?.threads || []);
    } catch (error) {
        console.error("Erreur chargement threads:", error);
        renderThreadList([]);
        if (noThreadsPlaceholder) {
            noThreadsPlaceholder.textContent = "Erreur de chargement des conversations.";
            noThreadsPlaceholder.classList.remove('hidden');
        }
    }
}

function renderThreadList(threadsData) {
    if (!threadListUl || !threadItemTemplate) return;
    threadListUl.innerHTML = '';

    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        noThreadsPlaceholder?.classList.remove('hidden');
        return;
    }

    if (!threadsData?.length) {
        noThreadsPlaceholder?.classList.remove('hidden');
        return;
    }
    noThreadsPlaceholder?.classList.add('hidden');

    const totalUnread = threadsData.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
    updateGlobalUnreadCount(totalUnread);

    threadsData.forEach(thread => {
        const recipient = thread.participants.find(p => p._id !== currentUser._id);
        if (!recipient) return;

        const clone = threadItemTemplate.content.cloneNode(true);
        const li = clone.querySelector('.thread-item');
        li.dataset.threadId = thread._id;

        const thumbnail = li.querySelector('.thread-item__thumbnail');
        const adTitle = li.querySelector('.thread-item__ad-title');
        const userNameEl = li.querySelector('.thread-item__user-name');
        const messagePreviewEl = li.querySelector('.thread-item__message-preview');
        const timeEl = li.querySelector('.thread-time');
        const unreadBadge = li.querySelector('.unread-badge');

        // Remplissage des données
        if (thread.ad) {
            if (thumbnail) {
                thumbnail.src = thread.ad.imageUrls?.[0] || 'https://placehold.co/60x60/e0e0e0/757575?text=Ad';
                thumbnail.alt = `Image pour ${sanitizeHTML(thread.ad.title)}`;
            }
            if (adTitle) adTitle.textContent = sanitizeHTML(thread.ad.title);
        } else {
            if (thumbnail) thumbnail.src = recipient.avatarUrl || 'https://placehold.co/60x60/e0e0e0/757575?text=User';
            if (adTitle) adTitle.textContent = "Discussion directe";
        }

        const lastMessageSender = thread.lastMessage?.sender?.toString() === currentUser._id ? "Vous" : recipient.name;
        const previewText = thread.lastMessage?.text
            ? sanitizeHTML(thread.lastMessage.text)
            : (thread.lastMessage?.imageUrl ? '[Image]' : 'Début de la conversation');

        if (userNameEl) userNameEl.textContent = `${sanitizeHTML(lastMessageSender)}: `;
        if (messagePreviewEl) messagePreviewEl.textContent = previewText;
        if (timeEl) timeEl.textContent = thread.lastMessage 
            ? formatDate(thread.lastMessage.createdAt, { hour: '2-digit', minute: '2-digit' }) 
            : '';

        const unreadCountForThread = thread.unreadCount || 0;
        if (unreadCountForThread > 0) li.classList.add('thread-unread');
        if (unreadBadge) {
            unreadBadge.textContent = unreadCountForThread;
            unreadBadge.classList.toggle('hidden', unreadCountForThread === 0);
        }

        li.addEventListener('click', () => openChatView(thread._id, recipient, thread));
        threadListUl.appendChild(clone);
    });
}

async function loadMessageHistory(threadId, isInitialLoad = false) {
    if (isLoadingHistory || allMessagesLoaded || !threadId) return;
    isLoadingHistory = true;
    
    if (isInitialLoad) {
        chatMessagesContainer.innerHTML = '';
        chatHistoryLoader?.classList.remove('hidden');
    }

    const oldestMessage = chatMessagesContainer.querySelector('.chat-message:first-child');
    const beforeTimestamp = !isInitialLoad && oldestMessage ? oldestMessage.dataset.messageTimestamp : '';

    try {
        const url = `${API_MESSAGES_URL}/threads/${threadId}/messages?limit=20&before=${beforeTimestamp}`;
        const response = await secureFetch(url, {}, false);
        const messages = response?.data?.messages || [];
        const currentUserId = state.getCurrentUser()?._id;
        const messagesToMarkAsRead = [];

        if (messages.length < 20) allMessagesLoaded = true;

        if (isInitialLoad && messages.length === 0) {
            chatHistoryLoader.innerHTML = `<p class="text-center text-muted">Envoyez le premier message !</p>`;
        } else if (messages.length < 20) {
            chatHistoryLoader.innerHTML = `<p class="text-center text-muted">Début de la conversation</p>`;
        }

        messages.forEach(m => {
            if (m.status !== 'read' && (m.senderId?._id || m.senderId) !== currentUserId) {
                messagesToMarkAsRead.push(m._id);
            }
        });

        renderMessages(messages, 'prepend');
        
        if (messagesToMarkAsRead.length > 0) {
            await markMessagesAsRead(messagesToMarkAsRead);
        }
    } catch (error) {
        console.error("Erreur de chargement de l'historique:", error);
        showToast("Erreur de chargement de l'historique.", "error");
    } finally {
        isLoadingHistory = false;
        if (isInitialLoad) chatHistoryLoader?.classList.add('hidden');
    }
}

function renderMessages(messages, method) {
    if (!messages?.length || !chatMessageTemplate) return;

    const fragment = document.createDocumentFragment();
    const currentUserId = state.getCurrentUser()?._id;
    let lastDay = null;

    messages.forEach((msg) => {
        const msgDate = new Date(msg.createdAt);
        const msgDayKey = msgDate.toDateString();
        
        // Ajouter un séparateur de date si nécessaire
        if (lastDay && lastDay !== msgDayKey) {
            const sep = document.createElement('div');
            sep.className = 'date-separator';
            sep.textContent = msgDate.toLocaleDateString();
            fragment.appendChild(sep);
        }
        lastDay = msgDayKey;

        const clone = chatMessageTemplate.content.cloneNode(true);
        const messageEl = clone.querySelector('.chat-message');
        const textEl = messageEl.querySelector('.message-text');
        const timeEl = messageEl.querySelector('.message-time');
        const statusEl = messageEl.querySelector('.message-status-icons');

        if (msg._id) messageEl.dataset.messageId = msg._id;
        if (msg.tempId) messageEl.dataset.tempId = msg.tempId;
        messageEl.dataset.messageTimestamp = msgDate.getTime();

        const isSentByMe = (msg.senderId?._id || msg.senderId) === currentUserId;
        messageEl.dataset.senderId = isSentByMe ? 'me' : 'other';
        if (msg.status === 'sending') messageEl.classList.add('sending');
        if (msg.status === 'failed') messageEl.classList.add('message-failed');

        // Rendu du contenu du message selon le type
        renderMessageContent(msg, textEl, isSentByMe);

        timeEl.textContent = formatDate(msg.createdAt, { hour: '2-digit', minute: '2-digit' });

        if (isSentByMe && statusEl) {
            statusEl.innerHTML = renderMessageStatus(msg);
        } else if (statusEl) {
            statusEl.innerHTML = '';
        }

        fragment.appendChild(clone);
    });

    if (method === 'prepend') {
        const oldScrollHeight = chatMessagesContainer.scrollHeight;
        const oldScrollTop = chatMessagesContainer.scrollTop;
        chatMessagesContainer.prepend(fragment);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight - oldScrollHeight + oldScrollTop;
    } else {
        chatMessagesContainer.appendChild(fragment);
        scrollToBottom(chatMessagesContainer);
    }

    updateMessageGrouping();
}

function renderMessageContent(msg, container, isSentByMe) {
    container.innerHTML = '';

    switch (msg.type) {
        case 'image':
            if (msg.imageUrl) {
                const img = document.createElement('img');
                img.src = msg.imageUrl;
                img.className = 'chat-image-attachment';
                img.alt = 'Image envoyée';
                container.appendChild(img);
                if (msg.text) {
                    const caption = document.createElement('p');
                    caption.textContent = sanitizeHTML(msg.text);
                    caption.style.marginTop = '4px';
                    container.appendChild(caption);
                }
            }
            break;
            
        case 'offer':
            renderOfferMessage(msg, container, isSentByMe);
            break;
            
        case 'appointment':
            renderAppointmentMessage(msg, container, isSentByMe);
            break;
            
        case 'location':
            renderLocationMessage(msg, container);
            break;
            
        case 'system':
            renderSystemMessage(msg, container);
            break;
            
        default:
            container.innerHTML = sanitizeHTML(msg.text || '').replace(/\n/g, '<br>');
    }
}

function renderOfferMessage(msg, container, isSentByMe) {
    const offerTpl = document.getElementById('offer-card-template');
    if (!offerTpl) {
        container.textContent = `Offre: ${msg.metadata.amount}`;
        return;
    }

    const card = offerTpl.content.firstElementChild.cloneNode(true);
    card.querySelector('.offer-amount').textContent = msg.metadata.amount;
    card.querySelector('.offer-status').textContent = msg.metadata.status || '';
    
    if (!isSentByMe && msg.metadata.status === 'pending') {
        card.querySelector('.offer-accept-btn')?.addEventListener('click', () => handleOfferAction(msg._id, true));
        card.querySelector('.offer-decline-btn')?.addEventListener('click', () => handleOfferAction(msg._id, false));
    } else {
        card.querySelector('.offer-actions')?.remove();
    }
    
    container.appendChild(card);
}

function renderAppointmentMessage(msg, container, isSentByMe) {
    const appTpl = document.getElementById('appointment-card-template');
    if (!appTpl) {
        container.textContent = 'Rendez-vous proposé';
        return;
    }

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
    
    container.appendChild(card);
}

function renderLocationMessage(msg, container) {
    const locTpl = document.getElementById('location-card-template');
    if (!locTpl) {
        container.textContent = 'Localisation partagée';
        return;
    }

    const card = locTpl.content.firstElementChild.cloneNode(true);
    card.querySelector('.location-coords').textContent = `${msg.metadata.latitude}, ${msg.metadata.longitude}`;
    card.querySelector('.location-map-link').href = `https://maps.google.com/?q=${msg.metadata.latitude},${msg.metadata.longitude}`;
    container.appendChild(card);
}

function renderSystemMessage(msg, container) {
    const sysTpl = document.getElementById('system-message-template');
    if (sysTpl) {
        const card = sysTpl.content.firstElementChild.cloneNode(true);
        card.textContent = sanitizeHTML(msg.text);
        container.appendChild(card);
    } else {
        container.textContent = sanitizeHTML(msg.text);
    }
}

function renderMessageStatus(message) {
    const sentIcon = '<i class="fa-solid fa-check" title="Envoyé"></i>';
    const deliveredIcon = '<i class="fa-solid fa-check-double" title="Distribué"></i>';
    const readIcon = '<i class="fa-solid fa-check-double" title="Lu" style="color: #4fc3f7;"></i>';

    switch (message.status) {
        case 'read': return readIcon;
        case 'delivered': return deliveredIcon;
        default: return sentIcon;
    }
}

// --- ACTIONS UTILISATEUR ---

function handleInputKeypress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function handleThreadsTabClick(e) {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    
    threadsTabs.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTabRole = btn.dataset.tab || 'purchases';
    loadThreads(currentTabRole);
}

async function _sendPayload(payload, imageFile = null) {
    const hasImage = Boolean(imageFile);
    const tempId = generateUUID();
    payload.tempId = tempId;

    // Créer un message temporaire
    const tempMessage = {
        tempId,
        threadId: payload.threadId || activeThreadId,
        text: payload.text,
        type: payload.type || (hasImage ? 'image' : 'text'),
        imageUrl: hasImage ? URL.createObjectURL(imageFile) : undefined,
        senderId: { _id: state.getCurrentUser()._id },
        status: 'sending',
        createdAt: new Date().toISOString()
    };
    renderMessages([tempMessage], 'append');

    const endpoint = hasImage ? `${API_MESSAGES_URL}/messages/image` : `${API_MESSAGES_URL}/messages`;
    const requestOptions = { method: 'POST' };

    // Préparer les données à envoyer
    if (hasImage) {
        const formData = new FormData();
        formData.append('image', imageFile);
        for (const key in payload) {
            if (payload[key] !== undefined && payload[key] !== null) {
                formData.append(key, payload[key]);
            }
        }
        requestOptions.body = formData;
    } else {
        requestOptions.headers = { 'Content-Type': 'application/json' };
        requestOptions.body = JSON.stringify(payload);
    }

    // Sauvegarder l'état avant envoi pour restauration en cas d'erreur
    const messageInputBeforeSend = chatMessageInput.value;
    const imageFileBeforeSend = tempImageFile;

    // Réinitialiser l'interface
    chatMessageInput.value = '';
    removeImagePreview();
    stopTypingEvent();
    updateSendButtonState();

    try {
        const response = await secureFetch(endpoint, requestOptions, false);
        if (!response?.success) {
            throw new Error(response?.message || "Erreur d'envoi.");
        }

        // Gérer la création d'un nouveau thread si nécessaire
        if (!activeThreadId && response.data?.threadId) {
            activeThreadId = response.data.threadId;
            newChatContext = null;
            loadThreads(currentTabRole);
        }
    } catch (error) {
        console.error("Erreur d'envoi du message:", error);
        
        // Restaurer l'état précédent
        chatMessageInput.value = messageInputBeforeSend;
        if (imageFileBeforeSend) {
            tempImageFile = imageFileBeforeSend;
            displayImagePreview(imageFileBeforeSend);
        }

        // Marquer le message comme échoué
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

async function sendMessage() {
    const text = chatMessageInput.value.trim();
    const imageFile = tempImageFile;

    if (!text && !imageFile) return;

    const payload = { text };

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

async function handleOfferSubmit() {
    const input = document.getElementById('offer-amount-input');
    const amount = parseFloat(input?.value);
    if (!amount) {
        showToast('Montant invalide', 'warning');
        return;
    }

    const payload = {
        type: 'offer',
        text: `Offre: ${formatCurrency(amount, 'EUR')}`,
        metadata: { amount, currency: 'EUR', status: 'pending' }
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

async function handleShareLocation() {
    if (!navigator.geolocation) {
        showToast('Géolocalisation non supportée', 'error');
        return;
    }

    toggleGlobalLoader(true, "Récupération de votre position...");
    
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            });
        });

        const { latitude, longitude } = position.coords;
        await sendLocationMessage({ latitude, longitude });
    } catch (error) {
        console.error("Erreur de géolocalisation:", error);
        showToast('Impossible de récupérer la position', 'error');
    } finally {
        toggleGlobalLoader(false);
        toggleComposerMenu(true);
    }
}

async function sendLocationMessage(coords) {
    if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
        showToast('Coordonnées invalides', 'warning');
        return;
    }

    const payload = { 
        type: 'location', 
        text: 'Localisation', 
        metadata: coords 
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
}

async function handleMeetRequest() {
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', { 
        detail: { 
            modalId: 'appointment-modal', 
            triggerElement: chatMeetBtn 
        } 
    }));
    toggleComposerMenu(true);
}

async function handleAppointmentSubmit() {
    const date = document.getElementById('appointment-date')?.value;
    const time = document.getElementById('appointment-time')?.value;
    const location = document.getElementById('appointment-location')?.value?.trim();
    
    if (!date || !time || !location) {
        showToast('Informations RDV manquantes', 'warning');
        return;
    }

    const isoDate = new Date(`${date}T${time}`).toISOString();
    await sendAppointmentMessage({ 
        date: isoDate, 
        location, 
        status: 'pending' 
    });
    
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'appointment-modal' } }));
}

async function sendAppointmentMessage(appointmentData) {
    const payload = { 
        type: 'appointment', 
        text: 'Rendez-vous', 
        metadata: appointmentData 
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
}

async function handleDeleteChat() {
    const threadIdToDelete = activeThreadId;
    if (!threadIdToDelete) {
        showToast("Aucune conversation active à supprimer.", "error");
        return;
    }

    chatOptionsMenu?.classList.add('hidden');

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

                    if (response?.success) {
                        showToast("Conversation masquée de votre liste.", "success");
                        showThreadList();
                    } else {
                        throw new Error(response?.message || 'Impossible de masquer la conversation.');
                    }
                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    toggleGlobalLoader(false);
                }
            }
        }
    }));
}

function handleImageFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!VALID_IMAGE_TYPES.includes(file.type)) {
        showToast("Format d'image non valide (JPEG, PNG, WebP).", "error");
        return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
        showToast(`L'image est trop grande (max ${MAX_IMAGE_SIZE_MB}MB).`, "error");
        return;
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
        chatImagePreviewContainer.querySelector('.chat-remove-preview-btn')
            .addEventListener('click', removeImagePreview);
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
    const hasText = chatMessageInput?.value.trim().length > 0;
    const hasImage = !!tempImageFile;
    if (sendChatMessageBtn) {
        sendChatMessageBtn.disabled = !(hasText || hasImage);
    }
}

function adjustTextareaHeight() {
    if (!chatMessageInput) return;
    
    chatMessageInput.style.height = 'auto';
    const scrollHeight = chatMessageInput.scrollHeight;
    const maxHeight = 120;
    
    if (scrollHeight > maxHeight) {
        chatMessageInput.style.height = `${maxHeight}px`;
        chatMessageInput.style.overflowY = 'auto';
    } else {
        chatMessageInput.style.height = `${scrollHeight}px`;
        chatMessageInput.style.overflowY = 'hidden';
    }
}

function updateMessageGrouping() {
    const messages = [...chatMessagesContainer.querySelectorAll('.chat-message:not(.system-message)')];
    messages.forEach((el, idx) => {
        el.classList.remove(
            'is-first-in-group',
            'is-middle-in-group',
            'is-last-in-group',
            'is-single-message'
        );

        const prev = messages[idx - 1];
        const next = messages[idx + 1];
        const sender = el.dataset.senderId;
        const prevSender = prev?.dataset.senderId;
        const nextSender = next?.dataset.senderId;

        const isFirst = !prev || prevSender !== sender;
        const isLast = !next || nextSender !== sender;

        if (isFirst && isLast) {
            el.classList.add('is-single-message');
        } else if (isFirst) {
            el.classList.add('is-first-in-group');
        } else if (isLast) {
            el.classList.add('is-last-in-group');
        } else {
            el.classList.add('is-middle-in-group');
        }
    });
}

// --- GESTION ÉVÉNEMENTS SOCKET ---

function handleNewMessageReceived({ message, thread, unreadThreadCount }) {
    if (typeof unreadThreadCount === 'number') {
        state.set('messages.unreadGlobalCount', unreadThreadCount);
    }

    if (threadListView?.classList.contains('active-view')) {
        loadThreads(currentTabRole);
    }
    
    const currentUser = state.getCurrentUser();
    const isMyMessage = (message.senderId?._id || message.senderId) === currentUser?._id;

    // Mise à jour des messages temporaires
    if (isMyMessage && message.tempId) {
        updateTemporaryMessage(message);
        return;
    }
    
    // Affichage du nouveau message
    if (activeThreadId === message.threadId) {
        renderMessages([message], 'append');
        markMessagesAsRead([message._id]);
    } else {
        notifyNewMessage(thread, message, currentUser);
    }
}

function updateTemporaryMessage(message) {
    const tempMessageEl = document.querySelector(`.chat-message[data-temp-id="${message.tempId}"]`);
    if (!tempMessageEl) return;

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
}

function notifyNewMessage(thread, message, currentUser) {
    const sender = thread.participants.find(p => p.user._id === message.senderId);
    if (!sender || sender.user._id === currentUser._id) return;

    showToast(`Nouveau message de ${sanitizeHTML(sender.user.name)}`, 'info');
    
    if (newMessagesSound) {
        newMessagesSound.play().catch(e => console.warn('Erreur lecture son:', e));
    }
    
    loadThreads(currentTabRole);
}

function sendTypingEvent() {
    if (!socket?.connected || !activeThreadId) return;
    
    socket.emit('typing', { 
        threadId: activeThreadId, 
        userName: state.getCurrentUser().name 
    });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTypingEvent, 1500);
}

function stopTypingEvent() {
    if (socket?.connected && activeThreadId) {
        socket.emit('stopTyping', { threadId: activeThreadId });
    }
    clearTimeout(typingTimeout);
    typingTimeout = null;
}

async function handleOfferAction(messageId, accept) {
    const endpoint = `${API_MESSAGES_URL}/messages/${messageId}/offer/${accept ? 'accept' : 'decline'}`;
    try {
        const res = await secureFetch(endpoint, { method: 'POST' }, false);
        if (!res?.success) throw new Error(res?.message || 'Erreur');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function handleTypingEventReceived({ userName }) {
    if (!chatTypingIndicator || userName === state.getCurrentUser()?.name) return;
    
    chatTypingIndicator.textContent = `${sanitizeHTML(userName)} est en train d'écrire...`;
    chatTypingIndicator.classList.remove('hidden');
    
    clearTimeout(typingIndicatorTimer);
    typingIndicatorTimer = setTimeout(() => {
        chatTypingIndicator.classList.add('hidden');
        chatTypingIndicator.textContent = '';
    }, TYPING_TIMEOUT);
}

function handleStopTypingEvent() {
    if (!chatTypingIndicator) return;
    
    chatTypingIndicator.classList.add('hidden');
    chatTypingIndicator.textContent = '';
    clearTimeout(typingIndicatorTimer);
}

function handleMessagesReadEvent({ threadId, readerId }) {
    if (activeThreadId !== threadId || readerId === state.getCurrentUser()?._id) return;
    
    document.querySelectorAll('.chat-message[data-sender-id="me"] .message-status-icons').forEach(statusEl => {
        const icon = statusEl.querySelector('i');
        if (icon && icon.style.color !== 'rgb(79, 195, 247)') {
            statusEl.innerHTML = '<i class="fa-solid fa-check-double" title="Lu" style="color: #4fc3f7;"></i>';
        }
    });
}

function handleUserStatusUpdate({ userId, statusText }) {
    if (currentRecipient?._id === userId && chatRecipientStatus) {
        chatRecipientStatus.textContent = statusText;
    }
}

// --- FONCTIONS UTILITAIRES ---

async function markThreadAsRead(threadId) {
    if (!threadId) return;
    
    if (socket) {
        socket.emit('markThreadRead', { threadId });
    }
    
    try {
        const response = await secureFetch(`/api/messages/threads/${threadId}/read`, { 
            method: 'POST' 
        }, false);
        
        if (response?.success && typeof response.data.unreadThreadCount === 'number') {
            state.set('messages.unreadGlobalCount', response.data.unreadThreadCount);
        }
        
        loadThreads(currentTabRole);
    } catch (e) {
        console.error('Erreur mise à jour lecture thread:', e);
    }
}

async function markMessagesAsRead(messageIds) {
    if (!messageIds?.length) return;
    
    try {
        await secureFetch('/api/messages/read', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageIds })
        }, false);
        
        loadThreads(currentTabRole);
    } catch (error) {
        console.error("Erreur de marquage des messages comme lus:", error);
    }
}

function updateGlobalUnreadCount(count) {
    const newCount = Math.max(0, count || 0);
    if (messagesNavBadge) {
        messagesNavBadge.textContent = newCount > 9 ? '9+' : newCount;
        messagesNavBadge.classList.toggle('hidden', newCount === 0);
    }
}

function scrollToBottom(container) {
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

function setupInfiniteScroll() {
    if (messageObserver) messageObserver.disconnect();
    
    messageObserver = new IntersectionObserver(entries => {
        if (entries[0]?.isIntersecting && !isLoadingHistory && !allMessagesLoaded) {
            loadMessageHistory(activeThreadId);
        }
    }, { 
        root: chatMessagesContainer, 
        threshold: 0.1 
    });
    
    if (chatHistoryLoader) {
        messageObserver.observe(chatHistoryLoader);
    }
}

async function handleInitiateChatEvent(event) {
    const { recipientId, adId } = event.detail;
    const currentUser = state.getCurrentUser();

    if (!currentUser) {
        showToast("Session non trouvée. Veuillez vous reconnecter.", "error");
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { 
            detail: { modalId: 'auth-modal' }
        }));
        return;
    }

    if (!recipientId || !adId) {
        showToast("Informations manquantes pour démarrer la discussion.", "error");
        return;
    }

    toggleGlobalLoader(true, "Ouverture de la discussion...");
    
    try {
        const response = await secureFetch(`${API_MESSAGES_URL}/threads/initiate`, {
            method: 'POST',
            body: { recipientId, adId }
        });

        if (!response?.success) {
            throw new Error(response?.message || 'Erreur lors de l\'initiation de la discussion.');
        }

        const thread = response.data.thread;
        const recipientData = thread.participants.find(p => p.user._id !== currentUser._id)?.user;

        if (recipientData) {
            openChatView(thread._id, recipientData, thread);
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', { 
                detail: { modalId: 'messages-modal' } 
            }));
        } else {
            throw new Error('Impossible de trouver les informations du destinataire.');
        }
    } catch (error) {
        console.error("Erreur d'initiation de discussion:", error);
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