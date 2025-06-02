// js/history.js

/**
 * @file history.js
 * @description Gestion de l'historique de navigation local (annonces vues).
 * Permet de sauvegarder les annonces consultées, de les afficher dans une modale
 * et de permettre à l'utilisateur de supprimer l'historique.
 */

import * as state from './state.js'; // Pour accéder aux données des annonces si besoin, et à la langue
import {
    showToast,
    sanitizeHTML,
    formatDate
} from './utils.js';

const LOCAL_STORAGE_KEY = 'mapMarketNavigationHistory';
const MAX_HISTORY_ITEMS = 50; // Limiter le nombre d'éléments dans l'historique

// --- Éléments du DOM ---
let navHistoryModal, navHistoryListContainer, navHistoryItemTemplate, noHistoryPlaceholder;
let clearHistoryBtn;
let navHistoryBtn; // Bouton dans le menu "Plus"

// --- État du module ---
let navigationHistory = []; // Array d'objets { adId, title, imageUrl, viewedAt, adUrl (optionnel) }

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour l'historique.
 */
export function init() {
    navHistoryModal = document.getElementById('nav-history-modal');
    navHistoryListContainer = document.getElementById('nav-history-list-container');
    navHistoryItemTemplate = document.getElementById('nav-history-item-template');
    noHistoryPlaceholder = document.getElementById('no-history-placeholder');
    clearHistoryBtn = document.getElementById('clear-history-btn');

    navHistoryBtn = document.getElementById('more-nav-history-btn'); // Bouton dans le menu "Plus"

    if (!navHistoryModal || !navHistoryListContainer || !navHistoryItemTemplate || !noHistoryPlaceholder || !clearHistoryBtn) {
        console.warn("Un ou plusieurs éléments DOM pour l'historique de navigation sont manquants.");
        return;
    }

    // Écouteurs d'événements
    if (navHistoryBtn) {
        navHistoryBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                detail: {
                    modalId: 'nav-history-modal'
                }
            }));
        });
    }

    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'nav-history-modal') {
            renderNavigationHistory();
        }
    });

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', handleClearHistory);
    }

    // Écouteur pour l'événement d'une annonce vue
    document.addEventListener('mapMarket:adViewed', handleAdViewedEvent);

    // Charger l'historique initial depuis localStorage
    loadHistoryFromStorage();

    console.log('Module History initialisé.');
}

/**
 * Charge l'historique de navigation depuis localStorage.
 */
function loadHistoryFromStorage() {
    try {
        const storedHistory = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedHistory) {
            navigationHistory = JSON.parse(storedHistory);
        } else {
            navigationHistory = [];
        }
    } catch (error) {
        console.error("Erreur lors du chargement de l'historique depuis localStorage:", error);
        navigationHistory = [];
    }
    // Assurer que l'historique ne dépasse pas la limite (au cas où)
    if (navigationHistory.length > MAX_HISTORY_ITEMS) {
        navigationHistory = navigationHistory.slice(navigationHistory.length - MAX_HISTORY_ITEMS);
    }
}

/**
 * Sauvegarde l'historique de navigation dans localStorage.
 */
function saveHistoryToStorage() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(navigationHistory));
    } catch (error) {
        console.error("Erreur lors de la sauvegarde de l'historique dans localStorage:", error);
    }
}

/**
 * Gère l'événement lorsqu'une annonce est consultée.
 * @param {CustomEvent} event - L'événement contenant event.detail.adData
 * adData devrait contenir { id, title, imageUrls (premier), /* autres infos utiles *\/ }
 */
function handleAdViewedEvent(event) {
    const adData = event.detail.adData;
    if (!adData || !adData.id) return;

    addHistoryItem({
        adId: adData.id,
        title: adData.title,
        imageUrl: (adData.imageUrls && adData.imageUrls.length > 0) ? adData.imageUrls[0] : null,
        viewedAt: new Date().toISOString(),
        // Optionnel: URL pour ouvrir directement l'annonce
        // adUrl: `/ad/${adData.id}` // Ou une structure d'URL appropriée
    });
}

/**
 * Ajoute un élément à l'historique de navigation.
 * @param {Object} item - L'objet à ajouter à l'historique.
 * Ex: { adId, title, imageUrl, viewedAt }
 */
