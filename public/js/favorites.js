// js/favorites.js

/**
 * @file favorites.js
 * @description Gestion des annonces favorites de l'utilisateur.
 * Ajout, suppression, persistance en BDD et affichage dynamique.
 * Mise à jour du badge de favoris et des états des boutons.
 */

import * as state from './state.js';
import {
    showToast,
    secureFetch,
    toggleGlobalLoader,
    sanitizeHTML,
    formatPrice
} from './utils.js';

const API_BASE_URL = '/api/favorites';

// --- Éléments du DOM ---
let favoritesModal, favoritesListContainer, favoriteItemTemplate, noFavoritesPlaceholder;
let favoritesNavBadge;
let navFavoritesBtn; // Bouton dans la barre de navigation inférieure

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour les favoris.
 */
function initFavoritesUI() {
    favoritesModal = document.getElementById('favorites-modal');
    favoritesListContainer = document.getElementById('favorites-list-container');
    favoriteItemTemplate = document.getElementById('favorite-item-template');
    noFavoritesPlaceholder = document.getElementById('no-favorites-placeholder');
    favoritesNavBadge = document.getElementById('favorites-nav-badge');
    navFavoritesBtn = document.getElementById('nav-favorites-btn');

    if (!favoritesModal || !favoritesListContainer || !favoriteItemTemplate || !noFavoritesPlaceholder || !favoritesNavBadge) {
        console.error("Un ou plusieurs éléments DOM pour les favoris sont manquants.");
        return;
    }

    // Gérer l'ouverture de la modale des favoris (peut aussi être géré par modals.js)
    if (navFavoritesBtn) {
        navFavoritesBtn.addEventListener('click', () => {
            // S'assurer que les favoris sont chargés avant d'ouvrir la modale
            // loadUserFavorites(); // Fait par le listener currentUserChanged ou à l'ouverture
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                detail: {
                    modalId: 'favorites-modal'
                }
            }));
        });
    }
    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'favorites-modal') {
            // Charger ou rafraîchir les favoris lors de l'ouverture de la modale
            const currentUser = state.getCurrentUser();
            if (currentUser) {
                loadUserFavorites();
            } else {
                displayNoFavorites(); // Afficher l'état vide si pas connecté
                updateFavoritesBadge(0); // S'assurer que le badge est à zéro
            }
        }
    });


    // Écouteur pour l'événement de bascule de favori (dispatché par ads.js ou map.js)
    document.addEventListener('mapMarket:toggleFavorite', handleToggleFavoriteEvent);

    // Mettre à jour les favoris lorsque l'utilisateur change
    state.subscribe('currentUserChanged', (user) => {
        if (user) {
            loadUserFavorites();
        } else {
            clearFavoritesDisplay();
            updateFavoritesState([]); // Vider l'état des favoris
        }
    });

    // Mettre à jour l'affichage lorsque l'état des favoris change
    state.subscribe('favoritesChanged', (favoriteIds) => {
        updateFavoritesBadge(favoriteIds.length);
        // Si la modale des favoris est ouverte, la rafraîchir
        if (favoritesModal && favoritesModal.getAttribute('aria-hidden') === 'false') {
            renderFavoritesList(favoriteIds);
        }
        // Mettre à jour l'état des boutons favoris sur la page (ex: dans ad-detail-modal)
        updateFavoriteButtonsState(favoriteIds);
    });
}

/**
 * Charge les favoris de l'utilisateur connecté depuis le backend.
 */
async function loadUserFavorites() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        updateFavoritesState([]); // Assure que l'état est vide si pas d'utilisateur
        return;
    }

    try {
        // On ne montre pas de loader global pour cette action en arrière-plan
        // sauf si c'est une action explicite de l'utilisateur.
        const favoriteAds = await secureFetch(API_BASE_URL, {}, false);
        if (favoriteAds && Array.isArray(favoriteAds)) {
            // L'API retourne généralement la liste complète des objets annonces favoris.
            // On stocke uniquement les IDs dans l'état `state.favorites` pour la simplicité
            // et pour vérifier rapidement si une annonce est en favori.
            // Les détails complets sont affichés dans la modale des favoris.
            const favoriteIds = favoriteAds.map(ad => ad.id);
            updateFavoritesState(favoriteIds, favoriteAds); // Passer aussi les données complètes pour le rendu
        } else {
            updateFavoritesState([]);
        }
    } catch (error) {
        console.error("Erreur lors du chargement des favoris:", error);
        // Ne pas afficher de toast pour une erreur de chargement en arrière-plan,
        // sauf si c'est une action initiée par l'utilisateur.
        updateFavoritesState([]);
    }
}

