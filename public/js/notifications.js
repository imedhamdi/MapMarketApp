// js/notifications.js

/**
 * @file notifications.js
 * @description Gestion de l'affichage des notifications utilisateur,
 * marquage comme lu/non-lu, et mise à jour du badge de notification.
 */

import * as state from './store.js';
import {
    showToast,
    secureFetch,
    sanitizeHTML,
    formatDate
} from './utils.js';

const API_BASE_URL = '/api/notifications';

// --- Éléments du DOM ---
let notificationsPanel, notificationsListContainer, notificationItemTemplate, noNotificationsPlaceholder;
let notificationsBadgeHeader; // Badge sur le bouton de l'en-tête
let markAllAsReadBtn, clearAllNotificationsBtn; // Boutons potentiels dans le panel

// --- État du module ---
// Les notifications sont stockées dans state.js: state.notifications.list et state.notifications.unreadCount

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour les notifications.
 */
export function init() {
    notificationsPanel = document.getElementById('notifications-panel'); // C'est une modale dans index.html
    // Le contenu des notifications sera dans le modal-body de notifications-panel
    notificationsListContainer = notificationsPanel ? notificationsPanel.querySelector('.modal-body') : null;
    // Il faudra un template pour les items de notification dans le HTML, ou le créer dynamiquement.
    // Pour l'instant, on va le créer dynamiquement si non trouvé.
    notificationItemTemplate = document.getElementById('notification-item-template'); // À ajouter au HTML

    noNotificationsPlaceholder = document.getElementById('no-notifications-placeholder'); // À ajouter au HTML
    notificationsBadgeHeader = document.getElementById('notifications-badge');

    // Boutons optionnels à ajouter dans le panel des notifications
    // markAllAsReadBtn = document.getElementById('mark-all-notifications-read-btn');
    // clearAllNotificationsBtn = document.getElementById('clear-all-notifications-btn');

    if (!notificationsPanel || !notificationsListContainer || !notificationsBadgeHeader) {
        console.warn("Un ou plusieurs éléments DOM pour les notifications sont manquants.");
        // Ne pas bloquer le reste de l'app si le panel n'est pas critique au démarrage.
    }

    // Écouteurs d'événements
    const headerNotificationsBtn = document.getElementById('header-notifications-btn');
    if (headerNotificationsBtn) {
        headerNotificationsBtn.addEventListener('click', () => {
            // L'ouverture de la modale est gérée par modals.js via aria-controls
            // On s'assure de charger les notifications à l'ouverture.
        });
    }

    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'notifications-panel') {
            handleOpenNotificationsPanel();
        }
    });

    // S'abonner aux changements de l'état des notifications
    state.subscribe('notificationsChanged', (notificationsState) => {
        updateNotificationsBadge(notificationsState.unreadCount);
        if (notificationsPanel && notificationsPanel.getAttribute('aria-hidden') === 'false') {
            renderNotificationsList(notificationsState.list);
        }
    });

    // Écouteur pour un événement de nouvelle notification (dispatché par SW pour Push ou par messages.js, alerts.js etc.)
    document.addEventListener('mapMarket:newNotification', handleNewNotificationEvent);

    // Charger les notifications initiales et le compteur
    const currentUser = state.getCurrentUser();
    if (currentUser) {
        loadUserNotifications();
    } else {
        updateNotificationsBadge(0); // Pas de notifs si pas connecté
    }

    // Initialiser le badge avec la valeur de l'état (au cas où elle serait déjà là)
    updateNotificationsBadge(state.get('notifications.unreadCount') || 0);


    console.log('Module Notifications initialisé.');
}

/**
 * Gère l'ouverture du panel/modale des notifications.
 */
function handleOpenNotificationsPanel() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        displayNoNotificationsMessage("Veuillez vous connecter pour voir vos notifications.");
        return;
    }
    loadUserNotifications(); // Recharger à chaque ouverture pour avoir les plus récentes
    // Optionnel: marquer automatiquement les notifications comme vues (pas lues) lors de l'ouverture du panel
    // markNotificationsAsSeen();
}

/**
 * Charge les notifications de l'utilisateur depuis le serveur.
 */
