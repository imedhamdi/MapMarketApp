// js/favorites.js

/**
 * @file favorites.js
 * @description Gestion des annonces favorites de l'utilisateur.
 * Ajout, suppression, persistance en BDD et affichage dynamique.
 * Mise à jour du badge de favoris et des états des boutons.
 * @version 1.2.0 - Corrigé et fiabilisé
 */

import * as state from './state.js';
import {
    showToast,
    secureFetch,
    toggleGlobalLoader,
    sanitizeHTML,
    formatCurrency
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

    // Gérer l'ouverture de la modale des favoris
    if (navFavoritesBtn) {
        navFavoritesBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                detail: {
                    modalId: 'favorites-modal'
                }
            }));
        });
    }

    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'favorites-modal') {
            const currentUser = state.getCurrentUser();
            if (currentUser) {
                loadUserFavorites();
            } else {
                displayNoFavorites();
                updateFavoritesBadge(0);
            }
        }
    });

    // Écouteur pour l'événement de bascule de favori
    document.addEventListener('mapMarket:toggleFavorite', handleToggleFavoriteEvent);

    // Mettre à jour les favoris lorsque l'utilisateur change
    state.subscribe('currentUserChanged', (user) => {
        if (user) {
            loadUserFavorites();
        } else {
            clearFavoritesDisplay();
            updateFavoritesState([]);
        }
    });

    // Mettre à jour le badge lorsque l'état des favoris change
    state.subscribe('favoritesChanged', (favoriteIds) => {
        updateFavoritesBadge(favoriteIds.length);
        updateFavoriteButtonsState(favoriteIds);
    });
}

/**
 * Charge les favoris de l'utilisateur connecté depuis le backend.
 * C'est ici que se trouvait l'erreur principale.
 */
async function loadUserFavorites() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        updateFavoritesState([]);
        return;
    }

    try {
        const response = await secureFetch(API_BASE_URL, {}, false);

        // **CORRECTION :** On vérifie la structure de la réponse de l'API.
        // La liste des favoris est dans `response.data.favorites`.
        if (response && response.success && Array.isArray(response.data.favorites)) {
            // CORRECTION : On filtre les favoris qui pourraient être 'null' si l'annonce
            // correspondante a été supprimée de la base de données.
            const favoriteAdsData = response.data.favorites.filter(ad => ad);
            const favoriteIds = favoriteAdsData.map(ad => ad._id);
            updateFavoritesState(favoriteIds, favoriteAdsData);
        } else {
            // Si la réponse est invalide ou vide, on initialise un état vide.
            updateFavoritesState([]);
        }
    } catch (error) {
        console.error("Erreur lors du chargement des favoris:", error);
        updateFavoritesState([]); // Vider en cas d'erreur réseau
    }
}

/**
 * Gère l'événement de bascule d'un favori (ajout/suppression).
 * @param {CustomEvent} event - L'événement contenant adId et setFavorite (boolean).
 */
async function handleToggleFavoriteEvent(event) {
    const { adId, setFavorite, sourceButton } = event.detail;
    if (!adId) return;

    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        showToast("Veuillez vous connecter pour gérer vos favoris.", "warning");
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal' } }));
        return;
    }

    const previousFavorites = state.get('favorites') || [];
    const optimisticFavorites = setFavorite
        ? [...new Set([...previousFavorites, adId])]
        : previousFavorites.filter(id => id !== adId);

    // --- Mise à jour optimiste ---
    if (sourceButton) {
        sourceButton.disabled = true;

        // 1. Mettre à jour l'UI du bouton cliqué IMMÉDIATEMENT
        sourceButton.classList.toggle('active', setFavorite);
        sourceButton.setAttribute('aria-pressed', String(setFavorite));
        const icon = sourceButton.querySelector('i');
        if (icon) {
            icon.className = setFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        }

        // 2. Appliquer l'animation de "pop"
        sourceButton.classList.add('favorite-btn-pop');
        sourceButton.querySelector('i')?.addEventListener('animationend', () => {
            sourceButton.classList.remove('favorite-btn-pop');
        }, { once: true });
    }

    // 3. Mettre à jour l'état global. Ceci déclenchera `favoritesChanged`
    // et mettra à jour TOUS les autres boutons favoris sur la page.
    state.set('favorites', optimisticFavorites);

    // --- Appel API en arrière-plan ---
    try {
        const success = setFavorite ? await addFavorite(adId) : await removeFavorite(adId);
        if (!success) {
            // Si l'API échoue, on lève une erreur pour être attrapé par le bloc catch.
            throw new Error("La mise à jour du favori a échoué côté serveur.");
        }
        // Le toast de succès est déjà dans addFavorite/removeFavorite.
    } catch (error) {
        console.error("Échec de la mise à jour du favori, restauration de l'état:", error);
        showToast("L'opération a échoué, restauration de l'état précédent.", "error");
        // Annuler la mise à jour optimiste en restaurant l'état précédent.
        // `favoritesChanged` sera à nouveau déclenché, corrigeant l'UI partout.
        state.set('favorites', previousFavorites);
    } finally {
        // Réactiver le bouton dans tous les cas.
        if (sourceButton) {
            sourceButton.disabled = false;
        }
    }
}