/**
 * Gère l'événement de bascule d'un favori.
 * @param {CustomEvent} event - L'événement contenant adId et setFavorite (boolean).
 */
async function handleToggleFavoriteEvent(event) {
    const {
        adId,
        setFavorite,
        sourceButton
    } = event.detail;
    if (!adId) return;

    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        showToast("Veuillez vous connecter pour gérer vos favoris.", "warning");
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
            detail: {
                modalId: 'auth-modal'
            }
        }));
        return;
    }

    if (setFavorite) {
        await addFavorite(adId, sourceButton);
    } else {
        await removeFavorite(adId, sourceButton);
    }
}

/**
 * Ajoute une annonce aux favoris.
 * @param {string} adId - L'ID de l'annonce à ajouter.
 * @param {HTMLElement} [sourceButton=null] - Le bouton qui a déclenché l'action (pour feedback visuel).
 */
async function addFavorite(adId, sourceButton = null) {
    try {
        toggleGlobalLoader(true, "Ajout aux favoris...");
        const response = await secureFetch(API_BASE_URL, {
            method: 'POST',
            body: {
                adId: adId
            } // Le backend s'attend à l'ID de l'annonce
        }, false);
        toggleGlobalLoader(false);

        if (response && response.success) { // Le backend devrait confirmer
            showToast("Annonce ajoutée aux favoris !", "success");
            const currentFavorites = state.get('favorites') || [];
            if (!currentFavorites.includes(adId)) {
                updateFavoritesState([...currentFavorites, adId]);
            }
            if (sourceButton) animateFavoriteButton(sourceButton, true);
        } else {
            showToast(response.message || "Erreur lors de l'ajout aux favoris.", "error");
        }
    } catch (error) {
        toggleGlobalLoader(false);
        console.error("Erreur d'ajout aux favoris:", error);
    }
}

/**
 * Supprime une annonce des favoris.
 * @param {string} adId - L'ID de l'annonce à supprimer.
 * @param {HTMLElement} [sourceButton=null] - Le bouton qui a déclenché l'action.
 */
async function removeFavorite(adId, sourceButton = null) {
    try {
        toggleGlobalLoader(true, "Suppression des favoris...");
        const response = await secureFetch(`${API_BASE_URL}/${adId}`, { // DELETE /api/favorites/{adId}
            method: 'DELETE'
        }, false);
        toggleGlobalLoader(false);

        if (response && response.success) { // Le backend devrait confirmer
            showToast("Annonce retirée des favoris.", "info");
            const currentFavorites = state.get('favorites') || [];
            updateFavoritesState(currentFavorites.filter(id => id !== adId));
            if (sourceButton) animateFavoriteButton(sourceButton, false);

            // Si la modale des favoris est ouverte, retirer l'élément de la liste
            if (favoritesModal && favoritesModal.getAttribute('aria-hidden') === 'false') {
                const itemToRemove = favoritesListContainer.querySelector(`.favorite-item[data-ad-id="${adId}"]`);
                if (itemToRemove) {
                    itemToRemove.remove();
                    // Vérifier si la liste est vide après suppression
                    const remainingItems = favoritesListContainer.querySelectorAll('.favorite-item');
                    if (remainingItems.length === 0) {
                        displayNoFavorites();
                    }
                }
            }

        } else {
            showToast(response.message || "Erreur lors de la suppression des favoris.", "error");
        }
    } catch (error) {
        toggleGlobalLoader(false);
        console.error("Erreur de suppression des favoris:", error);
    }
}