async function loadUserNotifications() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        state.set('notifications', {
            list: [],
            unreadCount: 0
        }); // Vider si pas d'utilisateur
        return;
    }

    try {
        // Pas de loader global pour un chargement en arrière-plan ou à l'ouverture du panel
        const notificationsData = await secureFetch(API_BASE_URL, {}, false);
        if (notificationsData && Array.isArray(notificationsData.notifications)) {
            state.set('notifications', {
                list: notificationsData.notifications,
                unreadCount: notificationsData.unreadCount || calculateUnreadCount(notificationsData.notifications)
            });
        } else {
            state.set('notifications', {
                list: [],
                unreadCount: 0
            });
        }
    } catch (error) {
        console.error("Erreur lors du chargement des notifications:", error);
        // Ne pas afficher de toast pour un chargement en arrière-plan
        // mais si l'utilisateur est dans le panel, un message d'erreur pourrait être affiché.
        if (notificationsPanel && notificationsPanel.getAttribute('aria-hidden') === 'false') {
            displayNoNotificationsMessage("Impossible de charger les notifications.");
        }
    }
}

/**
 * Calcule le nombre de notifications non lues à partir d'une liste.
 * @param {Array<Object>} notificationsList
 * @returns {number}
 */
function calculateUnreadCount(notificationsList) {
    return notificationsList.filter(n => !n.isRead).length;
}

/**
 * Gère la réception d'une nouvelle notification (via Push ou événement interne).
 * @param {CustomEvent} event - L'événement contenant event.detail.notificationData
 * notificationData: { id, title, body, icon, timestamp, data: { url, type }, isRead }
 */
function handleNewNotificationEvent(event) {
    const newNotification = event.detail.notificationData;
    if (!newNotification) return;

    const currentNotifications = state.get('notifications.list') || [];
    const newUnreadCount = (state.get('notifications.unreadCount') || 0) + 1;

    // Ajouter au début de la liste
    state.set('notifications', {
        list: [newNotification, ...currentNotifications],
        unreadCount: newUnreadCount
    });

    // Afficher un toast pour la nouvelle notification
    showToast(`${newNotification.title}: ${newNotification.body}`, 'info', 5000);

    // Jouer un son (si activé et la logique est dans messages.js ou ici)
    // if (newMessagesSound && state.get('settings.soundNotificationsEnabled')) newMessagesSound.play();
}


/**
 * Affiche la liste des notifications dans le panel.
 * @param {Array<Object>} notificationsList - Tableau d'objets notification.
 */
function renderNotificationsList(notificationsList) {
    if (!notificationsListContainer) return;

    // Vider le contenu précédent, sauf les éléments persistants comme les boutons d'action globaux
    const listElement = notificationsListContainer.querySelector('#notifications-items-ul') || createNotificationsUl();
    listElement.innerHTML = '';


    if (!notificationsList || notificationsList.length === 0) {
        displayNoNotificationsMessage();
        return;
    }

    if (noNotificationsPlaceholder) noNotificationsPlaceholder.classList.add('hidden');

    notificationsList.forEach(notif => {
        const listItem = createNotificationElement(notif);
        listElement.appendChild(listItem);
    });

    // S'assurer que la liste est dans le conteneur
    if (!notificationsListContainer.querySelector('#notifications-items-ul')) {
        notificationsListContainer.appendChild(listElement);
    }
}

/**
 * Crée l'élément UL pour la liste des notifications s'il n'existe pas.
 * @returns {HTMLUListElement}
 */
function createNotificationsUl() {
    // Vider le conteneur au cas où il y aurait le message "pas de notif"
    if (notificationsListContainer) notificationsListContainer.innerHTML = '';

    const ul = document.createElement('ul');
    ul.id = 'notifications-items-ul';
    ul.className = 'notifications-list divide-y divide-gray-200 dark:divide-gray-700'; // Classes Tailwind exemple
    return ul;
}


/**
 * Crée un élément HTML pour une notification.
 * @param {Object} notif - L'objet notification.
 * Expected: { id, title, body, icon (url), timestamp, data: { url (lien au clic), type }, isRead }
 * @returns {HTMLLIElement}
 */
