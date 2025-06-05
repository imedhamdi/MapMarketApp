/**
 * @file ads.js
 * @description Gestion des annonces : CRUD complet, upload d'images,
 * affichage des détails, gestion des annonces de l'utilisateur et interaction avec la carte.
 * @version 1.1.0
 */

import * as state from './state.js';
import {
    showToast,
    validateForm,
    secureFetch,
    toggleGlobalLoader,
    sanitizeHTML,
    formatPrice,
    formatDate,
    generateUUID
} from './utils.js';
import {
    updateTempMarker,
    removeTempMarker,
    initMiniMap,
    geolocateUser,
    displayAdsOnMap,
    clearAdsOnMap,
    getMapInstance
} from './map.js';
// import { logout } from './auth.js'; // Importé si handleDeleteAccount est ici

const API_BASE_URL = '/api/ads';
const API_URL_CONFIG = window.location.origin; // Ou une variable de configuration plus robuste pour l'URL de base de l'API

const MAX_AD_IMAGES = 5;
const MAX_IMAGE_SIZE_MB = 2;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// --- Éléments du DOM pour le formulaire d'annonce ---
let adFormModal, adForm, adIdField, adTitleField, adDescriptionField, adCategoryField;
let adPriceField, adLocationAddressField, adLatField, adLngField, adImagesInput;
let adImagePreviewsContainer, adFormMapPreviewContainer, adFormUseCurrentLocationBtn, submitAdFormBtn;
let adFormModalTitle;
let adFormMiniMap; // Instance de la mini-carte Leaflet

// --- Éléments du DOM pour la modale de détail d'annonce ---
let adDetailModal, adDetailBodyContent, adDetailLoader, adDetailContent;
let adDetailCarouselTrack, adDetailCarouselPrevBtn, adDetailCarouselNextBtn, adDetailCarouselDotsContainer;
let adDetailItemTitle, adDetailPrice, adDetailCategory, adDetailLocation, adDetailDate;
let adDetailDescriptionText, adDetailSellerInfo, adDetailSellerAvatar, adDetailSellerName;
let adDetailActionsContainer, adDetailFavoriteBtn, adDetailContactSellerBtn, adDetailReportBtn;
let adDetailOwnerActions, adDetailEditAdBtn, adDetailDeleteAdBtn;
// let adDetailSellerRating, adDetailRatingSection, adAverageRatingDisplay, rateAdBtn, adReviewsList; // Pour les avis futurs

// --- Éléments du DOM pour la modale "Mes Annonces" ---
let myAdsModal, myAdsListContainer, myAdItemTemplate, noMyAdsPlaceholder, myAdsLoader;
let myAdsPublishNewBtn;

// --- État local du module ---
let adImageFiles = []; // Tableau pour stocker les fichiers d'images (File objects ou objets pour images existantes)
let currentEditingAdId = null; // ID de l'annonce en cours d'édition
let currentAdDetailCarouselSlide = 0;

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour la gestion des annonces.
 */