/**
 * Met à jour l'état local des favoris et notifie les listeners.
 * @param {Array<string>} favoriteIds - Tableau des IDs d'annonces favorites.
 * @param {Array<Object>} [fullFavoriteAdsData=null] - Optionnel, données complètes des annonces favorites pour le rendu.
 */
function updateFavoritesState(favoriteIds, fullFavoriteAdsData = null) {
    state.set('favorites', favoriteIds); // Déclenche 'favoritesChanged'
    // Si la modale est ouverte, on la met à jour directement avec les données complètes si fournies
    if (fullFavoriteAdsData && favoritesModal && favoritesModal.getAttribute('aria-hidden') === 'false') {
        renderFavoritesListWithData(fullFavoriteAdsData);
    }
}


/**
 * Affiche la liste des annonces favorites dans la modale.
 * Cette fonction est appelée lorsque l'état 'favoritesChanged' est notifié
 * et que la modale est ouverte. Elle a besoin des données complètes des annonces.
 * @param {Array<string>} favoriteAdIds - Tableau des IDs d'annonces favorites.
 */
async function renderFavoritesList(favoriteAdIds) {
    if (!favoritesListContainer || !favoriteItemTemplate) return;

    if (!favoriteAdIds || favoriteAdIds.length === 0) {
        displayNoFavorites();
        return;
    }

    // Pour afficher les détails, nous avons besoin des données complètes des annonces.
    // Si `loadUserFavorites` a été appelé, il aurait pu stocker ces données temporairement
    // ou nous devons les récupérer ici. Pour cet exemple, on suppose qu'on a besoin de les fetcher
    // si on n'a que les IDs. C'est moins optimal que de les avoir déjà.
    // Une meilleure approche serait que `state.favorites` contienne les objets Ad complets
    // ou que `loadUserFavorites` mette à jour une liste séparée dans ce module.

    // Pour l'instant, on va simuler la récupération des détails si on n'a que les IDs.
    // Idéalement, `loadUserFavorites` devrait déjà fournir les données complètes à `updateFavoritesState`
    // qui les passerait à `renderFavoritesListWithData`.

    // On va donc modifier pour que `loadUserFavorites` appelle `renderFavoritesListWithData`
    // et que `state.subscribe('favoritesChanged')` appelle `loadUserFavorites` si la modale est ouverte.
    // C'est un peu circulaire. Simplifions:
    // `loadUserFavorites` charge les IDs ET les données, met à jour l'état des IDs,
    // et si la modale est ouverte, appelle `renderFavoritesListWithData`.

    // Cette fonction sera donc appelée par `loadUserFavorites` avec les données complètes.
    // Elle est renommée `renderFavoritesListWithData`
    console.warn("renderFavoritesList (avec IDs seuls) est moins optimal. Utiliser renderFavoritesListWithData.");
    displayNoFavorites(); // Par défaut, jusqu'à ce que la logique soit affinée.
}


/**
 * Affiche la liste des annonces favorites dans la modale avec les données complètes.
 * @param {Array<Object>} favoriteAdsData - Tableau des objets annonces favorites complets.
 */
