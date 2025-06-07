// js/alerts.js

/**
 * @file alerts.js
 * @description Gestion des alertes de recherche des utilisateurs.
 * Permet de créer, afficher, modifier et supprimer des alertes.
 * Les alertes sont affichées sur la carte et notifient l'utilisateur
 * lorsqu'une nouvelle annonce correspond à ses critères.
 */

import * as state from './state.js';
import {
    showToast,
    validateForm,
    secureFetch,
    toggleGlobalLoader,
    sanitizeHTML
} from './utils.js';
import {
    updateTempMarker,
    removeTempMarker
} from './map.js'; // Pour interagir avec le marqueur temporaire pour la localisation de l'alerte

const API_BASE_URL = '/api/alerts';

// --- Éléments du DOM ---
let alertsModal, alertListContainer, alertItemTemplate, noAlertsPlaceholder;
let createAlertFormSection, createAlertForm, alertIdField;
let alertKeywordsField, alertCategoryFieldAlert, alertRadiusField; // alertCategoryFieldAlert pour éviter conflit avec filters.js
let showCreateAlertFormBtn, cancelCreateAlertBtn;
// La position (lat/lng) sera gérée via la carte ou un champ d'adresse avec géocodage (simplifié ici)

let currentEditingAlertId = null;

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour les alertes.
 */
function initAlertsUI() {
    alertsModal = document.getElementById('alerts-modal');
    alertListContainer = document.getElementById('alert-list-container'); // Le div qui contiendra la liste ul
    alertItemTemplate = document.getElementById('alert-item-template');
    noAlertsPlaceholder = document.getElementById('no-alerts-placeholder');

    createAlertFormSection = document.getElementById('create-alert-form-section');
    createAlertForm = document.getElementById('create-alert-form');
    alertIdField = document.getElementById('alert-id'); // Champ caché pour l'ID en édition
    alertKeywordsField = document.getElementById('alert-keywords');
    alertCategoryFieldAlert = document.getElementById('alert-category'); // Renommé pour clarté
    alertRadiusField = document.getElementById('alert-radius');

    showCreateAlertFormBtn = document.getElementById('show-create-alert-form-btn');
    cancelCreateAlertBtn = document.getElementById('cancel-create-alert-btn');


    if (!alertsModal || !alertListContainer || !alertItemTemplate || !noAlertsPlaceholder || !createAlertForm) {
        console.error("Un ou plusieurs éléments DOM pour les alertes sont manquants.");
        return;
    }

    // Écouteurs d'événements
    if (showCreateAlertFormBtn) {
        showCreateAlertFormBtn.addEventListener('click', () => {
            prepareAlertFormForCreate();
            if (createAlertFormSection) createAlertFormSection.classList.remove('hidden');
            showCreateAlertFormBtn.setAttribute('aria-expanded', 'true');
            if (alertKeywordsField) alertKeywordsField.focus();
        });
    }

    if (cancelCreateAlertBtn) {
        cancelCreateAlertBtn.addEventListener('click', () => {
            if (createAlertFormSection) createAlertFormSection.classList.add('hidden');
            if (showCreateAlertFormBtn) showCreateAlertFormBtn.setAttribute('aria-expanded', 'false');
            resetAlertForm();
        });
    }

    if (createAlertForm) {
        createAlertForm.addEventListener('submit', handleSubmitAlert);
    }

    // Charger les alertes lorsque la modale s'ouvre
    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'alerts-modal') {
            const currentUser = state.getCurrentUser();
            if (currentUser) {
                loadUserAlerts();
            } else {
                displayNoAlerts(); // Afficher l'état vide si pas connecté
            }
            // S'assurer que le formulaire de création est caché par défaut à l'ouverture
            if (createAlertFormSection) createAlertFormSection.classList.add('hidden');
            if (showCreateAlertFormBtn) showCreateAlertFormBtn.setAttribute('aria-expanded', 'false');
            populateAlertFormCategories(); // Charger les catégories dans le formulaire
        }
    });
    document.addEventListener('mapMarket:modalClosed', (event) => {
        if (event.detail.modalId === 'alerts-modal') {
            resetAlertForm(); // Nettoyer le formulaire et le marqueur temporaire
        }
    });


    // Mettre à jour les alertes si l'utilisateur change
    state.subscribe('currentUserChanged', (user) => {
        if (user) {
            loadUserAlerts();
        } else {
            clearAlertsDisplay();
            state.set('alerts', []); // Vider l'état des alertes
        }
    });

    // Mettre à jour l'affichage lorsque l'état des alertes change
    state.subscribe('alertsChanged', (alertsData) => {
        // La carte écoutera aussi 'alertsChanged' pour afficher les marqueurs/zones
        if (alertsModal && alertsModal.getAttribute('aria-hidden') === 'false') {
            renderAlertsList(alertsData);
        }
    });

    // Écouteur pour le placement de marqueur depuis la carte (si on ajoute cette fonctionnalité)
    document.addEventListener('mapMarket:alertMarkerPlaced', (event) => {
        const {
            latlng
        } = event.detail;
        // Stocker latlng dans un champ caché du formulaire ou directement dans l'état temporaire du formulaire
        if (createAlertForm) {
            let latField = createAlertForm.querySelector('input[name="latitude"]');
            let lngField = createAlertForm.querySelector('input[name="longitude"]');
            if (!latField) {
                latField = document.createElement('input');
                latField.type = 'hidden';
                latField.name = 'latitude';
                createAlertForm.appendChild(latField);
            }
            if (!lngField) {
                lngField = document.createElement('input');
                lngField.type = 'hidden';
                lngField.name = 'longitude';
                createAlertForm.appendChild(lngField);
            }
            latField.value = latlng.lat.toFixed(6);
            lngField.value = latlng.lng.toFixed(6);
            showToast("Localisation pour l'alerte sélectionnée sur la carte.", "info");
        }
    });

    populateAlertFormCategories();
    state.subscribe('categoriesChanged', populateAlertFormCategories);
}