function initAdsUI() {
    // Formulaire d'annonce
    adFormModal = document.getElementById('ad-form-modal');
    adForm = document.getElementById('ad-form');
    adIdField = document.getElementById('ad-id');
    adTitleField = document.getElementById('ad-title');
    adDescriptionField = document.getElementById('ad-description');
    adCategoryField = document.getElementById('ad-category');
    adPriceField = document.getElementById('ad-price');
    adLocationAddressField = document.getElementById('ad-location-address');
    adLatField = document.getElementById('ad-lat');
    adLngField = document.getElementById('ad-lng');
    adImagesInput = document.getElementById('ad-images-input');
    adImagePreviewsContainer = document.getElementById('ad-image-previews-container');
    adFormMapPreviewContainer = document.getElementById('ad-form-map-preview'); // Le conteneur de la mini-carte
    adFormUseCurrentLocationBtn = document.getElementById('ad-form-use-current-location-btn');
    submitAdFormBtn = document.getElementById('submit-ad-form-btn');
    adFormModalTitle = document.getElementById('ad-form-modal-title');

    // Modale de détail d'annonce
    adDetailModal = document.getElementById('ad-detail-modal');
    adDetailBodyContent = document.getElementById('ad-detail-body-content'); // Peut-être pas nécessaire si on gère loader/content
    adDetailLoader = document.getElementById('ad-detail-loader');
    adDetailContent = document.getElementById('ad-detail-content');
    adDetailCarouselTrack = document.getElementById('ad-detail-carousel-track');
    adDetailCarouselPrevBtn = document.getElementById('ad-detail-carousel-prev-btn');
    adDetailCarouselNextBtn = document.getElementById('ad-detail-carousel-next-btn');
    adDetailCarouselDotsContainer = document.getElementById('ad-detail-carousel-dots');
    adDetailItemTitle = document.getElementById('ad-detail-item-title');
    adDetailPrice = document.getElementById('ad-detail-price');
    adDetailCategory = document.getElementById('ad-detail-category');
    adDetailLocation = document.getElementById('ad-detail-location');
    adDetailDate = document.getElementById('ad-detail-date');
    adDetailDescriptionText = document.getElementById('ad-detail-description-text');
    adDetailSellerInfo = document.getElementById('ad-detail-seller-info');
    adDetailSellerAvatar = document.getElementById('ad-detail-seller-avatar');
    adDetailSellerName = document.getElementById('ad-detail-seller-name');
    // adDetailSellerRating = document.getElementById('ad-detail-seller-rating'); // Pour les avis futurs
    adDetailActionsContainer = document.getElementById('ad-detail-actions-container');
    adDetailFavoriteBtn = document.getElementById('ad-detail-favorite-btn');
    adDetailContactSellerBtn = document.getElementById('ad-detail-contact-seller-btn');
    adDetailReportBtn = document.getElementById('ad-detail-report-btn');
    adDetailOwnerActions = document.getElementById('ad-detail-owner-actions');
    adDetailEditAdBtn = document.getElementById('ad-detail-edit-ad-btn');
    adDetailDeleteAdBtn = document.getElementById('ad-detail-delete-ad-btn');
    // adDetailRatingSection = document.getElementById('ad-detail-rating-section'); // Pour les avis futurs
    // adAverageRatingDisplay = document.getElementById('ad-average-rating-display'); // Pour les avis futurs
    // rateAdBtn = document.getElementById('rate-ad-btn'); // Pour les avis futurs
    // adReviewsList = document.getElementById('ad-reviews-list'); // Pour les avis futurs

    // Modale "Mes Annonces"
    myAdsModal = document.getElementById('my-ads-modal');
    myAdsListContainer = document.getElementById('my-ads-list-container');
    myAdItemTemplate = document.getElementById('my-ad-item-template');
    noMyAdsPlaceholder = document.getElementById('no-my-ads-placeholder');
    myAdsLoader = document.getElementById('my-ads-loader');
    myAdsPublishNewBtn = document.getElementById('my-ads-publish-new-btn');

    // --- Écouteurs d'événements ---
    if (adForm) {
        adForm.addEventListener('submit', handleSubmitAd);
        if (adImagePreviewsContainer && adImagesInput) {
            setupImageDragAndDrop();
        }
    }
    if (adImagesInput) {
        adImagesInput.addEventListener('change', handleImageSelection);
    }
    if (adFormUseCurrentLocationBtn) {
        adFormUseCurrentLocationBtn.addEventListener('click', fillLocationWithCurrentUserPosition);
    }

    const navPublishBtn = document.getElementById('nav-publish-ad-btn');
    if (navPublishBtn) {
        navPublishBtn.addEventListener('click', () => {
            const currentUser = state.getCurrentUser();
            if (!currentUser) {
                showToast("Veuillez vous connecter pour publier une annonce.", "warning");
                document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal', view: 'login' } }));
                return;
            }
            prepareAdFormForCreate();
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'ad-form-modal' } }));
        });
    }

    // Événement pour afficher les détails d'une annonce (déclenché par map.js ou autres listes)
    document.addEventListener('mapMarket:viewAdDetails', (event) => {
        const { adId } = event.detail;
        if (adId) {
            loadAndDisplayAdDetails(adId);
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'ad-detail-modal' } }));
        }
    });

    if (adDetailEditAdBtn) adDetailEditAdBtn.addEventListener('click', handleEditAdFromDetail);
    if (adDetailDeleteAdBtn) adDetailDeleteAdBtn.addEventListener('click', handleDeleteAdFromDetail);
    if (adDetailFavoriteBtn) adDetailFavoriteBtn.addEventListener('click', handleToggleFavoriteFromDetail);
    if (adDetailContactSellerBtn) adDetailContactSellerBtn.addEventListener('click', handleContactSellerFromDetail);
    // if (rateAdBtn) rateAdBtn.addEventListener('click', handleRateAdFromDetail); // Pour les avis futurs

    // Événement déclenché par la mini-carte dans le formulaire d'annonce
    document.addEventListener('mapMarket:adFormMarkerPlaced', (event) => {
        const { latlng } = event.detail;
        if (adLatField && adLngField) {
            adLatField.value = latlng.lat.toFixed(6);
            adLngField.value = latlng.lng.toFixed(6);
        }
        if (adLocationAddressField) {
            // Idéalement, faire un reverse geocoding ici pour obtenir une adresse
            // Pour l'instant, on met les coordonnées.
            adLocationAddressField.value = `Coordonnées: ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
            showToast("Localisation sélectionnée. Vérifiez/complétez l'adresse.", "info", 4000);
            // Valider le champ pour enlever une éventuelle erreur précédente
            const fieldError = document.getElementById('ad-location-address-error');
            if (fieldError) { fieldError.textContent = ''; fieldError.style.display = 'none'; }
            if (adLocationAddressField) adLocationAddressField.removeAttribute('aria-invalid');
        }
    });

    // Gestion de la fermeture des modales
    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'ad-form-modal' && adFormMapPreviewContainer) {
            // Initialiser la mini-carte lorsque la modale du formulaire s'ouvre
            const initialLat = adLatField && adLatField.value ? parseFloat(adLatField.value) : null;
            const initialLng = adLngField && adLngField.value ? parseFloat(adLngField.value) : null;
            let initialCoords = null;
            if (initialLat != null && initialLng != null && !isNaN(initialLat) && !isNaN(initialLng)) {
                initialCoords = { lat: initialLat, lng: initialLng };
            }
            if (typeof initMiniMap === 'function') {
                adFormMiniMap = initMiniMap('ad-form-map-preview', (latlng) => {
                    document.dispatchEvent(new CustomEvent('mapMarket:adFormMarkerPlaced', { detail: { latlng } }));
                }, initialCoords);
            }
        }
    });

    document.addEventListener('mapMarket:modalClosed', (event) => {
        if (event.detail.modalId === 'ad-form-modal') {
            resetAdForm();
            if (adFormMiniMap && typeof adFormMiniMap.remove === 'function') {
                adFormMiniMap.remove(); // Détruire l'instance de la carte
                adFormMiniMap = null;
            }
        }
        if (event.detail.modalId === 'ad-detail-modal') {
            // Nettoyer le contenu de la modale de détail
            if (adDetailContent) adDetailContent.classList.add('hidden');
            if (adDetailLoader) adDetailLoader.classList.remove('hidden'); // Afficher le loader pour le prochain chargement
            if (adDetailModal) adDetailModal.dataset.adId = '';
            if (adDetailCarouselTrack) adDetailCarouselTrack.innerHTML = '';
            if (adDetailCarouselDotsContainer) adDetailCarouselDotsContainer.innerHTML = '';
            currentAdDetailCarouselSlide = 0;
        }
    });

    // Écouteur pour l'ouverture de la modale "Mes Annonces"
    document.addEventListener('mapMarket:openMyAds', () => {
        fetchAndRenderUserAds();
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'my-ads-modal' } }));
    });

    if (myAdsPublishNewBtn) {
        myAdsPublishNewBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'my-ads-modal' } }));
            prepareAdFormForCreate();
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'ad-form-modal' } }));
        });
    }

    // Initialiser les catégories dans les formulaires
    populateAdFormCategories();
    state.subscribe('categoriesChanged', populateAdFormCategories);
}

/**
 * Prépare le formulaire d'annonce pour la création.
 */
export function prepareAdFormForCreate() {
    currentEditingAdId = null;
    if (adForm) adForm.reset();
    if (adIdField) adIdField.value = '';
    adImageFiles = []; // Réinitialiser les fichiers d'images
    if (adImagePreviewsContainer) adImagePreviewsContainer.innerHTML = ''; // Vider les prévisualisations
    if (submitAdFormBtn) {
        submitAdFormBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span data-i18n="adForm.publishButton">Publier l\'annonce</span>';
        submitAdFormBtn.setAttribute('aria-label', 'Publier l\'annonce');
    }
    if (adFormModalTitle) {
        adFormModalTitle.innerHTML = '<i class="fa-solid fa-plus-circle"></i> <span data-i18n="adForm.createTitle">Publier une Annonce</span>';
    }
    // Informer map.js de préparer le marqueur pour une nouvelle annonce
    if (typeof removeTempMarker === 'function') removeTempMarker('ad');
    state.set('ui.map.isPlacingAdMarker', true);
    state.set('ui.map.isPlacingAlertMarker', false);

    // Réinitialiser la mini-carte si elle existe
    if (adFormMiniMap && typeof adFormMiniMap.setView === 'function' && typeof adFormMiniMap.removeLayer === 'function') {
        const defaultCenter = state.getMapState()?.initialCenter || [48.8566, 2.3522];
        const defaultZoom = state.getMapState()?.initialZoom || 12;
        adFormMiniMap.setView(defaultCenter, defaultZoom);
        // Supprimer un éventuel marqueur existant sur la mini-carte
        adFormMiniMap.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                adFormMiniMap.removeLayer(layer);
            }
        });
    }
    if (adLatField) adLatField.value = '';
    if (adLngField) adLngField.value = '';
    if (adLocationAddressField) adLocationAddressField.value = '';

    showToast("Cliquez sur la mini-carte pour localiser votre annonce ou utilisez votre position actuelle.", "info", 6000);
}

/**
 * Prépare le formulaire d'annonce pour l'édition avec les données d'une annonce existante.
 * @param {object} ad - L'objet annonce à éditer.
 */
async function prepareAdFormForEdit(ad) {
    if (!adForm || !ad) {
        showToast("Impossible de charger les données de l'annonce pour l'édition.", "error");
        return;
    }
    currentEditingAdId = ad._id; // Utiliser _id qui vient du backend
    if (adIdField) adIdField.value = ad._id;
    if (adTitleField) adTitleField.value = ad.title || '';
    if (adDescriptionField) adDescriptionField.value = ad.description || '';
    if (adCategoryField) adCategoryField.value = ad.category; // Supposant que ad.category est l'ID
    if (adPriceField) adPriceField.value = ad.price != null ? ad.price : '';
    if (adLocationAddressField) adLocationAddressField.value = ad.location?.address || '';
    if (adLatField) adLatField.value = ad.location?.coordinates[1] || ''; // Latitude
    if (adLngField) adLngField.value = ad.location?.coordinates[0] || ''; // Longitude

    if (submitAdFormBtn) {
        submitAdFormBtn.innerHTML = '<i class="fa-solid fa-save"></i> <span data-i18n="adForm.updateButton">Mettre à jour l\'annonce</span>';
        submitAdFormBtn.setAttribute('aria-label', 'Mettre à jour l\'annonce');
    }
    if (adFormModalTitle) {
        adFormModalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> <span data-i18n="adForm.editTitle">Modifier l\'Annonce</span>';
    }

    adImageFiles = [];
    if (adImagePreviewsContainer) adImagePreviewsContainer.innerHTML = '';
    if (ad.imageUrls && ad.imageUrls.length > 0) {
        const clientApiBase = API_URL_CONFIG; // Ex: 'http://localhost:5001'
        ad.imageUrls.forEach(fullUrl => {
            let relativePath = '';
            const uploadsPrefix = `${clientApiBase}/uploads/`;
            if (fullUrl.startsWith(uploadsPrefix)) {
                relativePath = fullUrl.substring(uploadsPrefix.length);
            } else {
                console.warn('Impossible de déterminer le chemin relatif pour l\'image existante (édition) :', fullUrl);
            }
            const pseudoFile = {
                name: fullUrl.substring(fullUrl.lastIndexOf('/') + 1),
                isExisting: true,
                url: fullUrl, // URL complète pour l'affichage
                relativePath: relativePath, // Chemin relatif pour la soumission (si nécessaire pour la suppression)
                id: generateUUID()
            };
            adImageFiles.push(pseudoFile);
            createImagePreview(pseudoFile);
        });
    }

    state.set('ui.map.isPlacingAdMarker', true);
    state.set('ui.map.isPlacingAlertMarker', false);

    // Mettre à jour la mini-carte avec la position de l'annonce
    if (ad.location?.coordinates && adFormMiniMap && typeof adFormMiniMap.setView === 'function') {
        const lat = ad.location.coordinates[1];
        const lng = ad.location.coordinates[0];
        adFormMiniMap.setView([lat, lng], 15); // Zoomer sur la position
        // Ajouter ou déplacer le marqueur sur la mini-carte
        adFormMiniMap.eachLayer(layer => { if (layer instanceof L.Marker) adFormMiniMap.removeLayer(layer); });
        L.marker([lat, lng], { draggable: true })
            .on('dragend', function (e) {
                const latlng = e.target.getLatLng();
                document.dispatchEvent(new CustomEvent('mapMarket:adFormMarkerPlaced', { detail: { latlng } }));
            })
            .addTo(adFormMiniMap);
    }

    document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'ad-form-modal' } }));
}

/**
 * Réinitialise le formulaire d'annonce.
 */
function resetAdForm() {
    if (adForm) {
        adForm.reset();
        adForm.querySelectorAll('.form-error-message').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
        adForm.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    }
    if (adIdField) adIdField.value = '';
    currentEditingAdId = null;
    adImageFiles = [];
    if (adImagePreviewsContainer) adImagePreviewsContainer.innerHTML = '';
    if (adImagesInput) adImagesInput.value = ''; // Important pour permettre la re-sélection du même fichier
    if (typeof removeTempMarker === 'function') removeTempMarker('ad'); // Préciser le type de marqueur si la fonction le gère
    state.set('ui.map.isPlacingAdMarker', false);
    if (adLatField) adLatField.value = '';
    if (adLngField) adLngField.value = '';
    if (adLocationAddressField) adLocationAddressField.value = '';
}

/**
 * Peuple la liste déroulante des catégories dans le formulaire d'annonce.
 */
function populateAdFormCategories() {
    const categories = state.getCategories(); // Supposant que state.js a une fonction getCategories()
    if (adCategoryField && categories && categories.length > 0) {
        const currentValue = adCategoryField.value; // Sauver la valeur actuelle si elle existe
        const firstOption = adCategoryField.querySelector('option[value=""]'); // Garder l'option "Choisir..."
        adCategoryField.innerHTML = ''; // Vider les options existantes
        if (firstOption) adCategoryField.appendChild(firstOption);

        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id; // Utiliser l'ID de la catégorie
            option.textContent = cat.name;
            if (cat.icon) option.dataset.icon = cat.icon; // Stocker l'icône si disponible
            adCategoryField.appendChild(option);
        });
        adCategoryField.value = currentValue; // Restaurer la valeur si possible
    } else if (adCategoryField) {
        // Cas où les catégories ne sont pas encore chargées ou vides
        adCategoryField.innerHTML = '<option value="" disabled selected>Chargement des catégories...</option>';
    }
}

/**
 * Remplit les champs de localisation avec la position actuelle de l'utilisateur.
 */
async function fillLocationWithCurrentUserPosition() {
    toggleGlobalLoader(true, "Obtention de votre position...");
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });
        toggleGlobalLoader(false);
        const latlng = { lat: position.coords.latitude, lng: position.coords.longitude };

        if (adLatField) adLatField.value = latlng.lat.toFixed(6);
        if (adLngField) adLngField.value = latlng.lng.toFixed(6);

        if (adFormMiniMap && typeof adFormMiniMap.setView === 'function') {
            adFormMiniMap.setView([latlng.lat, latlng.lng], 16); // Zoom plus précis
            adFormMiniMap.eachLayer(layer => { if (layer instanceof L.Marker) adFormMiniMap.removeLayer(layer); });
            L.marker([latlng.lat, latlng.lng], { draggable: true })
                .on('dragend', function (e) {
                    const newLatlng = e.target.getLatLng();
                    document.dispatchEvent(new CustomEvent('mapMarket:adFormMarkerPlaced', { detail: { latlng: newLatlng } }));
                })
                .addTo(adFormMiniMap);
        }
        // Tenter un reverse geocoding pour l'adresse (simplifié ici)
        if (adLocationAddressField) {
            adLocationAddressField.value = `Position actuelle (Lat: ${latlng.lat.toFixed(4)}, Lng: ${latlng.lng.toFixed(4)})`;
            // Idéalement, appeler une API de reverse geocoding ici.
        }
        showToast("Position actuelle utilisée. Vérifiez et complétez l'adresse si besoin.", "info");

    } catch (error) {
        toggleGlobalLoader(false);
        console.warn("Erreur de géolocalisation:", error);
        let message = "Impossible d'obtenir votre position actuelle. ";
        if (error.code === 1) message += "Permission refusée.";
        else if (error.code === 2) message += "Position indisponible.";
        else if (error.code === 3) message += "Timeout.";
        showToast(message + " Veuillez la sélectionner sur la carte ou la saisir manuellement.", "warning");
    }
}

/**
 * Configure le glisser-déposer pour les images.
 */
function setupImageDragAndDrop() {
    if (!adImagePreviewsContainer || !adImagesInput) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        adImagePreviewsContainer.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        adImagePreviewsContainer.addEventListener(eventName, () => {
            adImagePreviewsContainer.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        adImagePreviewsContainer.addEventListener(eventName, () => {
            adImagePreviewsContainer.classList.remove('dragover');
        }, false);
    });

    adImagePreviewsContainer.addEventListener('drop', (event) => {
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            addFilesToAd(Array.from(files));
        }
    });

    // Permettre de cliquer sur la zone pour ouvrir le sélecteur de fichiers
    adImagePreviewsContainer.addEventListener('click', (event) => {
        // S'assurer que le clic n'est pas sur un bouton de suppression d'image
        if (event.target.closest('.remove-preview-btn')) {
            return;
        }
        if (adImageFiles.length < MAX_AD_IMAGES) {
            adImagesInput.click();
        } else {
            showToast(`Vous avez déjà atteint le maximum de ${MAX_AD_IMAGES} images.`, "info");
        }
    });
    adImagePreviewsContainer.setAttribute('role', 'button');
    adImagePreviewsContainer.setAttribute('tabindex', '0');
    adImagePreviewsContainer.setAttribute('aria-label', 'Zone de dépôt d\'images, cliquez ou déposez des fichiers');
    adImagePreviewsContainer.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && adImageFiles.length < MAX_AD_IMAGES) {
            e.preventDefault();
            adImagesInput.click();
        }
    });
}

/**
 * Gère la sélection de fichiers via l'input.
 * @param {Event} event - L'événement de changement de l'input.
 */
function handleImageSelection(event) {
    const files = Array.from(event.target.files);
    addFilesToAd(files);
    if (adImagesInput) adImagesInput.value = ''; // Réinitialiser pour permettre la re-sélection du même fichier
}

/**
 * Ajoute les fichiers sélectionnés à la liste et génère les prévisualisations.
 * @param {File[]} files - Tableau de fichiers à ajouter.
 */
function addFilesToAd(files) {
    const currentFileCount = adImageFiles.length;
    let addedCount = 0;

    const newFiles = files.filter(file => {
        if (currentFileCount + addedCount >= MAX_AD_IMAGES) {
            if (addedCount === 0 && currentFileCount >= MAX_AD_IMAGES) { // Message seulement si on essaie d'ajouter alors que c'est déjà plein
                showToast(`Vous avez déjà atteint le maximum de ${MAX_AD_IMAGES} images.`, 'warning');
            }
            return false;
        }
        if (!VALID_IMAGE_TYPES.includes(file.type)) {
            showToast(`Format invalide pour ${sanitizeHTML(file.name)}. Acceptés: JPEG, PNG, WebP, GIF.`, 'error');
            return false;
        }
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            showToast(`Fichier trop volumineux: ${sanitizeHTML(file.name)} (max ${MAX_IMAGE_SIZE_MB}MB).`, 'error');
            return false;
        }
        // Éviter les doublons exacts de fichiers non encore uploadés
        if (adImageFiles.some(f => !f.isExisting && f.name === file.name && f.size === file.size && f.type === file.type)) {
            return false; // Déjà dans la liste d'attente
        }
        addedCount++;
        return true;
    });

    if (currentFileCount + newFiles.length > MAX_AD_IMAGES && newFiles.length > 0) {
        showToast(`Vous ne pouvez ajouter que ${MAX_AD_IMAGES - currentFileCount} image(s) de plus. ${newFiles.length - (MAX_AD_IMAGES - currentFileCount)} image(s) n'ont pas été ajoutée(s).`, 'warning', 5000);
    }

    newFiles.slice(0, MAX_AD_IMAGES - currentFileCount).forEach(file => {
        const fileWithId = Object.assign(file, {
            id: generateUUID(),
            isExisting: false, // Marquer comme nouveau fichier
            url: URL.createObjectURL(file) // URL locale pour la prévisualisation
        });
        adImageFiles.push(fileWithId);
        createImagePreview(fileWithId);
    });
}

/**
 * Crée et affiche une prévisualisation d'image.
 * @param {object} fileOrObject - Objet fichier ou objet représentant une image existante.
 * Doit avoir `id`, `name`, et `url` (pour `isExisting:true` ou URL.createObjectURL pour `isExisting:false`).
 */
function createImagePreview(fileOrObject) {
    if (!adImagePreviewsContainer) return;

    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'image-preview-item';
    previewWrapper.dataset.fileId = fileOrObject.id;
    previewWrapper.setAttribute('role', 'listitem');

    const img = document.createElement('img');
    img.alt = `Prévisualisation de ${sanitizeHTML(fileOrObject.name)}`;
    img.classList.add('preview-image');
    img.src = fileOrObject.url; // URL.createObjectURL() pour les nouveaux, URL complète pour les existants

    previewWrapper.appendChild(img);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-icon btn-danger btn-sm remove-preview-btn';
    removeBtn.innerHTML = '<i class="fa-solid fa-times" aria-hidden="true"></i>';
    removeBtn.setAttribute('aria-label', `Supprimer l'image ${sanitizeHTML(fileOrObject.name)}`);
    removeBtn.onclick = () => {
        adImageFiles = adImageFiles.filter(f => f.id !== fileOrObject.id);
        previewWrapper.remove();
        // Si c'était un File object, révoquer l'URL objet pour libérer la mémoire
        if (!fileOrObject.isExisting && fileOrObject.url.startsWith('blob:')) {
            URL.revokeObjectURL(fileOrObject.url);
        }
        // Mettre à jour l'accessibilité du conteneur si on peut de nouveau ajouter des images
        if (adImagePreviewsContainer && adImageFiles.length < MAX_AD_IMAGES) {
            adImagePreviewsContainer.setAttribute('aria-label', 'Zone de dépôt d\'images, cliquez ou déposez des fichiers');
        }
    };
    previewWrapper.appendChild(removeBtn);
    adImagePreviewsContainer.appendChild(previewWrapper);
}

/**
 * Règles de validation pour le formulaire d'annonce.
 */
const adFormValidationRules = {
    'ad-title': [
        { type: 'required', message: 'Le titre est requis.' },
        { type: 'minLength', value: 5, message: 'Le titre doit comporter au moins 5 caractères.' },
        { type: 'maxLength', value: 100, message: 'Le titre ne doit pas dépasser 100 caractères.' }
    ],
    'ad-description': [
        { type: 'required', message: 'La description est requise.' },
        { type: 'minLength', value: 10, message: 'La description doit comporter au moins 10 caractères.' },
        { type: 'maxLength', value: 1000, message: 'La description ne doit pas dépasser 1000 caractères.' } // Cohérent avec le HTML
    ],
    'ad-category': [
        { type: 'required', message: 'Veuillez sélectionner une catégorie.' }
    ],
    'ad-price': [
        { type: 'required', message: 'Le prix est requis.' },
        { type: 'numberRange', value: { min: 0, max: 10000000 }, message: 'Le prix doit être un nombre positif (max 10,000,000).' } // Ajout d'un max raisonnable
    ],
    'ad-location-address': [ // Valider l'adresse, les coordonnées sont vérifiées séparément
        { type: 'required', message: 'L\'adresse ou une localisation sur la carte est requise.' }
    ],
    // Les champs lat/lng ne sont pas directement validés ici car remplis par la carte ou géoloc.
};

/**
 * Gère la soumission du formulaire de création ou de mise à jour d'annonce.
 * @param {Event} event - L'événement de soumission.
 */
// js/ads.js - dans handleSubmitAd

// Assurez-vous que ces variables sont définies dans la portée de ads.js
// et initialisées dans initAdsUI() :
// adForm, validateForm, adFormValidationRules, showToast, adLatField, adLngField,
// adLocationAddressField, adTitleField, adDescriptionField, adCategoryField,
// adPriceField, API_BASE_URL, currentEditingAdId, adImageFiles,
// toggleGlobalLoader, secureFetch, resetAdForm, fetchAllAdsAndRenderOnMap,
// fetchAndRenderUserAds, state (pour state.refreshAds)

async function handleSubmitAd(event) {
    event.preventDefault();
    console.log("Frontend: Début de handleSubmitAd");

    // 1. Validation initiale du formulaire (structurelle)
    if (!adForm || !validateForm(adForm, adFormValidationRules)) {
        showToast('Veuillez corriger les erreurs indiquées dans le formulaire.', 'error');
        // validateForm (de utils.js) devrait déjà afficher les erreurs spécifiques aux champs.
        // On met le focus sur le premier champ invalide pour l'accessibilité.
        const firstInvalidField = adForm.querySelector('[aria-invalid="true"]');
        if (firstInvalidField) {
            firstInvalidField.focus();
        }
        return;
    }
    console.log("Frontend: Validation de base du formulaire (via utils.js) réussie.");

    // 2. Récupération et validation sémantique des valeurs critiques
    const title = adTitleField.value.trim();
    const description = adDescriptionField.value.trim();
    const category = adCategoryField.value; // Valeur du select
    const priceRaw = adPriceField.value.trim();
    const locationAddress = adLocationAddressField.value.trim();
    const latRaw = adLatField.value.trim();
    const lngRaw = adLngField.value.trim();

    // Validation spécifique pour la catégorie
    if (!category || category === "" || category === "undefined") {
        showToast('Veuillez sélectionner une catégorie valide.', 'error');
        // Afficher l'erreur sur le champ catégorie
        const catErrorEl = document.getElementById('ad-category-error'); // Assurez-vous que cet élément existe
        if (catErrorEl) {
            catErrorEl.textContent = 'Sélection de catégorie requise.';
            catErrorEl.style.display = 'block';
        }
        if (adCategoryField) {
            adCategoryField.setAttribute('aria-invalid', 'true');
            adCategoryField.focus();
        }
        return;
    } else {
        const catErrorEl = document.getElementById('ad-category-error');
        if (catErrorEl) {
            catErrorEl.textContent = '';
            catErrorEl.style.display = 'none';
        }
        if (adCategoryField) adCategoryField.removeAttribute('aria-invalid');
    }
    console.log("Frontend: Catégorie validée:", category);

    // Validation spécifique pour le prix
    const priceParsed = parseFloat(priceRaw);
    if (priceRaw === '' || isNaN(priceParsed) || priceParsed < 0) {
        showToast('Le prix doit être un nombre positif ou nul.', 'error');
        const priceErrorEl = document.getElementById('ad-price-error'); // Assurez-vous que cet élément existe
        if (priceErrorEl) {
            priceErrorEl.textContent = 'Prix invalide ou manquant.';
            priceErrorEl.style.display = 'block';
        }
        if (adPriceField) {
            adPriceField.setAttribute('aria-invalid', 'true');
            adPriceField.focus();
        }
        return;
    } else {
        const priceErrorEl = document.getElementById('ad-price-error');
        if (priceErrorEl) {
            priceErrorEl.textContent = '';
            priceErrorEl.style.display = 'none';
        }
        if (adPriceField) adPriceField.removeAttribute('aria-invalid');
    }
    console.log("Frontend: Prix validé:", priceParsed);

    // Validation spécifique pour latitude et longitude
    const latParsed = parseFloat(latRaw);
    const lngParsed = parseFloat(lngRaw);

    if (latRaw === '' || lngRaw === '' || isNaN(latParsed) || isNaN(lngParsed) || latParsed < -90 || latParsed > 90 || lngParsed < -180 || lngParsed > 180) {
        showToast('Localisation invalide. Veuillez sélectionner un point sur la carte. Latitude et longitude doivent être des nombres valides dans leurs plages respectives.', 'error', 5000);
        const locErrorEl = document.getElementById('ad-location-address-error'); // Assurez-vous que cet élément existe
        if (locErrorEl) {
            locErrorEl.textContent = 'Coordonnées géographiques invalides ou manquantes.';
            locErrorEl.style.display = 'block';
        }
        // Idéalement, un champ spécifique pour les erreurs de lat/lng ou focus sur la mini-carte.
        // On met l'erreur sur le champ d'adresse comme fallback.
        if (adLocationAddressField) {
            adLocationAddressField.setAttribute('aria-invalid', 'true');
            // Pas de focus ici car l'utilisateur doit interagir avec la carte.
        }
        return;
    } else {
        const locErrorEl = document.getElementById('ad-location-address-error');
        if (locErrorEl) {
            locErrorEl.textContent = '';
            locErrorEl.style.display = 'none';
        }
        if (adLocationAddressField) adLocationAddressField.removeAttribute('aria-invalid');
    }
    console.log("Frontend: Latitude et longitude validées:", { latRaw, lngRaw, latParsed, lngParsed });

    // 3. Construction de FormData
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('category', category);
    formData.append('price', priceRaw); // Envoyer la chaîne validée, le backend fera parseFloat
    formData.append('locationAddress', locationAddress);
    formData.append('latitude', latRaw);   // Envoyer la chaîne validée
    formData.append('longitude', lngRaw);  // Envoyer la chaîne validée

    // Gestion des images (existantes et nouvelles)
    const newImageFilesToUpload = adImageFiles.filter(f => !f.isExisting && f instanceof File);
    newImageFilesToUpload.forEach(file => {
        formData.append('images', file, file.name);
    });
    console.log(`Frontend: ${newImageFilesToUpload.length} nouvelles images ajoutées à FormData.`);

    let url = API_BASE_URL;
    let method = 'POST';
    let loadingMessage = "Publication de l'annonce...";

    if (currentEditingAdId) {
        url = `${API_BASE_URL}/${currentEditingAdId}`;
        method = 'PUT';
        loadingMessage = "Mise à jour de l'annonce...";
        const existingImageRelativePathsToKeep = adImageFiles
            .filter(f => f.isExisting && f.relativePath)
            .map(f => f.relativePath);
        formData.append('existingImageUrls', JSON.stringify(existingImageRelativePathsToKeep));
        console.log("Frontend: Mode édition. existingImageUrls:", existingImageRelativePathsToKeep);
    }

    // Log final des données envoyées (avant l'envoi réel)
    console.log(`Frontend: Préparation de la requête ${method} vers ${url}. Données dans FormData:`);
    for (let pair of formData.entries()) {
        // Pour les fichiers, pair[1] est un objet File, donc on affiche son nom.
        const valueDisplay = (pair[1] instanceof File) ? `File: ${pair[1].name}` : pair[1];
        console.log(`  ${pair[0]}: ${valueDisplay}`);
    }

    // 4. Envoi de la requête
    toggleGlobalLoader(true, loadingMessage);
    try {
        const response = await secureFetch(url, { method: method, body: formData }, false); // false pour gérer le loader manuellement à la fin
        toggleGlobalLoader(false);

        if (response && response.success && response.data && response.data.ad) {
            showToast(response.message || (currentEditingAdId ? "Annonce mise à jour avec succès !" : "Annonce publiée avec succès !"), "success");
            resetAdForm();
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'ad-form-modal' } }));

            // Rafraîchir les données d'annonces
            if (typeof state.refreshAds === 'function') {
                state.refreshAds();
            } else {
                fetchAllAdsAndRenderOnMap(); // Pour la carte principale
                if (myAdsModal && myAdsModal.classList.contains('active')) { // Ou une autre manière de vérifier si la modale "Mes Annonces" est visible
                  if (typeof fetchAndRenderUserAds === 'function') fetchAndRenderUserAds();
                }
            }
            console.log("Frontend: Annonce soumise avec succès. Réponse:", response.data.ad);
        } else {
            // Le backend devrait renvoyer response.success = false et un message.
            const errorMessage = response && response.message ? response.message : (currentEditingAdId ? "Erreur lors de la mise à jour de l'annonce." : "Erreur lors de la publication de l'annonce.");
            showToast(errorMessage, "error", 5000);
            console.error("Frontend: Échec de la soumission de l'annonce. Réponse du serveur:", response);
        }
    } catch (error) {
        toggleGlobalLoader(false);
        // secureFetch devrait déjà avoir montré un toast générique.
        // Ici, on loggue l'erreur détaillée et on peut afficher un message plus spécifique si besoin.
        let errorDetailForConsole = 'Pas de détails supplémentaires.';
        if (error.data && typeof error.data === 'object') { // error.data est ce que secureFetch attache
            errorDetailForConsole = JSON.stringify(error.data);
        } else if (error.response && typeof error.response.text === 'function') { // Fallback si error.data n'est pas là
            try {
                errorDetailForConsole = await error.response.text();
            } catch (e) { /* ignore */}
        }
        console.error(`Frontend: Erreur ${method} ${url}:`, error.message, "Détails:", errorDetailForConsole, error.stack);
        // Le toast est déjà géré par secureFetch, mais on pourrait en ajouter un plus spécifique ici si error.message est trop générique.
        // showToast(`Échec de l'opération: ${error.message}`, 'error', 5000);
    }
}


