// js/filters.js

/**
 * @file filters.js
 * @description Gestion des filtres pour les annonces.
 * Permet à l'utilisateur de définir des critères de recherche (mots-clés, catégorie, prix, distance, tri)
 * et met à jour l'état global des filtres.
 */

import * as state from './state.js';
import {
    showToast,
    sanitizeHTML
} from './utils.js'; // Pas besoin de secureFetch ici a priori, sauf pour charger des options dynamiques

// --- Éléments du DOM ---
let filtersModal, filtersForm;
let filterKeywordsField, filterCategoryField, filterPriceMinField, filterPriceMaxField;
let filterDistanceSlider, filterDistanceValueDisplay;
let filterSortByField;
let applyFiltersBtn, resetFiltersBtn;

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour les filtres.
 */
function initFiltersUI() {
    filtersModal = document.getElementById('filters-modal');
    filtersForm = document.getElementById('filters-form');

    if (!filtersModal || !filtersForm) {
        console.error("Éléments DOM pour les filtres (modale ou formulaire) manquants.");
        return;
    }

    filterKeywordsField = document.getElementById('filter-keywords');
    filterCategoryField = document.getElementById('filter-category');
    filterPriceMinField = document.getElementById('filter-price-min');
    filterPriceMaxField = document.getElementById('filter-price-max');
    filterDistanceSlider = document.getElementById('filter-distance');
    filterDistanceValueDisplay = document.getElementById('filter-distance-value-display');
    filterSortByField = document.getElementById('filter-sort-by');

    // Les boutons sont dans le formulaire, donc gérés par les événements 'submit' et 'reset' du formulaire.
    // applyFiltersBtn = filtersForm.querySelector('button[type="submit"]'); // Pas nécessaire de le cibler spécifiquement
    resetFiltersBtn = document.getElementById('reset-filters-btn');


    // Écouteurs d'événements
    filtersForm.addEventListener('submit', handleApplyFilters);
    if (resetFiltersBtn) { // Le bouton reset de type "reset" réinitialise le form, on écoute l'événement reset sur le form.
        filtersForm.addEventListener('reset', handleResetFiltersForm);
    }


    if (filterDistanceSlider && filterDistanceValueDisplay) {
        filterDistanceSlider.addEventListener('input', updateDistanceDisplay);
    }

    // Charger les filtres actuels lorsque la modale s'ouvre
    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'filters-modal') {
            loadFiltersFromState();
            populateFilterCategories(); // S'assurer que les catégories sont à jour
        }
    });

    // Mettre à jour les filtres si l'état change de l'extérieur (peu probable pour les filtres manuels)
    // state.subscribe('filtersChanged', loadFiltersFromState); // Peut créer une boucle si mal géré

    // Charger les catégories dans le select des filtres
    populateFilterCategories();
    state.subscribe('categoriesChanged', populateFilterCategories);
}

/**
 * Charge les valeurs des filtres depuis l'état global et les applique aux champs du formulaire.
 */
function loadFiltersFromState() {
    const currentFilters = state.getFilters();
    if (!filtersForm || !currentFilters) return;

    if (filterKeywordsField) filterKeywordsField.value = currentFilters.keywords || '';
    if (filterCategoryField) filterCategoryField.value = currentFilters.category || '';
    if (filterPriceMinField) filterPriceMinField.value = currentFilters.priceMin || '';
    if (filterPriceMaxField) filterPriceMaxField.value = currentFilters.priceMax || '';
    if (filterDistanceSlider) {
        filterDistanceSlider.value = currentFilters.distance || 25; // 25km par défaut
        updateDistanceDisplay(); // Mettre à jour l'affichage textuel
    }
    if (filterSortByField) filterSortByField.value = currentFilters.sortBy || 'createdAt_desc';
}

/**
 * Met à jour l'affichage de la valeur du slider de distance.
 */
function updateDistanceDisplay() {
    if (filterDistanceSlider && filterDistanceValueDisplay) {
        filterDistanceValueDisplay.textContent = `${filterDistanceSlider.value} km`;
    }
}

/**
 * Remplit le select des catégories dans le formulaire de filtres.
 */
function populateFilterCategories() {
    const categories = state.getCategories(); // Récupère les catégories depuis state.js
    if (filterCategoryField && categories.length > 0) {
        const currentValue = filterCategoryField.value; // Sauver la valeur actuelle si elle existe

        // Garder la première option "Toutes les catégories" si elle existe
        const firstOption = filterCategoryField.querySelector('option[value=""]');
        filterCategoryField.innerHTML = ''; // Vider les options existantes
        if (firstOption) filterCategoryField.appendChild(firstOption);

        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = sanitizeHTML(cat.name);
            filterCategoryField.appendChild(option);
        });
        filterCategoryField.value = currentValue; // Restaurer la valeur si possible
    }
}