function createNotificationElement(notif) {
    const listItem = document.createElement('li');
    listItem.className = `notification-item p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${notif.isRead ? 'read' : 'unread'}`;
    listItem.dataset.notificationId = notif.id;
    listItem.setAttribute('role', 'listitem');
    listItem.setAttribute('tabindex', '0'); // Pour la navigation clavier

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'flex items-start space-x-3';

    // Icône (optionnelle)
    if (notif.icon) {
        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'flex-shrink-0';
        const img = document.createElement('img');
        img.className = 'h-10 w-10 rounded-full object-cover';
        img.src = sanitizeHTML(notif.icon);
        img.alt = "Icône de notification";
        img.onerror = () => { img.src = 'https://placehold.co/40x40/e0e0e0/757575?text=N'; img.alt = "N"; }; // Fallback
        iconWrapper.appendChild(img);
        contentWrapper.appendChild(iconWrapper);
    } else {
        // Icône par défaut basée sur le type
        const iconPlaceholder = document.createElement('div');
        iconPlaceholder.className = 'flex-shrink-0 h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center';
        const faIcon = document.createElement('i');
        faIcon.className = `fa-solid ${getIconForNotificationType(notif.data?.type)} fa-lg text-gray-600 dark:text-gray-300`;
        iconPlaceholder.appendChild(faIcon);
        contentWrapper.appendChild(iconPlaceholder);
    }


    const textWrapper = document.createElement('div');
    textWrapper.className = 'flex-1 min-w-0';

    const titleEl = document.createElement('p');
    titleEl.className = `text-sm font-medium ${notif.isRead ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`;
    titleEl.textContent = sanitizeHTML(notif.title);
    textWrapper.appendChild(titleEl);

    const bodyEl = document.createElement('p');
    bodyEl.className = `text-sm ${notif.isRead ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-200'}`;
    bodyEl.textContent = sanitizeHTML(notif.body);
    textWrapper.appendChild(bodyEl);

    const timeEl = document.createElement('p');
    timeEl.className = 'text-xs text-gray-400 dark:text-gray-500 mt-1';
    timeEl.textContent = formatDate(notif.timestamp || new Date(), {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
    timeEl.setAttribute('datetime', new Date(notif.timestamp || Date.now()).toISOString());
    textWrapper.appendChild(timeEl);

    contentWrapper.appendChild(textWrapper);

    // Indicateur non lu (petit point)
    if (!notif.isRead) {
        const unreadDot = document.createElement('div');
        unreadDot.className = 'ml-auto flex-shrink-0 w-2.5 h-2.5 bg-blue-500 rounded-full self-center';
        unreadDot.setAttribute('aria-label', 'Non lue');
        contentWrapper.appendChild(unreadDot);
    }

    listItem.appendChild(contentWrapper);

    // Action au clic
    listItem.addEventListener('click', () => handleNotificationClick(notif));
    listItem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            handleNotificationClick(notif);
        }
    });


    return listItem;
}

/**
 * Retourne une classe d'icône FontAwesome basée sur le type de notification.
 * @param {string} type - Le type de notification (ex: 'new_message', 'new_ad_alert', 'system').
 * @returns {string}
 */
function getIconForNotificationType(type) {
    switch (type) {
        case 'new_message':
            return 'fa-comment-dots';
        case 'new_ad_alert':
            return 'fa-bell-on'; // ou fa-bullhorn
        case 'favorite_update':
            return 'fa-heart';
        case 'offer_received':
            return 'fa-hand-holding-dollar';
        default:
            return 'fa-info-circle';
    }
}


/**
 * Gère le clic sur une notification.
 * @param {Object} notif - L'objet notification.
 */
async function handleNotificationClick(notif) {
    // Marquer comme lue (localement et sur le serveur)
    if (!notif.isRead) {
        markNotificationAsRead(notif.id);
    }

    // Rediriger vers l'URL associée si elle existe
    if (notif.data && notif.data.url) {
        // Fermer le panel des notifications avant de naviguer
        document.dispatchEvent(new CustomEvent('mapmarket:closeModal', {
            detail: {
                modalId: 'notifications-panel'
            }
        }));
        // Gérer la navigation. Pour une SPA, cela pourrait être plus complexe.
        // Pour l'instant, on suppose une redirection simple si c'est une URL externe,
        // ou un dispatch d'événement pour une navigation interne.
        if (notif.data.url.startsWith('http')) {
            window.open(notif.data.url, '_blank'); // Ouvrir dans un nouvel onglet si externe
        } else {
            // Exemple de navigation interne:
            // if (notif.data.type === 'new_message' && notif.data.threadId) {
            //    document.dispatchEvent(new CustomEvent('mapMarket:navigateToChat', { detail: { threadId: notif.data.threadId }}));
            // } else if (notif.data.type === 'new_ad_alert' && notif.data.adId) {
            //    document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', { detail: { adId: notif.data.adId }}));
            // } else {
            //    window.location.href = notif.data.url; // Pour les liens relatifs simples
            // }
            showToast(`Navigation vers: ${notif.data.url} (logique à implémenter)`, "info");
        }
    } else {
        console.log("Notification cliquée, pas d'URL de redirection:", notif);
    }
}