/**
 * Charge et affiche les détails d'une annonce dans la modale.
 * @param {string} adId - L'ID de l'annonce à charger.
 */
async function loadAndDisplayAdDetails(adId) {
    if (!adDetailModal || !adId) return;

    if (adDetailLoader) adDetailLoader.classList.remove('hidden');
    if (adDetailContent) adDetailContent.classList.add('hidden');
    adDetailModal.dataset.adId = adId; // Stocker l'ID pour les actions futures

    try {
        const response = await secureFetch(`${API_BASE_URL}/${adId}`, {}, false); // Le troisième argument false pour gérer le loader manuellement

        if (response && response.success && response.data && response.data.ad) {
            const ad = response.data.ad;
            if (adDetailItemTitle) adDetailItemTitle.textContent = sanitizeHTML(ad.title);
            if (adDetailPrice) adDetailPrice.textContent = ad.price != null ? formatPrice(ad.price) : 'Prix non spécifié';

            const categories = state.getCategories();
            const categoryObj = categories ? categories.find(c => c._id === ad.category) : null; // Comparer avec _id
            if (adDetailCategory) {
                const iconEl = adDetailCategory.querySelector('i.fa-solid');
                if (iconEl && categoryObj && categoryObj.icon) iconEl.className = `fa-solid ${categoryObj.icon}`;
                else if (iconEl) iconEl.className = 'fa-solid fa-tag'; // Icône par défaut
                // Le texte est après l'icône
                const textNode = Array.from(adDetailCategory.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
                if (textNode) textNode.textContent = ` ${sanitizeHTML(categoryObj ? categoryObj.name : ad.category)}`;
                else adDetailCategory.insertAdjacentText('beforeend', ` ${sanitizeHTML(categoryObj ? categoryObj.name : ad.category)}`);
            }

            if (adDetailLocation) adDetailLocation.innerHTML = `<i class="fa-solid fa-map-marker-alt"></i> ${sanitizeHTML(ad.location?.address || 'Localisation non spécifiée')}`;
            if (adDetailDate) adDetailDate.innerHTML = `<i class="fa-solid fa-calendar-days"></i> Publiée ${formatDate(ad.createdAt || new Date())}`;
            if (adDetailDescriptionText) adDetailDescriptionText.innerHTML = sanitizeHTML(ad.description || '').replace(/\n/g, '<br>');

            setupAdDetailCarousel(ad.imageUrls || []);

            if (ad.userId) { // userId est populé par le backend
                if (adDetailSellerAvatar) {
                    adDetailSellerAvatar.src = ad.userId.avatarUrl && !ad.userId.avatarUrl.endsWith('avatar-default.svg') ? ad.userId.avatarUrl : 'avatar-default.svg';
                    adDetailSellerAvatar.alt = `Avatar de ${sanitizeHTML(ad.userId.name)}`;
                }
                if (adDetailSellerName) adDetailSellerName.textContent = sanitizeHTML(ad.userId.name);
                if (adDetailSellerInfo) adDetailSellerInfo.dataset.sellerId = ad.userId._id;
                // if (adDetailSellerRating) { /* Logique pour afficher la note du vendeur */ }
            } else {
                if (adDetailSellerInfo) adDetailSellerInfo.classList.add('hidden');
            }

            const currentUser = state.getCurrentUser();
            if (adDetailFavoriteBtn) {
                const userFavorites = state.getFavorites ? state.getFavorites() : [];
                const isFavorite = userFavorites.some(favAd => favAd === ad._id || favAd._id === ad._id);
                adDetailFavoriteBtn.classList.toggle('active', isFavorite);
                adDetailFavoriteBtn.setAttribute('aria-pressed', isFavorite.toString());
                adDetailFavoriteBtn.querySelector('i').className = isFavorite ? 'fa-solid fa-heart text-danger' : 'fa-regular fa-heart';
                adDetailFavoriteBtn.dataset.adId = ad._id; // S'assurer que l'ID est là pour le handler
            }

            if (adDetailOwnerActions && currentUser && ad.userId && ad.userId._id === currentUser._id) {
                adDetailOwnerActions.classList.remove('hidden');
            } else if (adDetailOwnerActions) {
                adDetailOwnerActions.classList.add('hidden');
            }
            // Cacher le bouton "Contacter" si c'est l'annonce de l'utilisateur
            if (adDetailContactSellerBtn && currentUser && ad.userId && ad.userId._id === currentUser._id) {
                adDetailContactSellerBtn.classList.add('hidden');
            } else if (adDetailContactSellerBtn) {
                adDetailContactSellerBtn.classList.remove('hidden');
            }


            if (adDetailLoader) adDetailLoader.classList.add('hidden');
            if (adDetailContent) adDetailContent.classList.remove('hidden');
        } else {
            showToast(response.message || "Impossible de charger les détails de l'annonce.", "error");
            if (adDetailLoader) adDetailLoader.innerHTML = `<p class="text-danger text-center">${sanitizeHTML(response.message) || "Erreur de chargement de l'annonce."}</p>`;
        }
    } catch (error) {
        console.error(`Erreur lors du chargement de l'annonce ${adId}:`, error);
        showToast(error.message || "Erreur de chargement des détails.", "error");
        if (adDetailLoader) {
            adDetailLoader.classList.remove('hidden'); // Garder visible pour montrer l'erreur
            adDetailLoader.innerHTML = `<p class="text-danger text-center">Oups ! Une erreur est survenue lors du chargement. (${sanitizeHTML(error.message)})</p>`;
        }
        if (adDetailContent) adDetailContent.classList.add('hidden');
    }
}


/**
 * Configure le carrousel d'images pour la modale de détail.
 * @param {string[]} imageUrls - Tableau d'URLs d'images.
 */
function setupAdDetailCarousel(imageUrls) {
    if (!adDetailCarouselTrack || !adDetailCarouselDotsContainer || !adDetailCarouselPrevBtn || !adDetailCarouselNextBtn) return;

    adDetailCarouselTrack.innerHTML = '';
    adDetailCarouselDotsContainer.innerHTML = '';
    currentAdDetailCarouselSlide = 0;

    const imagesToShow = imageUrls && imageUrls.length > 0 ? imageUrls : ['https://placehold.co/600x400/e0e0e0/757575?text=Aucune+image'];
    const isPlaceholder = !(imageUrls && imageUrls.length > 0);

    imagesToShow.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'carousel-item' + (index === 0 ? ' active' : '');
        item.setAttribute('role', 'tabpanel');
        item.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');
        item.id = `carousel-slide-${index}`;

        const img = document.createElement('img');
        img.src = url;
        img.alt = isPlaceholder ? 'Aucune image disponible pour cette annonce' : `Image ${index + 1} de l'annonce`;
        img.onerror = function () {
            this.src = 'https://placehold.co/600x400/e0e0e0/757575?text=Image+indisponible';
            this.alt = 'Image indisponible';
        };
        item.appendChild(img);
        adDetailCarouselTrack.appendChild(item);

        if (!isPlaceholder && imagesToShow.length > 1) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
            dot.dataset.slideTo = index;
            dot.setAttribute('aria-label', `Aller à l'image ${index + 1}`);
            dot.setAttribute('role', 'tab');
            dot.setAttribute('aria-controls', `carousel-slide-${index}`);
            dot.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
            dot.addEventListener('click', () => goToAdDetailSlide(index, imagesToShow.length));
            adDetailCarouselDotsContainer.appendChild(dot);
        }
    });

    updateAdDetailCarouselUI(imagesToShow.length);
    if (imagesToShow.length > 1 && !isPlaceholder) {
        adDetailCarouselPrevBtn.onclick = () => {
            if (currentAdDetailCarouselSlide > 0) goToAdDetailSlide(currentAdDetailCarouselSlide - 1, imagesToShow.length);
        };
        adDetailCarouselNextBtn.onclick = () => {
            if (currentAdDetailCarouselSlide < imagesToShow.length - 1) goToAdDetailSlide(currentAdDetailCarouselSlide + 1, imagesToShow.length);
        };
    }
}