function addHistoryItem(item) {
    if (!item || !item.adId) return;

    // Vérifier si l'élément (basé sur adId) est déjà dans l'historique récent pour éviter les doublons rapides
    // Si déjà présent, on pourrait le remonter en haut (plus récent)
    const existingItemIndex = navigationHistory.findIndex(h => h.adId === item.adId);
    if (existingItemIndex > -1) {
        // Supprimer l'ancien et ajouter le nouveau pour le mettre en tête
        navigationHistory.splice(existingItemIndex, 1);
    }

    // Ajouter le nouvel élément au début (plus récent)
    navigationHistory.unshift(item);

    // Limiter la taille de l'historique
    if (navigationHistory.length > MAX_HISTORY_ITEMS) {
        navigationHistory = navigationHistory.slice(0, MAX_HISTORY_ITEMS);
    }

    saveHistoryToStorage();

    // Si la modale d'historique est ouverte, la rafraîchir
    if (navHistoryModal && navHistoryModal.getAttribute('aria-hidden') === 'false') {
        renderNavigationHistory();
    }
}

/**
 * Affiche l'historique de navigation dans la modale.
 */
function renderNavigationHistory() {
    if (!navHistoryListContainer || !navHistoryItemTemplate) return;

    const listElement = navHistoryListContainer.querySelector('#nav-history-list') || document.createElement('ul');
    listElement.id = 'nav-history-list';
    listElement.className = 'item-list'; // Utiliser la même classe que pour les favoris
    listElement.innerHTML = ''; // Vider la liste existante

    if (navigationHistory.length === 0) {
        if (noHistoryPlaceholder) noHistoryPlaceholder.classList.remove('hidden');
        if (clearHistoryBtn) clearHistoryBtn.disabled = true; // Désactiver le bouton si pas d'historique
        return;
    }

    if (noHistoryPlaceholder) noHistoryPlaceholder.classList.add('hidden');
    if (clearHistoryBtn) clearHistoryBtn.disabled = false;

    navigationHistory.forEach(item => {
        const templateClone = navHistoryItemTemplate.content.cloneNode(true);
        const listItem = templateClone.querySelector('.history-item'); // S'assurer que le template a cette classe

        const img = listItem.querySelector('.item-image');
        const titleEl = listItem.querySelector('.item-title');
        const dateEl = listItem.querySelector('.item-view-date'); // S'assurer que le template a cet élément
        const removeBtn = listItem.querySelector('.remove-history-item-btn');

        listItem.dataset.adId = item.adId; // Pour une action future potentielle

        if (img) {
            img.src = item.imageUrl || 'https://placehold.co/60x60/e0e0e0/757575?text=Ad';
            img.alt = `Image de ${sanitizeHTML(item.title)}`;
            img.loading = 'lazy';
        }
        if (titleEl) titleEl.textContent = sanitizeHTML(item.title);
        if (dateEl) {
            dateEl.textContent = `Vu ${formatDate(item.viewedAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
            dateEl.setAttribute('datetime', item.viewedAt);
        }

        if (removeBtn) {
            removeBtn.setAttribute('aria-label', `Supprimer "${sanitizeHTML(item.title)}" de l'historique`);
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeHistoryItem(item.adId);
            });
        }

        // Gérer le clic sur l'élément de l'historique pour ouvrir l'annonce
        listItem.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', {
                detail: {
                    modalId: 'nav-history-modal'
                }
            }));
            // Déclencher l'affichage des détails de l'annonce
            // ads.js doit écouter cet événement
            document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', {
                detail: {
                    adId: item.adId
                }
            }));
        });
        listItem.setAttribute('role', 'button');
        listItem.setAttribute('tabindex', '0');
        listItem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                 listItem.click();
            }
        });


        listElement.appendChild(listItem);
    });

    // S'assurer que la liste est dans le conteneur
    if (!navHistoryListContainer.querySelector('#nav-history-list')) {
        navHistoryListContainer.appendChild(listElement);
    }
}

/**
 * Supprime un élément spécifique de l'historique.
 * @param {string} adId - L'ID de l'annonce à supprimer de l'historique.
 */
function removeHistoryItem(adId) {
    navigationHistory = navigationHistory.filter(item => item.adId !== adId);
    saveHistoryToStorage();
    renderNavigationHistory(); // Rafraîchir la liste affichée
    showToast("Élément supprimé de l'historique.", "info");
}

/**
 * Gère la suppression de tout l'historique de navigation.
 */
function handleClearHistory() {
    if (navigationHistory.length === 0) return;

    // Utiliser la modale de confirmation générique
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal',
            title: 'Effacer l\'historique',
            message: 'Êtes-vous sûr de vouloir effacer tout votre historique de navigation ? Cette action est irréversible.',
            confirmButtonText: 'Effacer tout',
            cancelButtonText: 'Annuler',
            confirmButtonClass: 'btn-danger',
            onConfirm: () => {
                navigationHistory = [];
                saveHistoryToStorage();
                renderNavigationHistory(); // Rafraîchir l'affichage (qui montrera "aucun historique")
                showToast("Historique de navigation effacé.", "success");
            }
        }
    }));
}

// L'initialisation sera appelée depuis main.js
// init();