/**
 * Prépare le formulaire d'alerte pour la création.
 */
function prepareAlertFormForCreate() {
    currentEditingAlertId = null;
    if (createAlertForm) createAlertForm.reset();
    if (alertIdField) alertIdField.value = '';
    const submitButton = createAlertForm ? createAlertForm.querySelector('button[type="submit"]') : null;
    if (submitButton) {
        submitButton.innerHTML = '<i class="fa-solid fa-save"></i> <span data-i18n="alerts.saveButton">Enregistrer l\'alerte</span>';
    }
    const formTitle = createAlertFormSection ? createAlertFormSection.querySelector('h3') : null;
    if (formTitle) formTitle.textContent = 'Nouvelle Alerte';


    // Activer le mode de placement de marqueur sur la carte pour les alertes
    // state.set('ui.map.isPlacingAlertMarker', true);
    // state.set('ui.map.isPlacingAdMarker', false);
    // removeTempMarker();
    // showToast("Cliquez sur la carte pour définir le centre de votre alerte, ou elle sera basée sur votre position actuelle.", "info", 5000);
    // Pour l'instant, la localisation de l'alerte sera celle de l'utilisateur au moment de la création,
    // ou une adresse à entrer (non implémenté dans le HTML fourni).
    // La sélection sur carte est une amélioration possible.
}

/**
 * Prépare le formulaire d'alerte pour l'édition.
 * @param {Object} alertData - Les données de l'alerte à éditer.
 */
function prepareAlertFormForEdit(alertData) {
    if (!createAlertForm || !alertData) return;
    currentEditingAlertId = alertData.id;

    if (alertIdField) alertIdField.value = alertData.id;
    if (alertKeywordsField) alertKeywordsField.value = alertData.keywords || '';
    if (alertCategoryFieldAlert) alertCategoryFieldAlert.value = alertData.category || '';
    if (alertRadiusField) alertRadiusField.value = alertData.radius || 10; // 10km par défaut

    // Gérer lat/lng si stockés
    let latField = createAlertForm.querySelector('input[name="latitude"]');
    let lngField = createAlertForm.querySelector('input[name="longitude"]');
    if (alertData.latitude && alertData.longitude) {
        if (!latField) {
            latField = document.createElement('input');
            latField.type = 'hidden';
            latField.name = 'latitude';
            createAlertForm.appendChild(latField);
        }
        if (!lngField) {
            lngField = document.createElement('input');
            lngField.type = 'hidden';
            lngField.name = 'longitude';
            createAlertForm.appendChild(lngField);
        }
        latField.value = alertData.latitude;
        lngField.value = alertData.longitude;
        // updateTempMarker(alertData.latitude, alertData.longitude, 'alert');
    }


    const submitButton = createAlertForm.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.innerHTML = '<i class="fa-solid fa-save"></i> <span data-i18n="alerts.updateButton">Mettre à jour l\'alerte</span>';
    }
    const formTitle = createAlertFormSection ? createAlertFormSection.querySelector('h3') : null;
    if (formTitle) formTitle.textContent = 'Modifier l\'Alerte';


    if (createAlertFormSection) createAlertFormSection.classList.remove('hidden');
    if (showCreateAlertFormBtn) showCreateAlertFormBtn.setAttribute('aria-expanded', 'true');
    if (alertKeywordsField) alertKeywordsField.focus();
    // state.set('ui.map.isPlacingAlertMarker', true);
}


/**
 * Réinitialise le formulaire d'alerte.
 */