/**
 * Ajoute une annonce aux favoris via l'API.
 * @param {string} adId - L'ID de l'annonce à ajouter.
 * @returns {Promise<boolean>} - True si l'opération a réussi, false sinon.
 */
async function addFavorite(adId) {
    try {
        const response = await secureFetch(`${API_BASE_URL}/${adId}`, {
            method: 'POST',
            body: {} // L'ID est maintenant dans l'URL, le corps peut être vide.
        }, false);

        if (response && response.success) {
            showToast("Annonce ajoutée aux favoris !", "success");
            state.addFavorite(adId);
            // Recharger les favoris pour être sûr d'avoir les données à jour
            loadUserFavorites();
            return true;
        }
        return false;
    } catch (error) {
        console.error("Erreur d'ajout aux favoris:", error);
        return false;
    }
}

/**
 * Supprime une annonce des favoris via l'API.
 * @param {string} adId - L'ID de l'annonce à supprimer.
 * @returns {Promise<boolean>} - True si l'opération a réussi, false sinon.
 */
async function removeFavorite(adId) {
    try {
        const response = await secureFetch(`${API_BASE_URL}/${adId}`, {
            method: 'DELETE'
        }, false);

        if (response && response.success) {
            showToast("Annonce retirée des favoris.", "info");
            state.removeFavorite(adId);
            // Le changement d'état a déjà été fait de manière optimiste.
            // On peut recharger pour confirmer la synchronisation.
            loadUserFavorites();
            return true;
        }
        return false;
    } catch (error) {
        console.error("Erreur de suppression des favoris:", error);
        return false;
    }
}

/**
 * Met à jour l'état local des favoris et affiche la liste si la modale est ouverte.
 * @param {Array<string>} favoriteIds - Tableau des IDs d'annonces favorites.
 * @param {Array<Object>} [fullFavoriteAdsData=null] - Données complètes pour le rendu.
 */
function updateFavoritesState(favoriteIds, fullFavoriteAdsData = null) {
    state.set('favorites', favoriteIds);
    if (fullFavoriteAdsData && favoritesModal && favoritesModal.getAttribute('aria-hidden') === 'false') {
        renderFavoritesListWithData(fullFavoriteAdsData);
    }
}

/**
 * Affiche la liste des annonces favorites dans la modale avec les données complètes.
 * @param {Array<Object>} favoriteAdsData - Tableau des objets annonces favorites.
 */
function renderFavoritesListWithData(favoriteAdsData) {
    if (!favoritesListContainer || !favoriteItemTemplate) return;
    favoritesListContainer.innerHTML = '';

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
        const category = listItem.querySelector('.item-category');
        const removeBtn = listItem.querySelector('.remove-favorite-btn');

        // **CORRECTION :** Utiliser ad._id pour être cohérent avec la BDD.
        listItem.dataset.adId = ad._id;
        if (img) {
            img.src = (ad.imageUrls && ad.imageUrls[0]) ? ad.imageUrls[0] : 'https://placehold.co/60x60/e0e0e0/757575?text=Ad';
            img.alt = `Image de ${sanitizeHTML(ad.title)}`;
        }
        if (title) title.textContent = sanitizeHTML(ad.title);
        if (price) price.textContent = ad.price != null ? formatCurrency(ad.price, ad.currency) : 'N/A';
        const categoryObj = state.getCategories().find(c => c.id === ad.category);
        if (category) category.textContent = categoryObj ? sanitizeHTML(categoryObj.name) : sanitizeHTML(ad.category);

        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // **CORRECTION :** Utiliser ad._id ici aussi.
                handleToggleFavoriteEvent({ detail: { adId: ad._id, setFavorite: false, sourceButton: removeBtn }});
            });
        }

        listItem.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'favorites-modal' } }));
            document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', { detail: { adId: ad._id } }));
        });

        ul.appendChild(listItem);
    });
    favoritesListContainer.appendChild(ul);
}

/**
 * Affiche le message "aucun favori".
 */
function displayNoFavorites() {
    if (favoritesListContainer) favoritesListContainer.innerHTML = '';
    if (noFavoritesPlaceholder) noFavoritesPlaceholder.classList.remove('hidden');
}

/**
 * Efface l'affichage des favoris (utilisé lors de la déconnexion).
 */
function clearFavoritesDisplay() {
    displayNoFavorites();
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
            button.classList.toggle('active', isFavorite);
            button.setAttribute('aria-pressed', isFavorite.toString());
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = isFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            }
        }
    });
}

/**
 * Initialise le module des favoris.
 */
export function init() {
    initFavoritesUI();
    console.log('Module Favorites initialisé.');
}