function renderFavoritesListWithData(favoriteAdsData) {
    if (!favoritesListContainer || !favoriteItemTemplate) return;
    favoritesListContainer.innerHTML = ''; // Vider la liste

    if (!favoriteAdsData || favoriteAdsData.length === 0) {
        displayNoFavorites();
        return;
    }

    if (noFavoritesPlaceholder) noFavoritesPlaceholder.classList.add('hidden');
    const ul = document.createElement('ul');
    ul.id = 'favorites-list';
    ul.className = 'item-list';

    favoriteAdsData.forEach(ad => {
        const templateClone = favoriteItemTemplate.content.cloneNode(true);
        const listItem = templateClone.querySelector('.favorite-item');
        const img = listItem.querySelector('.item-image');
        const title = listItem.querySelector('.item-title');
        const price = listItem.querySelector('.item-price');
        const category = listItem.querySelector('.item-category'); // Supposons qu'il y a un .item-category
        const removeBtn = listItem.querySelector('.remove-favorite-btn');

        listItem.dataset.adId = ad.id;
        if (img) {
            img.src = (ad.imageUrls && ad.imageUrls[0]) ? ad.imageUrls[0] : 'https://placehold.co/60x60/e0e0e0/757575?text=Ad';
            img.alt = `Image de ${sanitizeHTML(ad.title)}`;
        }
        if (title) title.textContent = sanitizeHTML(ad.title);
        if (price) price.textContent = ad.price ? formatPrice(ad.price, state.getLanguage() === 'fr' ? 'EUR' : 'USD', state.getLanguage()) : 'N/A';

        const categoryObj = state.getCategories().find(c => c.id === ad.category);
        if (category) category.textContent = categoryObj ? sanitizeHTML(categoryObj.name) : sanitizeHTML(ad.category);


        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Éviter de déclencher un clic sur l'item lui-même
                removeFavorite(ad.id, removeBtn);
            });
        }

        // Ouvrir les détails de l'annonce au clic sur l'item
        listItem.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', {
                detail: {
                    modalId: 'favorites-modal'
                }
            }));
            document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', {
                detail: {
                    adId: ad.id
                }
            }));
        });

        ul.appendChild(listItem);
    });
    favoritesListContainer.appendChild(ul);
}


/**
 * Affiche le message "aucun favori".
 */
function displayNoFavorites() {
    if (favoritesListContainer) favoritesListContainer.innerHTML = ''; // Vider la liste
    if (noFavoritesPlaceholder) noFavoritesPlaceholder.classList.remove('hidden');
}

/**
 * Efface l'affichage des favoris (utilisé lors de la déconnexion).
 */
function clearFavoritesDisplay() {
    if (favoritesListContainer) favoritesListContainer.innerHTML = '';
    if (noFavoritesPlaceholder) noFavoritesPlaceholder.classList.add('hidden'); // Cacher le placeholder aussi
    updateFavoritesBadge(0);
}


/**
 * Met à jour le badge de notification des favoris.
 * @param {number} count - Le nombre de favoris.
 */
function updateFavoritesBadge(count) {
    if (favoritesNavBadge) {
        favoritesNavBadge.textContent = count > 99 ? '99+' : count;
        favoritesNavBadge.dataset.count = count;
        favoritesNavBadge.classList.toggle('hidden', count === 0);
        favoritesNavBadge.setAttribute('aria-label', `${count} favoris`);
    }
}

/**
 * Met à jour l'état (apparence) de tous les boutons favoris sur la page.
 * @param {Array<string>} favoriteAdIds - Tableau des IDs des annonces favorites.
 */
function updateFavoriteButtonsState(favoriteAdIds) {
    document.querySelectorAll('[data-favorite-btn]').forEach(button => {
        const adId = button.dataset.adId || button.closest('[data-ad-id]')?.dataset.adId;
        if (adId) {
            const isFavorite = favoriteAdIds.includes(adId);
            button.classList.toggle('active', isFavorite); // 'active' pour le style du bouton plein
            button.setAttribute('aria-pressed', isFavorite.toString());
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = isFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            }
        }
    });
}

/**
 * Anime un bouton favori lors d'un clic.
 * @param {HTMLElement} button - Le bouton à animer.
 * @param {boolean} isAdding - True si on ajoute un favori, false si on retire.
 */
function animateFavoriteButton(button, isAdding) {
    if (button) {
        button.classList.add('favorite-animation');
        // Changer l'icône immédiatement
        const icon = button.querySelector('i');
        if (icon) {
            icon.className = isAdding ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        }
        button.setAttribute('aria-pressed', isAdding.toString());

        setTimeout(() => {
            button.classList.remove('favorite-animation');
        }, 500); // Durée de l'animation CSS
    }
}


/**
 * Initialise le module des favoris.
 */
export function init() {
    initFavoritesUI();
    // Charger les favoris initiaux si l'utilisateur est déjà connecté
    // (géré par le listener currentUserChanged)
    console.log('Module Favorites initialisé.');
}

// L'initialisation sera appelée depuis main.js
// init();