function resetAlertForm() {
    if (createAlertForm) createAlertForm.reset();
    if (alertIdField) alertIdField.value = '';
    currentEditingAlertId = null;
    // removeTempMarker();
    // state.set('ui.map.isPlacingAlertMarker', false);

    const formTitle = createAlertFormSection ? createAlertFormSection.querySelector('h3') : null;
    if (formTitle) formTitle.textContent = 'Nouvelle Alerte';
    const submitButton = createAlertForm ? createAlertForm.querySelector('button[type="submit"]') : null;
    if (submitButton) {
        submitButton.innerHTML = '<i class="fa-solid fa-save"></i> <span data-i18n="alerts.saveButton">Enregistrer l\'alerte</span>';
    }

    // Réinitialiser les messages d'erreur
    createAlertForm.querySelectorAll('.form-error-message').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
    createAlertForm.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
}

/**
 * Remplit le select des catégories dans le formulaire d'alerte.
 */
function populateAlertFormCategories() {
    const categories = state.getCategories();
    if (alertCategoryFieldAlert && categories.length > 0) {
        const currentValue = alertCategoryFieldAlert.value;

        const firstOption = alertCategoryFieldAlert.querySelector('option[value=""]'); // "Toutes les catégories"
        alertCategoryFieldAlert.innerHTML = '';
        if (firstOption) alertCategoryFieldAlert.appendChild(firstOption);

        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            alertCategoryFieldAlert.appendChild(option);
        });
        alertCategoryFieldAlert.value = currentValue;
    }
}

/**
 * Règles de validation pour le formulaire d'alerte.
 */
const alertFormValidationRules = {
    'alert-keywords': [{
        type: 'required',
        message: 'Les mots-clés sont requis.'
    }, {
        type: 'minLength',
        value: 3,
        message: 'Veuillez entrer au moins 3 caractères pour les mots-clés.'
    }],
    'alert-radius': [{
        type: 'required',
        message: 'Le rayon est requis.'
    }, {
        type: 'numberRange',
        value: {
            min: 1,
            max: 200
        },
        message: 'Le rayon doit être entre 1 et 200 km.'
    }]
    // 'alert-category' est optionnel (valeur "" pour "Toutes")
};

/**
 * Gère la soumission du formulaire d'alerte (création ou mise à jour).
 * @param {Event} event - L'événement de soumission.
 */
async function handleSubmitAlert(event) {
    event.preventDefault();

    if (!validateForm(createAlertForm, alertFormValidationRules)) {
        showToast('Veuillez corriger les erreurs dans le formulaire.', 'error');
        return;
    }

    const formData = {
        keywords: alertKeywordsField.value.trim(),
        category: alertCategoryFieldAlert.value || null, // null si "Toutes les catégories"
        radius: parseInt(alertRadiusField.value),
        // Prix min/max pourraient être ajoutés ici si le formulaire les supporte
    };

    // Ajouter lat/lng si disponibles (depuis la carte ou la position utilisateur)
    const latField = createAlertForm.querySelector('input[name="latitude"]');
    const lngField = createAlertForm.querySelector('input[name="longitude"]');
    if (latField && latField.value && lngField && lngField.value) {
        formData.latitude = parseFloat(latField.value);
        formData.longitude = parseFloat(lngField.value);
    } else {
        // Si pas de position sélectionnée sur la carte, utiliser la position actuelle de l'utilisateur si disponible
        const userPosition = state.getMapState()?.userPosition;
        if (userPosition && userPosition.lat && userPosition.lng) {
            formData.latitude = userPosition.lat;
            formData.longitude = userPosition.lng;
        } else {
            // Fallback: si aucune position, le backend pourrait utiliser la localisation par défaut de l'utilisateur
            // ou rejeter la création si la localisation est obligatoire.
            // Pour cet exemple, on n'envoie pas de lat/lng si non défini.
            // showToast("Localisation non définie pour l'alerte. Elle sera basée sur votre position par défaut.", "info");
        }
    }


    let url = API_BASE_URL;
    let method = 'POST';

    if (currentEditingAlertId) {
        url = `${API_BASE_URL}/${currentEditingAlertId}`;
        method = 'PUT';
        formData.id = currentEditingAlertId;
    }

    try {
        toggleGlobalLoader(true, currentEditingAlertId ? "Mise à jour de l'alerte..." : "Création de l'alerte...");
        const response = await secureFetch(url, {
            method: method,
            body: formData
        }, false);
        toggleGlobalLoader(false);

        if (response && response.id) {
            showToast(currentEditingAlertId ? "Alerte mise à jour avec succès !" : "Alerte créée avec succès !", "success");
            resetAlertForm();
            if (createAlertFormSection) createAlertFormSection.classList.add('hidden');
            if (showCreateAlertFormBtn) showCreateAlertFormBtn.setAttribute('aria-expanded', 'false');
            loadUserAlerts(); // Recharger la liste des alertes
        } else {
            showToast(response.message || (currentEditingAlertId ? "Erreur lors de la mise à jour." : "Erreur lors de la création."), "error");
        }
    } catch (error) {
        toggleGlobalLoader(false);
        console.error("Erreur de soumission d'alerte:", error);
    }
}

