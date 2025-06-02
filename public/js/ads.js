// js/ads.js

/**
 * @file ads.js
 * @description Gestion des annonces : CRUD complet, upload d'images,
 * affichage des détails, gestion des annonces de l'utilisateur.
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
    removeTempMarker
} from './map.js';
// import * as Auth from './auth.js'; // Décommenter si besoin d'accéder directement à Auth.switchAuthView

const API_BASE_URL = '/api/ads';
const MAX_AD_IMAGES = 5;
const MAX_IMAGE_SIZE_MB = 2;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// --- Éléments du DOM pour le formulaire d'annonce ---
let adFormModal, adForm, adIdField, adTitleField, adDescriptionField, adCategoryField;
let adPriceField, adLocationAddressField, adLatField, adLngField, adImagesInput;
let adImagePreviewsContainer, adFormMapPreview, adFormUseCurrentLocationBtn, submitAdFormBtn;
let adFormModalTitle;

// --- Éléments du DOM pour la modale de détail d'annonce ---
let adDetailModal, adDetailBodyContent, adDetailLoader, adDetailContent;
let adDetailCarouselTrack, adDetailCarouselPrevBtn, adDetailCarouselNextBtn, adDetailCarouselDots;
let adDetailItemTitle, adDetailPrice, adDetailCategory, adDetailLocation, adDetailDate;
let adDetailDescriptionText, adDetailSellerInfo, adDetailSellerAvatar, adDetailSellerName, adDetailSellerRating;
let adDetailActionsContainer, adDetailFavoriteBtn, adDetailContactSellerBtn, adDetailReportBtn;
let adDetailOwnerActions, adDetailEditAdBtn, adDetailDeleteAdBtn;
let adDetailRatingSection, adAverageRatingDisplay, rateAdBtn, adReviewsList;

// --- Éléments du DOM pour la modale "Mes Annonces" ---
let myAdsModal, myAdsListContainer, myAdItemTemplate, noMyAdsPlaceholder, myAdsLoader;
let myAdsPublishNewBtn;


let adImageFiles = [];
let currentEditingAdId = null;

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
    adFormMapPreview = document.getElementById('ad-form-map-preview');
    adFormUseCurrentLocationBtn = document.getElementById('ad-form-use-current-location-btn');
    submitAdFormBtn = document.getElementById('submit-ad-form-btn');
    adFormModalTitle = document.getElementById('ad-form-modal-title');

    // Modale de détail d'annonce
    adDetailModal = document.getElementById('ad-detail-modal');
    adDetailBodyContent = document.getElementById('ad-detail-body-content');
    adDetailLoader = document.getElementById('ad-detail-loader');
    adDetailContent = document.getElementById('ad-detail-content');
    adDetailCarouselTrack = document.getElementById('ad-detail-carousel-track');
    adDetailCarouselPrevBtn = document.getElementById('ad-detail-carousel-prev-btn');
    adDetailCarouselNextBtn = document.getElementById('ad-detail-carousel-next-btn');
    adDetailCarouselDots = document.getElementById('ad-detail-carousel-dots');
    adDetailItemTitle = document.getElementById('ad-detail-item-title');
    adDetailPrice = document.getElementById('ad-detail-price');
    adDetailCategory = document.getElementById('ad-detail-category');
    adDetailLocation = document.getElementById('ad-detail-location');
    adDetailDate = document.getElementById('ad-detail-date');
    adDetailDescriptionText = document.getElementById('ad-detail-description-text');
    adDetailSellerInfo = document.getElementById('ad-detail-seller-info');
    adDetailSellerAvatar = document.getElementById('ad-detail-seller-avatar');
    adDetailSellerName = document.getElementById('ad-detail-seller-name');
    adDetailSellerRating = document.getElementById('ad-detail-seller-rating');
    adDetailActionsContainer = document.getElementById('ad-detail-actions-container');
    adDetailFavoriteBtn = document.getElementById('ad-detail-favorite-btn');
    adDetailContactSellerBtn = document.getElementById('ad-detail-contact-seller-btn');
    adDetailReportBtn = document.getElementById('ad-detail-report-btn');
    adDetailOwnerActions = document.getElementById('ad-detail-owner-actions');
    adDetailEditAdBtn = document.getElementById('ad-detail-edit-ad-btn');
    adDetailDeleteAdBtn = document.getElementById('ad-detail-delete-ad-btn');
    adDetailRatingSection = document.getElementById('ad-detail-rating-section');
    adAverageRatingDisplay = document.getElementById('ad-average-rating-display');
    rateAdBtn = document.getElementById('rate-ad-btn');
    adReviewsList = document.getElementById('ad-reviews-list');

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
        setupImageDragAndDrop();
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
                document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal' }}));
                // Assurer que auth.js est chargé et que la fonction existe avant de l'appeler
                // Si Auth est importé : if (typeof Auth !== 'undefined' && Auth.switchAuthView) Auth.switchAuthView('login');
                // Sinon, on espère que auth.js gère l'ouverture par défaut
                return;
            }
            prepareAdFormForCreate();
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'ad-form-modal' } }));
        });
    }

    document.addEventListener('mapMarket:viewAdDetails', (event) => {
        const { adId } = event.detail;
        if (adId) loadAndDisplayAdDetails(adId);
    });

    if (adDetailEditAdBtn) adDetailEditAdBtn.addEventListener('click', handleEditAdFromDetail);
    if (adDetailDeleteAdBtn) adDetailDeleteAdBtn.addEventListener('click', handleDeleteAdFromDetail);
    if (adDetailFavoriteBtn) adDetailFavoriteBtn.addEventListener('click', handleToggleFavoriteFromDetail);
    if (adDetailContactSellerBtn) adDetailContactSellerBtn.addEventListener('click', handleContactSellerFromDetail);
    if (rateAdBtn) rateAdBtn.addEventListener('click', handleRateAdFromDetail);

    document.addEventListener('mapMarket:adMarkerPlaced', (event) => {
        const { latlng } = event.detail;
        if (adLatField && adLngField) {
            adLatField.value = latlng.lat.toFixed(6);
            adLngField.value = latlng.lng.toFixed(6);
        }
        if (adLocationAddressField) {
            adLocationAddressField.value = `Coordonnées: ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
            showToast("Localisation sélectionnée. Vérifiez/complétez l'adresse.", "info", 4000);
        }
    });

    document.addEventListener('mapMarket:modalClosed', (event) => {
        if (event.detail.modalId === 'ad-form-modal') resetAdForm();
        if (event.detail.modalId === 'ad-detail-modal') {
            if (adDetailContent) adDetailContent.classList.add('hidden');
            if (adDetailLoader) adDetailLoader.classList.remove('hidden');
            if (adDetailModal) adDetailModal.dataset.adId = '';
        }
    });

    // Écouteur pour l'ouverture de la modale "Mes Annonces" (déclenché par main.js)
    document.addEventListener('mapMarket:openMyAds', fetchAndRenderUserAds);

    if (myAdsPublishNewBtn) {
        myAdsPublishNewBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'my-ads-modal' }}));
            prepareAdFormForCreate();
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'ad-form-modal' }}));
        });
    }

    populateAdFormCategories();
    state.subscribe('categoriesChanged', populateAdFormCategories);
}

export function prepareAdFormForCreate() {
    currentEditingAdId = null;
    if (adForm) adForm.reset();
    if (adIdField) adIdField.value = '';
    adImageFiles = [];
    if (adImagePreviewsContainer) adImagePreviewsContainer.innerHTML = '';
    if (submitAdFormBtn) submitAdFormBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span data-i18n="adForm.publishButton">Publier l\'annonce</span>';
    if (adFormModalTitle) adFormModalTitle.innerHTML = '<i class="fa-solid fa-plus-circle"></i> <span data-i18n="adForm.createTitle">Publier une Annonce</span>';
    state.set('ui.map.isPlacingAdMarker', true);
    state.set('ui.map.isPlacingAlertMarker', false);
    if (typeof removeTempMarker === 'function') removeTempMarker();
    showToast("Cliquez sur la carte pour localiser votre annonce ou utilisez votre position actuelle.", "info", 5000);
}

async function prepareAdFormForEdit(adData) {
    if (!adForm || !adData) return;
    currentEditingAdId = adData.id;
    if (adIdField) adIdField.value = adData.id;
    if (adTitleField) adTitleField.value = adData.title || '';
    if (adDescriptionField) adDescriptionField.value = adData.description || '';
    if (adCategoryField) adCategoryField.value = adData.category || '';
    if (adPriceField) adPriceField.value = adData.price || '';
    if (adLocationAddressField) adLocationAddressField.value = adData.locationAddress || '';
    if (adLatField) adLatField.value = adData.latitude || '';
    if (adLngField) adLngField.value = adData.longitude || '';
    if (submitAdFormBtn) submitAdFormBtn.innerHTML = '<i class="fa-solid fa-save"></i> <span data-i18n="adForm.updateButton">Mettre à jour l\'annonce</span>';
    if (adFormModalTitle) adFormModalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> <span data-i18n="adForm.editTitle">Modifier l\'Annonce</span>';
    adImageFiles = [];
    if (adImagePreviewsContainer) adImagePreviewsContainer.innerHTML = '';
    if (adData.imageUrls && adData.imageUrls.length > 0) {
        adData.imageUrls.forEach(url => {
            const pseudoFile = { name: url.substring(url.lastIndexOf('/') + 1), isExisting: true, url: url, id: generateUUID() };
            adImageFiles.push(pseudoFile);
            createImagePreview(pseudoFile);
        });
    }
    if (adData.latitude && adData.longitude && typeof updateTempMarker === 'function') {
        updateTempMarker(adData.latitude, adData.longitude, 'ad');
    }
    state.set('ui.map.isPlacingAdMarker', true);
    state.set('ui.map.isPlacingAlertMarker', false);
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'ad-form-modal' } }));
}

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
    if (adImagesInput) adImagesInput.value = '';
    if (typeof removeTempMarker === 'function') removeTempMarker();
    state.set('ui.map.isPlacingAdMarker', false);
}

function populateAdFormCategories() {
    const categories = state.getCategories();
    if (adCategoryField && categories && categories.length > 0) {
        const currentValue = adCategoryField.value;
        const firstOption = adCategoryField.querySelector('option[value=""]');
        adCategoryField.innerHTML = '';
        if (firstOption) adCategoryField.appendChild(firstOption);
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = sanitizeHTML(cat.name);
            adCategoryField.appendChild(option);
        });
        adCategoryField.value = currentValue;
    }
}

async function fillLocationWithCurrentUserPosition() {
    const userPosition = state.getMapState()?.userPosition;
    if (userPosition && userPosition.lat && userPosition.lng) {
        if (adLatField) adLatField.value = userPosition.lat.toFixed(6);
        if (adLngField) adLngField.value = userPosition.lng.toFixed(6);
        if (typeof updateTempMarker === 'function') updateTempMarker(userPosition.lat, userPosition.lng, 'ad');
        if (adLocationAddressField) adLocationAddressField.value = `Position actuelle (précision: ${userPosition.accuracy?.toFixed(0) || 'N/A'}m)`;
        showToast("Position actuelle utilisée. Vérifiez et complétez l'adresse si besoin.", "info");
    } else {
        showToast("Impossible d'obtenir votre position actuelle. Veuillez la sélectionner sur la carte ou la saisir manuellement.", "warning");
    }
}

function setupImageDragAndDrop() {
    if (!adImagePreviewsContainer || !adImagesInput) return;
    adImagePreviewsContainer.addEventListener('dragover', (event) => {
        event.preventDefault(); event.stopPropagation();
        adImagePreviewsContainer.classList.add('dragover');
    });
    adImagePreviewsContainer.addEventListener('dragleave', (event) => {
        event.preventDefault(); event.stopPropagation();
        adImagePreviewsContainer.classList.remove('dragover');
    });
    adImagePreviewsContainer.addEventListener('drop', (event) => {
        event.preventDefault(); event.stopPropagation();
        adImagePreviewsContainer.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) addFilesToAd(Array.from(files));
    });
    adImagePreviewsContainer.addEventListener('click', (event) => {
        if (event.target === adImagePreviewsContainer && adImageFiles.length < MAX_AD_IMAGES) {
            adImagesInput.click();
        }
    });
}

function handleImageSelection(event) {
    const files = Array.from(event.target.files);
    addFilesToAd(files);
    if (adImagesInput) adImagesInput.value = '';
}

function addFilesToAd(files) {
    const currentFileCount = adImageFiles.length;
    let addedCount = 0;
    const newFiles = files.filter(file => {
        if (currentFileCount + addedCount >= MAX_AD_IMAGES) {
            if (addedCount === 0 && currentFileCount >= MAX_AD_IMAGES) {
                 showToast(`Maximum ${MAX_AD_IMAGES} images.`, 'warning');
            }
            return false;
        }
        if (!VALID_IMAGE_TYPES.includes(file.type)) {
            showToast(`Format invalide: ${sanitizeHTML(file.name)}. Acceptés: JPEG, PNG, WebP, GIF.`, 'error'); return false;
        }
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            showToast(`Fichier trop grand: ${sanitizeHTML(file.name)} (max ${MAX_IMAGE_SIZE_MB}MB).`, 'error'); return false;
        }
        if (adImageFiles.some(f => f.name === file.name && f.size === file.size && !f.isExisting)) {
            return false;
        }
        addedCount++;
        return true;
    });
    if (currentFileCount + newFiles.length > MAX_AD_IMAGES && newFiles.length > 0) {
         showToast(`Vous ne pouvez ajouter que ${MAX_AD_IMAGES - currentFileCount} image(s) de plus.`, 'warning');
    }

    newFiles.slice(0, MAX_AD_IMAGES - currentFileCount).forEach(file => {
        const fileWithId = Object.assign(file, { id: generateUUID(), isExisting: false });
        adImageFiles.push(fileWithId);
        createImagePreview(fileWithId);
    });
}

function createImagePreview(fileOrObject) {
    if (!adImagePreviewsContainer) return;
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'image-preview-item';
    previewWrapper.dataset.fileId = fileOrObject.id;
    const img = document.createElement('img');
    img.alt = `Prévisualisation de ${sanitizeHTML(fileOrObject.name)}`;
    img.classList.add('preview-image');
    if (fileOrObject.isExisting && fileOrObject.url) {
        img.src = fileOrObject.url;
    } else {
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.readAsDataURL(fileOrObject);
    }
    previewWrapper.appendChild(img);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-icon btn-danger btn-sm remove-preview-btn';
    removeBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
    removeBtn.setAttribute('aria-label', `Supprimer l'image ${sanitizeHTML(fileOrObject.name)}`);
    removeBtn.onclick = () => {
        adImageFiles = adImageFiles.filter(f => f.id !== fileOrObject.id);
        previewWrapper.remove();
        if (fileOrObject.isExisting) {
            console.log(`Image ${fileOrObject.name} marquée pour suppression.`);
        }
    };
    previewWrapper.appendChild(removeBtn);
    adImagePreviewsContainer.appendChild(previewWrapper);
}

const adFormValidationRules = {
    'ad-title': [{ type: 'required', message: 'Le titre est requis.' }, { type: 'minLength', value: 5, message: 'Le titre doit comporter au moins 5 caractères.' }, { type: 'maxLength', value: 100, message: 'Le titre ne doit pas dépasser 100 caractères.' }],
    'ad-description': [{ type: 'required', message: 'La description est requise.' }, { type: 'minLength', value: 10, message: 'La description doit comporter au moins 10 caractères.' }, { type: 'maxLength', value: 1000, message: 'La description ne doit pas dépasser 1000 caractères.' }],
    'ad-category': [{ type: 'required', message: 'Veuillez sélectionner une catégorie.' }],
    'ad-price': [{ type: 'required', message: 'Le prix est requis.' }, { type: 'numberRange', value: { min: 0 }, message: 'Le prix doit être un nombre positif.' }],
    'ad-location-address': [{ type: 'required', message: 'L\'adresse est requise.' }],
};

async function handleSubmitAd(event) {
    event.preventDefault();
    if (!adForm || !validateForm(adForm, adFormValidationRules)) {
        showToast('Veuillez corriger les erreurs dans le formulaire.', 'error'); return;
    }
    if (!adLatField.value || !adLngField.value) {
        showToast('Veuillez localiser votre annonce sur la carte.', 'error');
        if (adLocationAddressField) {
            let errorElement = document.getElementById('ad-location-error');
            if (!errorElement) {
                errorElement = document.createElement('small');
                errorElement.id = 'ad-location-error'; errorElement.className = 'form-error-message';
                adLocationAddressField.parentElement.appendChild(errorElement);
            }
            errorElement.textContent = 'Localisation sur la carte requise.'; errorElement.style.display = 'block';
            adLocationAddressField.setAttribute('aria-invalid', 'true'); adLocationAddressField.setAttribute('aria-describedby', errorElement.id);
        } return;
    } else {
        const errorElement = document.getElementById('ad-location-error');
        if (errorElement) { errorElement.textContent = ''; errorElement.style.display = 'none'; }
        if (adLocationAddressField) adLocationAddressField.removeAttribute('aria-invalid');
    }

    const formData = new FormData();
    formData.append('title', adTitleField.value.trim());
    formData.append('description', adDescriptionField.value.trim());
    formData.append('category', adCategoryField.value);
    formData.append('price', parseFloat(adPriceField.value));
    formData.append('locationAddress', adLocationAddressField.value.trim());
    formData.append('latitude', parseFloat(adLatField.value));
    formData.append('longitude', parseFloat(adLngField.value));

    const newImageFilesToUpload = adImageFiles.filter(f => !f.isExisting && f instanceof File);
    newImageFilesToUpload.forEach(file => formData.append('images', file, file.name));

    let url = API_BASE_URL;
    let method = 'POST';
    if (currentEditingAdId) {
        url = `${API_BASE_URL}/${currentEditingAdId}`;
        method = 'PUT';
        const existingImageUrlsToKeep = adImageFiles.filter(f => f.isExisting && f.url).map(f => f.url);
        formData.append('existingImageUrls', JSON.stringify(existingImageUrlsToKeep));
    }

    try {
        toggleGlobalLoader(true, currentEditingAdId ? "Mise à jour de l'annonce..." : "Publication de l'annonce...");
        const response = await secureFetch(url, { method: method, body: formData }, false);
        toggleGlobalLoader(false);
        if (response && response.id) {
            showToast(currentEditingAdId ? "Annonce mise à jour !" : "Annonce publiée !", "success");
            resetAdForm();
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'ad-form-modal' } }));
            fetchAllAds();
            if (currentEditingAdId && typeof fetchAndRenderUserAds === 'function') {
                fetchAndRenderUserAds();
            }
        } else {
            showToast(response.message || (currentEditingAdId ? "Erreur mise à jour." : "Erreur publication."), "error");
        }
    } catch (error) {
        toggleGlobalLoader(false); console.error("Erreur soumission annonce:", error);
    }
}

async function loadAndDisplayAdDetails(adId) {
    if (!adDetailModal || !adId) return;
    if (adDetailLoader) adDetailLoader.classList.remove('hidden');
    if (adDetailContent) adDetailContent.classList.add('hidden');
    adDetailModal.dataset.adId = adId;

    try {
        const ad = await secureFetch(`${API_BASE_URL}/${adId}`, {}, false);
        if (ad) {
            if (adDetailItemTitle) adDetailItemTitle.textContent = sanitizeHTML(ad.title);
            if (adDetailPrice) adDetailPrice.textContent = ad.price != null ? formatPrice(ad.price, state.getLanguage() === 'fr' ? 'EUR' : 'USD', state.getLanguage()) : 'Prix non disponible';
            const categories = state.getCategories();
            const categoryObj = categories ? categories.find(c => c.id === ad.category) : null;
            if (adDetailCategory) {
                const iconEl = adDetailCategory.querySelector('i');
                if (iconEl) iconEl.className = categoryObj ? categoryObj.icon : 'fa-solid fa-tag';
                adDetailCategory.innerHTML = (iconEl ? iconEl.outerHTML : '<i class="fa-solid fa-tag"></i> ') + sanitizeHTML(categoryObj ? categoryObj.name : ad.category);
            }
            if (adDetailLocation) adDetailLocation.innerHTML = `<i class="fa-solid fa-map-marker-alt"></i> ${sanitizeHTML(ad.locationAddress || 'Localisation non spécifiée')}`;
            if (adDetailDate) adDetailDate.innerHTML = `<i class="fa-solid fa-calendar-days"></i> Publiée ${formatDate(ad.createdAt || new Date(), { day: 'numeric', month: 'short', year: 'numeric' })}`;
            if (adDetailDescriptionText) adDetailDescriptionText.innerHTML = sanitizeHTML(ad.description || '').replace(/\n/g, '<br>');
            setupAdDetailCarousel(ad.imageUrls || []);
            if (ad.seller) {
                if (adDetailSellerAvatar) { adDetailSellerAvatar.src = ad.seller.avatarUrl || 'avatar-default.svg'; adDetailSellerAvatar.alt = `Avatar de ${sanitizeHTML(ad.seller.name)}`; }
                if (adDetailSellerName) adDetailSellerName.textContent = sanitizeHTML(ad.seller.name);
                if (adDetailSellerInfo) adDetailSellerInfo.dataset.sellerId = ad.seller.id;
            }
            const currentUser = state.getCurrentUser();
            if (adDetailFavoriteBtn) {
                const userFavorites = state.get('favorites') || [];
                const isFavorite = userFavorites.includes(ad.id);
                adDetailFavoriteBtn.classList.toggle('active', isFavorite);
                adDetailFavoriteBtn.setAttribute('aria-pressed', isFavorite.toString());
                adDetailFavoriteBtn.querySelector('i').className = isFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            }
            if (adDetailOwnerActions && currentUser && ad.userId === currentUser.id) {
                adDetailOwnerActions.classList.remove('hidden');
            } else if (adDetailOwnerActions) {
                adDetailOwnerActions.classList.add('hidden');
            }
            if (adDetailLoader) adDetailLoader.classList.add('hidden');
            if (adDetailContent) adDetailContent.classList.remove('hidden');
        } else {
            showToast("Impossible de charger les détails de l'annonce.", "error");
            if (adDetailLoader) adDetailLoader.innerHTML = '<p>Erreur de chargement.</p>';
        }
    } catch (error) {
        console.error(`Erreur chargement annonce ${adId}:`, error);
        showToast("Erreur chargement détails.", "error");
        if (adDetailLoader) adDetailLoader.innerHTML = '<p>Oups ! Erreur.</p>';
    }
}

function setupAdDetailCarousel(imageUrls) {
    if (!adDetailCarouselTrack || !adDetailCarouselDots || !adDetailCarouselPrevBtn || !adDetailCarouselNextBtn) return;
    adDetailCarouselTrack.innerHTML = ''; adDetailCarouselDots.innerHTML = '';
    let currentSlide = 0;
    if (!imageUrls || imageUrls.length === 0) {
        const placeholderItem = document.createElement('div'); placeholderItem.className = 'carousel-item active';
        const img = document.createElement('img'); img.src = 'https://placehold.co/600x400/e0e0e0/757575?text=Aucune+image'; img.alt = 'Aucune image disponible';
        placeholderItem.appendChild(img); adDetailCarouselTrack.appendChild(placeholderItem);
        adDetailCarouselPrevBtn.classList.add('hidden'); adDetailCarouselNextBtn.classList.add('hidden'); adDetailCarouselDots.classList.add('hidden');
        return;
    }
    imageUrls.forEach((url, index) => {
        const item = document.createElement('div'); item.className = 'carousel-item' + (index === 0 ? ' active' : '');
        const img = document.createElement('img'); img.src = url; img.alt = `Image ${index + 1}`;
        img.onerror = function() { this.src = 'https://placehold.co/600x400/e0e0e0/757575?text=Image+erreur'; this.alt = 'Image corrompue';};
        item.appendChild(img); adDetailCarouselTrack.appendChild(item);
        const dot = document.createElement('button'); dot.type = 'button'; dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
        dot.dataset.slideTo = index; dot.setAttribute('aria-label', `Aller à l'image ${index + 1}`);
        dot.addEventListener('click', () => goToSlide(index)); adDetailCarouselDots.appendChild(dot);
    });
    const slides = adDetailCarouselTrack.querySelectorAll('.carousel-item');
    const dots = adDetailCarouselDots.querySelectorAll('.carousel-dot');
    function updateCarouselUI() {
        slides.forEach((slide, index) => slide.classList.toggle('active', index === currentSlide));
        dots.forEach((dot, index) => dot.classList.toggle('active', index === currentSlide));
        adDetailCarouselPrevBtn.classList.toggle('hidden', currentSlide === 0 || slides.length <= 1);
        adDetailCarouselNextBtn.classList.toggle('hidden', currentSlide === slides.length - 1 || slides.length <= 1);
        adDetailCarouselDots.classList.toggle('hidden', slides.length <= 1);
    }
    function goToSlide(index) { currentSlide = index; adDetailCarouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`; updateCarouselUI(); }
    adDetailCarouselPrevBtn.onclick = () => { if (currentSlide > 0) goToSlide(currentSlide - 1); };
    adDetailCarouselNextBtn.onclick = () => { if (currentSlide < slides.length - 1) goToSlide(currentSlide + 1); };
    updateCarouselUI();
}

export async function fetchAllAds() {
    try {
        const adsData = await secureFetch(API_BASE_URL, {}, false);
        if (adsData && Array.isArray(adsData)) {
            state.setAds(adsData);
        } else {
            state.setAds([]);
            console.warn("fetchAllAds: Aucune annonce trouvée ou format de réponse incorrect.");
        }
    } catch (error) {
        if (error && error.status === 404) {
            console.warn(`L'API des annonces (${API_BASE_URL}) n'a pas été trouvée (404). Aucune annonce ne sera affichée.`);
        } else {
            console.error("Erreur lors de la récupération des annonces:", error && error.message ? error.message : 'Erreur inconnue', error && error.status ? `(Status: ${error.status})` : '');
        }
        state.setAds([]);
    }
}

// --- Fonctions pour "Mes Annonces" ---
export async function fetchAndRenderUserAds() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        if (noMyAdsPlaceholder) noMyAdsPlaceholder.classList.remove('hidden');
        if (myAdsLoader) myAdsLoader.classList.add('hidden');
        const list = myAdsListContainer?.querySelector('#my-ads-list');
        if (list) list.innerHTML = '';
        console.warn("fetchAndRenderUserAds: Utilisateur non connecté.");
        return;
    }
    if (myAdsLoader) myAdsLoader.classList.remove('hidden');
    if (noMyAdsPlaceholder) noMyAdsPlaceholder.classList.add('hidden');
    const existingList = myAdsListContainer?.querySelector('#my-ads-list');
    if (existingList) existingList.innerHTML = '';

    try {
        // Endpoint pour récupérer les annonces de l'utilisateur courant (identifié par token JWT)
        const userAds = await secureFetch(`${API_BASE_URL}/my`, {}, false);
        renderMyAdsList(userAds && Array.isArray(userAds) ? userAds : []);
    } catch (error) {
        console.error("Erreur récupération annonces utilisateur:", error);
        showToast("Impossible de charger vos annonces.", "error");
        renderMyAdsList([]); // Afficher le placeholder en cas d'erreur
    } finally {
        if (myAdsLoader) myAdsLoader.classList.add('hidden');
    }
}

function renderMyAdsList(userAdsData) {
    if (!myAdsListContainer || !myAdItemTemplate) {
        console.warn("renderMyAdsList: Éléments DOM manquants pour 'Mes Annonces'.");
        return;
    }
    let listElement = myAdsListContainer.querySelector('#my-ads-list');
    if (!listElement) { // Créer la liste si elle n'existe pas (devrait exister via HTML)
        listElement = document.createElement('ul');
        listElement.id = 'my-ads-list';
        listElement.className = 'item-list';
        myAdsListContainer.appendChild(listElement);
    }
    listElement.innerHTML = ''; // Vider la liste

    if (!userAdsData || userAdsData.length === 0) {
        if (noMyAdsPlaceholder) noMyAdsPlaceholder.classList.remove('hidden');
        return;
    }
    if (noMyAdsPlaceholder) noMyAdsPlaceholder.classList.add('hidden');

    userAdsData.forEach(ad => {
        const templateClone = myAdItemTemplate.content.cloneNode(true);
        const listItem = templateClone.querySelector('.my-ad-item');
        const img = listItem.querySelector('.item-image');
        const title = listItem.querySelector('.item-title');
        const price = listItem.querySelector('.item-price');
        const statusEl = listItem.querySelector('.item-status .status-badge');
        const dateEl = listItem.querySelector('.item-date small');
        const viewBtn = listItem.querySelector('.view-my-ad-btn');
        const editBtn = listItem.querySelector('.edit-my-ad-btn');
        const deleteBtn = listItem.querySelector('.delete-my-ad-btn');

        listItem.dataset.adId = ad.id;
        if (img) {
            img.src = (ad.imageUrls && ad.imageUrls[0]) ? ad.imageUrls[0] : 'https://placehold.co/80x80/e0e0e0/757575?text=Ad';
            img.alt = `Image de ${sanitizeHTML(ad.title)}`;
        }
        if (title) title.textContent = sanitizeHTML(ad.title);
        if (price) price.textContent = ad.price != null ? formatPrice(ad.price, state.getLanguage() === 'fr' ? 'EUR' : 'USD', state.getLanguage()) : 'N/A';
        if (dateEl && ad.createdAt) dateEl.textContent = `Publiée ${formatDate(ad.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}`;
        if (statusEl) {
            statusEl.textContent = sanitizeHTML(ad.status || 'Inconnu');
            statusEl.className = `status-badge status-${sanitizeHTML(ad.status || 'unknown').toLowerCase()}`;
        }

        if (viewBtn) {
            viewBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'my-ads-modal' } }));
                document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', { detail: { adId: ad.id } }));
            });
        }
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'my-ads-modal' } }));
                prepareAdFormForEdit(ad); // prepareAdFormForEdit a besoin de l'objet ad complet
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => handleDeleteUserAd(ad.id));
        }
        listElement.appendChild(listItem);
    });
}

async function handleDeleteUserAd(adId) {
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal',
            title: 'Supprimer l\'annonce',
            message: 'Êtes-vous sûr de vouloir supprimer cette annonce ? Cette action est irréversible.',
            confirmButtonText: 'Supprimer',
            cancelButtonText: 'Annuler',
            confirmButtonClass: 'btn-danger',
            onConfirm: async () => {
                try {
                    toggleGlobalLoader(true, "Suppression de l'annonce...");
                    await secureFetch(`${API_BASE_URL}/${adId}`, { method: 'DELETE' }, false);
                    toggleGlobalLoader(false);
                    showToast("Annonce supprimée.", "success");
                    fetchAndRenderUserAds(); // Recharger la liste des annonces de l'utilisateur
                    fetchAllAds(); // Recharger aussi toutes les annonces pour la carte/liste principale
                } catch (error) {
                    toggleGlobalLoader(false);
                    console.error("Erreur suppression annonce:", error);
                    // Le toast d'erreur est géré par secureFetch
                }
            }
        }
    }));
}

// --- Fonctions pour la modale de détail (réintégrées pour complétude) ---
function handleEditAdFromDetail() {
    const adId = adDetailModal?.dataset.adId;
    if (!adId) return;
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'ad-detail-modal' } }));
    secureFetch(`${API_BASE_URL}/${adId}`)
        .then(adData => {
            if (adData) prepareAdFormForEdit(adData);
            else showToast("Impossible de charger pour édition.", "error");
        })
        .catch(err => showToast("Erreur chargement pour édition.", "error"));
}

function handleDeleteAdFromDetail() {
    const adId = adDetailModal?.dataset.adId;
    if (!adId) return;
    handleDeleteUserAd(adId); // Réutiliser la même logique de suppression
}

function handleToggleFavoriteFromDetail(event) {
    const adId = adDetailModal?.dataset.adId;
    if (!adId) return;
    const favoriteButton = event.currentTarget;
    const isFavorite = favoriteButton.classList.contains('active');
    document.dispatchEvent(new CustomEvent('mapMarket:toggleFavorite', {
        detail: { adId: adId, setFavorite: !isFavorite, sourceButton: favoriteButton }
    }));
}

function handleContactSellerFromDetail() {
    const adId = adDetailModal?.dataset.adId;
    const sellerId = adDetailSellerInfo?.dataset.sellerId;
    if (!adId || !sellerId) {
        showToast("Infos vendeur non disponibles.", "warning"); return;
    }
    document.dispatchEvent(new CustomEvent('mapMarket:initiateChat', {
        detail: { adId: adId, recipientId: sellerId }
    }));
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'ad-detail-modal' } }));
}

function handleRateAdFromDetail() {
    const adId = adDetailModal?.dataset.adId;
    if (!adId) return;
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: { modalId: 'review-form-modal', targetType: 'ad', targetId: adId }
    }));
}

export function init() {
    initAdsUI();
    fetchAllAds(); // Charger les annonces publiques initiales
    console.log('Module Ads initialisé (avec gestion Mes Annonces).');
}