/**
 * Gère la soumission du formulaire de filtres (application des filtres).
 * @param {Event} event - L'événement de soumission.
 */
function handleApplyFilters(event) {
    event.preventDefault();
    if (!filtersForm) return;

    const newFilters = {
        keywords: filterKeywordsField ? filterKeywordsField.value.trim() : '',
        category: filterCategoryField ? filterCategoryField.value : '',
        priceMin: filterPriceMinField && filterPriceMinField.value ? parseFloat(filterPriceMinField.value) : null,
        priceMax: filterPriceMaxField && filterPriceMaxField.value ? parseFloat(filterPriceMaxField.value) : null,
        distance: filterDistanceSlider ? parseInt(filterDistanceSlider.value) : 25,
        sortBy: filterSortByField ? filterSortByField.value : 'createdAt_desc',
    };

    // Validation simple des prix
    if (newFilters.priceMin !== null && newFilters.priceMax !== null && newFilters.priceMin > newFilters.priceMax) {
        showToast("Le prix minimum ne peut pas être supérieur au prix maximum.", "error");
        if (filterPriceMinField) filterPriceMinField.focus();
        return;
    }

    // Mettre à jour l'état global des filtres
    // Il est important de passer un nouvel objet pour que la détection de changement fonctionne bien.
    const currentFilters = state.getFilters();
    state.set('filters', {
        ...currentFilters, // Garder les filtres non gérés par ce formulaire (ex: lat/lng pour la recherche)
        ...newFilters
    });

    showToast("Filtres appliqués !", "success");
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', {
        detail: {
            modalId: 'filters-modal'
        }
    }));

    // Un événement 'filtersChanged' sera dispatché par state.set(),
    // les modules ads.js et map.js devraient y réagir pour mettre à jour l'affichage.
    // On peut aussi dispatcher un événement plus spécifique si besoin :
    document.dispatchEvent(new CustomEvent('mapMarket:filtersApplied', {
        detail: state.getFilters()
    }));
}

/**
 * Gère la réinitialisation du formulaire de filtres.
 * L'événement 'reset' sur le formulaire vide déjà les champs.
 * On doit s'assurer que l'état global est aussi mis à jour.
 * @param {Event} event - L'événement de réinitialisation du formulaire.
 */
function handleResetFiltersForm(event) {
    // L'événement reset du formulaire a déjà vidé les champs.
    // Il faut mettre à jour l'affichage du slider de distance manuellement après le reset.
    if (filterDistanceSlider && filterDistanceValueDisplay) {
        // Le slider est réinitialisé à sa valeur HTML 'value' ou à la première valeur si non spécifié.
        // Forçons la valeur par défaut de l'état initial des filtres.
        const initialFilters = state.initialState?.filters || { distance: 25, sortBy: 'createdAt_desc' };
        filterDistanceSlider.value = initialFilters.distance;
        updateDistanceDisplay();
        if(filterSortByField) filterSortByField.value = initialFilters.sortBy;
    }


    const defaultFilters = {
        keywords: '',
        category: '',
        priceMin: null,
        priceMax: null,
        distance: state.initialState?.filters?.distance || 25,
        sortBy: state.initialState?.filters?.sortBy || 'createdAt_desc',
    };

    const currentFilters = state.getFilters();
    state.set('filters', {
        ...currentFilters, // Garder les filtres non gérés par ce formulaire
        ...defaultFilters
    });

    showToast("Filtres réinitialisés.", "info");
    // Pas besoin de fermer la modale ici, l'utilisateur peut vouloir appliquer les filtres réinitialisés.
    // Si on veut fermer:
    // document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'filters-modal' } }));

    document.dispatchEvent(new CustomEvent('mapMarket:filtersApplied', {
        detail: state.getFilters() // Envoyer les filtres réinitialisés
    }));
}


/**
 * Initialise le module des filtres.
 */
export function init() {
    initFiltersUI();
    // Charger les filtres initiaux depuis l'état au cas où ils auraient été persistés
    // loadFiltersFromState(); // Fait à l'ouverture de la modale
    console.log('Module Filters initialisé.');
}

// L'initialisation sera appelée depuis main.js
// init();