/**
 * Charge les alertes de l'utilisateur connecté.
 */
async function loadUserAlerts() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        state.set('alerts', []);
        return;
    }

    try {
        const alertsData = await secureFetch(API_BASE_URL, {}, false); // GET /api/alerts
        if (alertsData && Array.isArray(alertsData)) {
            state.set('alerts', alertsData); // Met à jour l'état global
        } else {
            state.set('alerts', []);
        }
    } catch (error) {
        console.error("Erreur lors du chargement des alertes:", error);
        state.set('alerts', []);
    }
}

/**
 * Affiche la liste des alertes dans la modale.
 * @param {Array<Object>} alertsData - Tableau des objets alertes.
 */
function renderAlertsList(alertsData) {
    if (!alertListContainer || !alertItemTemplate) return;

    const listElement = alertListContainer.querySelector('#alert-list') || document.createElement('ul');
    listElement.id = 'alert-list';
    listElement.className = 'item-list';
    listElement.innerHTML = ''; // Vider la liste existante

    if (!alertsData || alertsData.length === 0) {
        displayNoAlerts();
        return;
    }

    if (noAlertsPlaceholder) noAlertsPlaceholder.classList.add('hidden');

    alertsData.forEach(alertItem => {
        const templateClone = alertItemTemplate.content.cloneNode(true);
        const listItem = templateClone.querySelector('.alert-item');

        listItem.dataset.alertId = alertItem.id;
        const keywordsEl = listItem.querySelector('.alert-keywords span');
        const categoryEl = listItem.querySelector('.alert-category span');
        const radiusEl = listItem.querySelector('.alert-radius span');

        if (keywordsEl) keywordsEl.textContent = sanitizeHTML(alertItem.keywords);
        if (radiusEl) radiusEl.textContent = `${alertItem.radius || 'N/A'}`;

        if (categoryEl) {
            const categoryObj = state.getCategories().find(c => c.id === alertItem.category);
            categoryEl.textContent = categoryObj ? sanitizeHTML(categoryObj.name) : (alertItem.category ? sanitizeHTML(alertItem.category) : 'Toutes');
        }


        const editBtn = listItem.querySelector('.edit-alert-btn');
        const deleteBtn = listItem.querySelector('.delete-alert-btn');

        if (editBtn) {
            editBtn.addEventListener('click', () => {
                prepareAlertFormForEdit(alertItem);
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                confirmDeleteAlert(alertItem.id);
            });
        }
        listElement.appendChild(listItem);
    });
    if (!alertListContainer.querySelector('#alert-list')) {
        alertListContainer.appendChild(listElement);
    }
}

/**
 * Affiche le message "aucune alerte".
 */
function displayNoAlerts() {
    const listElement = alertListContainer.querySelector('#alert-list');
    if (listElement) listElement.innerHTML = '';
    if (noAlertsPlaceholder) noAlertsPlaceholder.classList.remove('hidden');
}

/**
 * Efface l'affichage des alertes.
 */
function clearAlertsDisplay() {
    const listElement = alertListContainer.querySelector('#alert-list');
    if (listElement) listElement.innerHTML = '';
    if (noAlertsPlaceholder) noAlertsPlaceholder.classList.add('hidden');
}

/**
 * Demande confirmation avant de supprimer une alerte.
 * @param {string} alertId - L'ID de l'alerte à supprimer.
 */
function confirmDeleteAlert(alertId) {
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal',
            title: 'Supprimer l\'alerte',
            message: 'Êtes-vous sûr de vouloir supprimer cette alerte ?',
            confirmButtonText: 'Supprimer',
            cancelButtonText: 'Annuler',
            confirmButtonClass: 'btn-danger',
            onConfirm: async () => {
                try {
                    toggleGlobalLoader(true, "Suppression de l'alerte...");
                    await secureFetch(`${API_BASE_URL}/${alertId}`, {
                        method: 'DELETE'
                    }, false);
                    toggleGlobalLoader(false);
                    showToast("Alerte supprimée avec succès.", "success");
                    loadUserAlerts(); // Recharger la liste
                } catch (error) {
                    toggleGlobalLoader(false);
                    console.error("Erreur lors de la suppression de l'alerte:", error);
                }
            }
        }
    }));
}


/**
 * Initialise le module des alertes.
 */
export function init() {
    initAlertsUI();
    // Le chargement initial des alertes est géré par le listener de currentUserChanged
    // ou à l'ouverture de la modale.
    console.log('Module Alerts initialisé.');
}

// L'initialisation sera appelée depuis main.js
// init();