/**
 * Met à jour l'interface utilisateur du carrousel (visibilité des boutons, points actifs).
 * @param {number} totalSlides - Nombre total de diapositives.
 */
function updateAdDetailCarouselUI(totalSlides) {
    const slides = adDetailCarouselTrack.querySelectorAll('.carousel-item');
    const dots = adDetailCarouselDotsContainer.querySelectorAll('.carousel-dot');

    slides.forEach((slide, index) => {
        slide.classList.toggle('active', index === currentAdDetailCarouselSlide);
        slide.setAttribute('aria-hidden', index === currentAdDetailCarouselSlide ? 'false' : 'true');
    });
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentAdDetailCarouselSlide);
        dot.setAttribute('aria-selected', index === currentAdDetailCarouselSlide ? 'true' : 'false');
    });

    const showNav = totalSlides > 1;
    adDetailCarouselPrevBtn.classList.toggle('hidden', !showNav || currentAdDetailCarouselSlide === 0);
    adDetailCarouselNextBtn.classList.toggle('hidden', !showNav || currentAdDetailCarouselSlide === totalSlides - 1);
    adDetailCarouselDotsContainer.classList.toggle('hidden', !showNav);
}

/**
 * Navigue vers une diapositive spécifique dans le carrousel de détail d'annonce.
 * @param {number} index - L'index de la diapositive cible.
 * @param {number} totalSlides - Le nombre total de diapositives.
 */