/**
 * Marque une notification comme lue.
 * @param {string} notificationId - L'ID de la notification.
 */
async function markNotificationAsRead(notificationId) {
    const currentNotifications = state.get('notifications.list') || [];
    const notificationIndex = currentNotifications.findIndex(n => n.id === notificationId);

    if (notificationIndex > -1 && !currentNotifications[notificationIndex].isRead) {
        const updatedNotifications = [...currentNotifications];
        updatedNotifications[notificationIndex] = { ...updatedNotifications[notificationIndex],
            isRead: true
        };
        const newUnreadCount = Math.max(0, (state.get('notifications.unreadCount') || 1) - 1);

        state.set('notifications', {
            list: updatedNotifications,
            unreadCount: newUnreadCount
        }); // Met à jour l'UI via le listener

        try {
            await secureFetch(`${API_BASE_URL}/${notificationId}/read`, {
                method: 'POST'
            }, false);
            console.log(`Notification ${notificationId} marquée comme lue sur le serveur.`);
        } catch (error) {
            console.error(`Erreur lors du marquage de la notification ${notificationId} comme lue:`, error);
            // Optionnel: annuler le changement local si l'appel API échoue ?
            // Pour l'instant, on garde l'optimisme côté client.
            showToast("Erreur de synchronisation du statut de la notification.", "error");
        }
    }
}

/**
 * Affiche un message lorsqu'il n'y a pas de notifications.
 * @param {string} [message="Aucune notification pour le moment."]
 */
function displayNoNotificationsMessage(message = "Aucune notification pour le moment.") {
    if (!notificationsListContainer) return;

    const listElement = notificationsListContainer.querySelector('#notifications-items-ul');
    if (listElement) listElement.innerHTML = ''; // Vider la liste

    let placeholder = notificationsListContainer.querySelector('#no-notifications-placeholder-panel');
    if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.id = 'no-notifications-placeholder-panel';
        placeholder.className = 'placeholder-message text-center p-6 text-gray-500 dark:text-gray-400'; // Classes Tailwind exemple
        const icon = document.createElement('i');
        icon.className = 'fa-regular fa-bell-slash fa-3x mb-3';
        placeholder.appendChild(icon);
        const p = document.createElement('p');
        p.dataset.i18n = "notifications.noNotifications"; // Pour traduction future
        placeholder.appendChild(p);
        notificationsListContainer.appendChild(placeholder);
    }
    placeholder.querySelector('p').textContent = message;
    placeholder.classList.remove('hidden');
}


/**
 * Met à jour le badge de notification sur l'icône de l'en-tête.
 * @param {number} count - Le nombre de notifications non lues.
 */
function updateNotificationsBadge(count) {
    if (notificationsBadgeHeader) {
        const displayCount = count > 99 ? '99+' : count;
        notificationsBadgeHeader.textContent = displayCount;
        notificationsBadgeHeader.dataset.count = count;
        notificationsBadgeHeader.classList.toggle('hidden', count === 0);
        notificationsBadgeHeader.setAttribute('aria-label', `${count} notifications non lues`);
    }
}

// --- Fonctions pour les actions globales (Mark all as read, Clear all) ---
// Ces fonctions nécessiteraient des boutons dans le panel des notifications.

// async function handleMarkAllAsRead() { ... }
// async function handleClearAllNotifications() { ... }


/**
 * Initialise le module des notifications.
 */
// init() est déjà défini plus haut.

// L'initialisation sera appelée depuis main.js
// init();