function goToAdDetailSlide(index, totalSlides) {
    currentAdDetailCarouselSlide = Math.max(0, Math.min(index, totalSlides - 1));
    if (adDetailCarouselTrack) {
        adDetailCarouselTrack.style.transform = `translateX(-${currentAdDetailCarouselSlide * 100}%)`;
    }
    updateAdDetailCarouselUI(totalSlides);
}


/**
 * Récupère toutes les annonces et les affiche sur la carte.
 * Cette fonction est appelée à l'initialisation et après des actions CRUD.
 */
export async function fetchAllAdsAndRenderOnMap() {
    toggleGlobalLoader(true, "Chargement des annonces...");
    const loaderEl = document.querySelector('#map-view .map-loader');
    if (loaderEl) loaderEl.classList.remove('hidden');

    try {
        const filters = state.getFilters ? state.getFilters() : {};
        const validFilters = {};

        // Construire validFilters en s'assurant de ne pas envoyer "null" comme chaîne
        for (const key in filters) {
            // Vérifier si la valeur n'est pas null, undefined, ou une chaîne vide après trim
            // Et spécifiquement, ne pas transformer le type null en chaîne "null" pour ces paramètres
            if (key === 'priceMin' || key === 'priceMax' || key === 'latitude' || key === 'longitude' || key === 'distance') {
                // Pour les champs numériques ou ceux qui peuvent être null de manière significative pour l'API
                // On ne les ajoute que s'ils ont une valeur numérique valide ou une valeur que l'API attend explicitement.
                // Si state.getFilters() retourne le type null pour priceMin, il deviendra "null" dans URLSearchParams.
                // On veut éviter ça si l'API ne gère pas "null" comme chaîne pour les nombres.
                const numValue = parseFloat(filters[key]);
                if (!isNaN(numValue)) {
                    validFilters[key] = numValue;
                } else if (filters[key] !== null && filters[key] !== undefined && String(filters[key]).toLowerCase() !== 'null' && String(filters[key]).trim() !== '') {
                    // Si ce n'est pas un nombre attendu, mais une autre valeur de filtre non vide
                    // (ex: category, keywords, sortBy), on la garde.
                    if (!(key === 'priceMin' || key === 'priceMax' || key === 'latitude' || key === 'longitude' || key === 'distance')) {
                        validFilters[key] = filters[key];
                    }
                }
                // Si c'est un champ numérique et que filters[key] est null, undefined, ou une chaîne non numérique, il ne sera pas ajouté.
                // Cela empêche priceMin=null d'être envoyé.
            } else if (filters[key] !== null && filters[key] !== undefined && String(filters[key]).trim() !== '') {
                // Pour les autres types de filtres (chaînes comme keywords, category, sortBy)
                validFilters[key] = String(filters[key]).trim();
            }
        }

        // Assurer que les filtres par défaut qui sont toujours présents (ex: distance, sortBy)
        // le sont même s'ils ne sont pas dans validFilters (s'ils ont des valeurs par défaut attendues par l'API)
        // L'URL d'erreur montre distance=25 et sortBy=createdAt_desc. Si ce sont des défauts, l'API devrait les gérer.
        // Ici, on se concentre sur le fait de ne pas envoyer priceMin=null ou priceMax=null.

        // Récupérer les coordonnées depuis la carte ou via la géolocalisation
        let lat, lng;
        const map = getMapInstance();
        if (map && typeof map.getCenter === 'function') {
            ({ lat, lng } = map.getCenter());
        } else {
            const pos = await geolocateUser(false);
            if (!pos) {
                if (loaderEl) loaderEl.classList.add('hidden');
                toggleGlobalLoader(false);
                showToast("Impossible d'obtenir votre position pour la recherche", 'error');
                return;
            }
            ({ lat, lng } = pos);
        }

        const queryParams = new URLSearchParams({
            ...validFilters,
            lat,
            lng
        }).toString();
        const url = `${API_BASE_URL}?${queryParams}`;

        const response = await secureFetch(url, {}, false);

        if (loaderEl) loaderEl.classList.add('hidden');
        toggleGlobalLoader(false);

        const ads = response?.data?.ads || [];
        state.setAds(ads);

        if (!Array.isArray(ads) || ads.length === 0) {
            clearAdsOnMap();
            showToast('Aucune annonce trouvée dans votre rayon.', 'info');
            return;
        }

        displayAdsOnMap(ads);
    } catch (error) {
        if (loaderEl) loaderEl.classList.add('hidden');
        toggleGlobalLoader(false);
        state.setAds([]);
        clearAdsOnMap();
        console.error("Erreur lors de la récupération des annonces pour la carte:", error);
        showToast(error.message || "Erreur de chargement des annonces.", "error");
    }
}




// --- Fonctions pour "Mes Annonces" ---

/**
 * Récupère et affiche les annonces de l'utilisateur connecté dans la modale "Mes Annonces".
 */
export async function fetchAndRenderUserAds() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        if (noMyAdsPlaceholder) noMyAdsPlaceholder.classList.remove('hidden');
        if (myAdsLoader) myAdsLoader.classList.add('hidden');
        const list = myAdsListContainer?.querySelector('#my-ads-list');
        if (list) list.innerHTML = '';
        console.warn("fetchAndRenderUserAds: Utilisateur non connecté.");
        // Optionnel: rediriger vers la connexion si la modale est ouverte par un utilisateur non connecté
        // document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'my-ads-modal' }}));
        // document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal', view: 'login' }}));
        return;
    }

    if (myAdsLoader) myAdsLoader.classList.remove('hidden');
    if (noMyAdsPlaceholder) noMyAdsPlaceholder.classList.add('hidden');
    const listElement = myAdsListContainer?.querySelector('#my-ads-list');
    if (listElement) listElement.innerHTML = ''; // Vider la liste avant de charger

    try {
        const response = await secureFetch(`${API_BASE_URL}/my`, {}, false); // Le backend renvoie { success, data: { ads: [...] } }
        if (myAdsLoader) myAdsLoader.classList.add('hidden');

        if (response && response.success && response.data && Array.isArray(response.data.ads)) {
            renderMyAdsList(response.data.ads);
        } else {
            showToast(response.message || "Impossible de charger vos annonces.", "error");
            renderMyAdsList([]); // Afficher le placeholder
        }
    } catch (error) {
        if (myAdsLoader) myAdsLoader.classList.add('hidden');
        console.error("Erreur récupération annonces utilisateur:", error);
        showToast(error.message || "Une erreur est survenue lors du chargement de vos annonces.", "error");
        renderMyAdsList([]);
    }
}

/**
 * Construit et affiche la liste des annonces de l'utilisateur.
 * @param {object[]} userAdsData - Tableau des annonces de l'utilisateur.
 */
function renderMyAdsList(userAdsData) {
    if (!myAdsListContainer || !myAdItemTemplate) {
        console.warn("renderMyAdsList: Éléments DOM manquants pour 'Mes Annonces'.");
        return;
    }
    let listElement = myAdsListContainer.querySelector('#my-ads-list');
    if (!listElement) {
        listElement = document.createElement('ul');
        listElement.id = 'my-ads-list';
        listElement.className = 'item-list my-ads-actual-list'; // Classe ajoutée pour stylage potentiel
        myAdsListContainer.appendChild(listElement);
    }
    listElement.innerHTML = ''; // Vider la liste existante

    if (!userAdsData || userAdsData.length === 0) {
        if (noMyAdsPlaceholder) noMyAdsPlaceholder.classList.remove('hidden');
        return;
    }
    if (noMyAdsPlaceholder) noMyAdsPlaceholder.classList.add('hidden');

    userAdsData.forEach(ad => {
        const templateClone = myAdItemTemplate.content.cloneNode(true);
        const listItem = templateClone.querySelector('.my-ad-item');
        if (!listItem) return;

        listItem.dataset.adId = ad._id; // Utiliser _id

        const img = listItem.querySelector('.item-image');
        const title = listItem.querySelector('.item-title');
        const price = listItem.querySelector('.item-price');
        const statusEl = listItem.querySelector('.item-status .status-badge');
        const dateEl = listItem.querySelector('.item-date small');
        const viewBtn = listItem.querySelector('.view-my-ad-btn');
        const editBtn = listItem.querySelector('.edit-my-ad-btn');
        const deleteBtn = listItem.querySelector('.delete-my-ad-btn');

        if (img) {
            // Les URLs sont déjà complètes grâce à mapImageUrls du backend
            img.src = (ad.imageUrls && ad.imageUrls[0]) ? ad.imageUrls[0] : 'https://placehold.co/80x80/e0e0e0/757575?text=Ad';
            img.alt = `Image de ${sanitizeHTML(ad.title)}`;
            img.onerror = function () { this.src = 'https://placehold.co/80x80/e0e0e0/757575?text=Img HS'; this.alt = 'Image indisponible'; };
        }
        if (title) title.textContent = sanitizeHTML(ad.title);
        if (price) price.textContent = ad.price != null ? formatPrice(ad.price) : 'N/A';
        if (dateEl && ad.createdAt) dateEl.textContent = `Publiée ${formatDate(ad.createdAt)}`;
        if (statusEl) {
            statusEl.textContent = sanitizeHTML(ad.status || 'Inconnu');
            statusEl.className = `status-badge status-${sanitizeHTML(ad.status || 'unknown').toLowerCase().replace('_', '-')}`;
        }

        if (viewBtn) {
            viewBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'my-ads-modal' } }));
                document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', { detail: { adId: ad._id } }));
            });
        }
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'my-ads-modal' } }));
                // adController.getAdById renvoie l'objet ad complet avec location.coordinates etc.
                // Il faut donc le récupérer avant de le passer à prepareAdFormForEdit
                toggleGlobalLoader(true, "Chargement de l'annonce pour édition...");
                secureFetch(`${API_BASE_URL}/${ad._id}`)
                    .then(response => {
                        toggleGlobalLoader(false);
                        if (response && response.success && response.data && response.data.ad) {
                            prepareAdFormForEdit(response.data.ad);
                        } else {
                            showToast(response.message || "Impossible de charger l'annonce pour l'édition.", "error");
                        }
                    })
                    .catch(err => {
                        toggleGlobalLoader(false);
                        showToast(err.message || "Erreur lors du chargement de l'annonce.", "error");
                    });
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => handleDeleteUserAd(ad._id));
        }
        listElement.appendChild(listItem);
    });
}

/**
 * Gère la suppression d'une annonce de l'utilisateur.
 * @param {string} adId - L'ID de l'annonce à supprimer.
 */
async function handleDeleteUserAd(adId) {
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal', // Utiliser la modale de confirmation générique
            title: 'Supprimer l\'annonce',
            message: 'Êtes-vous sûr de vouloir supprimer cette annonce ? Cette action est irréversible.',
            confirmText: 'Supprimer', // Texte pour le bouton de confirmation
            cancelText: 'Annuler',   // Texte pour le bouton d'annulation
            isDestructive: true,     // Pour styler le bouton de confirmation en rouge
            onConfirm: async () => {
                toggleGlobalLoader(true, "Suppression de l'annonce...");
                try {
                    const response = await secureFetch(`${API_BASE_URL}/${adId}`, { method: 'DELETE' }, false);
                    toggleGlobalLoader(false);
                    if (response && response.success) {
                        showToast("Annonce supprimée avec succès.", "success");
                        fetchAndRenderUserAds(); // Recharger la liste des annonces de l'utilisateur
                        if (typeof state.refreshAds === 'function') {
                            state.refreshAds();
                        } else {
                            fetchAllAdsAndRenderOnMap();
                        }
                    } else {
                        showToast(response.message || "Erreur lors de la suppression de l'annonce.", "error");
                    }
                } catch (error) {
                    toggleGlobalLoader(false);
                    console.error("Erreur lors de la suppression de l'annonce:", error);
                    showToast(error.message || "Une erreur technique est survenue.", "error");
                }
            }
        }
    }));
}

// --- Fonctions pour la modale de détail (réintégrées et ajustées) ---
function handleEditAdFromDetail() {
    const adId = adDetailModal?.dataset.adId;
    if (!adId) return;
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'ad-detail-modal' } }));
    toggleGlobalLoader(true, "Chargement de l'annonce pour édition...");
    secureFetch(`${API_BASE_URL}/${adId}`)
        .then(response => {
            toggleGlobalLoader(false);
            if (response && response.success && response.data && response.data.ad) {
                prepareAdFormForEdit(response.data.ad);
            } else {
                showToast(response.message || "Impossible de charger l'annonce pour l'édition.", "error");
            }
        })
        .catch(err => {
            toggleGlobalLoader(false);
            showToast(err.message || "Erreur lors du chargement de l'annonce pour l'édition.", "error");
        });
}

function handleDeleteAdFromDetail() {
    const adId = adDetailModal?.dataset.adId;
    if (!adId) return;
    handleDeleteUserAd(adId); // Réutiliser la même logique de suppression
}

async function handleToggleFavoriteFromDetail(event) {
    const adId = adDetailModal?.dataset.adId;
    if (!adId) return;
    const favoriteButton = event.currentTarget;
    const isCurrentlyFavorite = favoriteButton.classList.contains('active');
    const action = isCurrentlyFavorite ? 'remove' : 'add';

    toggleGlobalLoader(true, isCurrentlyFavorite ? "Retrait des favoris..." : "Ajout aux favoris...");
    try {
        // L'API pour les favoris est /api/favorites/:adId (POST pour ajouter, DELETE pour retirer)
        const response = await secureFetch(`/api/favorites/${adId}`, {
            method: action === 'add' ? 'POST' : 'DELETE'
        }, false);
        toggleGlobalLoader(false);

        if (response && response.success) {
            showToast(response.message || (action === 'add' ? "Ajouté aux favoris !" : "Retiré des favoris."), "success");
            // Mettre à jour l'état local des favoris et l'UI du bouton
            const currentUser = state.getCurrentUser();
            if (currentUser) {
                let userFavorites = state.getFavorites ? state.getFavorites() : [];
                if (action === 'add') {
                    if (!userFavorites.some(fav => fav === adId || fav._id === adId)) userFavorites.push(adId); // ou l'objet ad si l'état stocke des objets
                } else {
                    userFavorites = userFavorites.filter(favId => favId !== adId && favId._id !== adId);
                }
                if (state.setFavorites) state.setFavorites(userFavorites); // Mettre à jour l'état global des favoris
            }
            favoriteButton.classList.toggle('active', !isCurrentlyFavorite);
            favoriteButton.setAttribute('aria-pressed', (!isCurrentlyFavorite).toString());
            favoriteButton.querySelector('i').className = !isCurrentlyFavorite ? 'fa-solid fa-heart text-danger' : 'fa-regular fa-heart';
        } else {
            showToast(response.message || "Erreur lors de la mise à jour des favoris.", "error");
        }
    } catch (error) {
        toggleGlobalLoader(false);
        showToast(error.message || "Une erreur technique est survenue.", "error");
    }
}


function handleContactSellerFromDetail() {
    const adId = adDetailModal?.dataset.adId;
    const sellerId = adDetailSellerInfo?.dataset.sellerId;
    if (!adId || !sellerId) {
        showToast("Informations du vendeur non disponibles pour démarrer une discussion.", "warning");
        return;
    }
    const currentUser = state.getCurrentUser();
    if (currentUser && currentUser._id === sellerId) {
        showToast("Vous ne pouvez pas vous envoyer de message à vous-même.", "info");
        return;
    }

    document.dispatchEvent(new CustomEvent('mapMarket:initiateChat', {
        detail: { adId: adId, recipientId: sellerId }
    }));
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'ad-detail-modal' } }));
}

// function handleRateAdFromDetail() { ... } // Logique pour les avis (future)

/**
 * Initialise le module de gestion des annonces.
 */
export function init() {
    initAdsUI();
    fetchAllAdsAndRenderOnMap(); // Charger les annonces publiques initiales au démarrage
    console.log('Module Ads initialisé (avec gestion Mes Annonces).');
}
