/**
 * @file filters.js
 * @description Module de gestion des filtres pour MapMarket
 */

import * as state from './state.js';
import { showToast, debounce } from './utils.js';
import * as Ads from './ads.js';

const FiltersModule = (() => {
    const SORT_OPTIONS = [
        { value: 'createdAt_desc', label: 'Plus récentes', icon: 'fa-solid fa-clock-rotate-left' },
        { value: 'createdAt_asc', label: 'Plus anciennes', icon: 'fa-solid fa-hourglass-start' },
        { value: 'price_asc', label: 'Prix croissant', icon: 'fa-solid fa-arrow-up-wide-short' },
        { value: 'price_desc', label: 'Prix décroissant', icon: 'fa-solid fa-arrow-down-wide-short' },
        { value: 'distance_asc', label: 'Plus proches', icon: 'fa-solid fa-location-dot' }
    ];

    const DEFAULT_RADIUS = 25; // km
    const MAX_RADIUS = 100; // km

    const DOM = {};

    const updateRadiusDisplay = () => {
        if (DOM.radiusSlider && DOM.radiusDisplay) {
            DOM.radiusDisplay.textContent = `${DOM.radiusSlider.value} km`;
        }
    };

    const renderCategoryPills = () => {
        if (!DOM.categoryPillsContainer) return;

        const categories = state.get('categories') || [];
        DOM.categoryPillsContainer.innerHTML = '';

        // Option "Toutes"
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = 'category-pill';
        allBtn.dataset.categoryId = 'toutes';
        allBtn.innerHTML = '<i class="fa-solid fa-border-all"></i> Toutes';
        if (!state.get('filters.category')) allBtn.classList.add('active');
        allBtn.addEventListener('click', () => {
            state.set('filters.category', '');
            renderCategoryPills();
        });
        DOM.categoryPillsContainer.appendChild(allBtn);

        // Catégories
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'category-pill';
            btn.dataset.categoryId = cat.id;
            btn.innerHTML = `<i class="${cat.icon}"></i> ${cat.name}`;
            if (state.get('filters.category') === cat.id) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                state.set('filters.category', cat.id);
                renderCategoryPills();
            });
            DOM.categoryPillsContainer.appendChild(btn);
        });
    };

    const renderSortOptions = () => {
        if (!DOM.sortSelect) return;

        DOM.sortSelect.innerHTML = '';
        SORT_OPTIONS.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.innerHTML = `<i class="${option.icon}"></i> ${option.label}`;
            if (state.get('filters.sortBy') === option.value) {
                opt.selected = true;
            }
            DOM.sortSelect.appendChild(opt);
        });
    };

    const bindEvents = () => {
        if (!DOM.form) return;

        DOM.form.addEventListener('submit', (e) => {
            e.preventDefault();
            Ads.fetchAllAdsAndRenderOnMap();
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', {
                detail: { modalId: 'filters-modal' }
            }));
        });

        DOM.resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            state.set('filters', {
                keywords: '',
                category: '',
                priceMin: null,
                priceMax: null,
                radius: DEFAULT_RADIUS,
                sortBy: 'createdAt_desc'
            });
            DOM.form.reset();
            DOM.radiusSlider.value = DEFAULT_RADIUS;
            updateRadiusDisplay();
            renderCategoryPills();
            renderSortOptions();
        });

        if (DOM.keywordsInput) {
            DOM.keywordsInput.addEventListener('input', debounce((e) => {
                state.set('filters.keywords', e.target.value.trim());
            }, 500));
        }

        if (DOM.radiusSlider) {
            DOM.radiusSlider.addEventListener('input', debounce((e) => {
                state.set('filters.radius', parseInt(e.target.value, 10));
                updateRadiusDisplay();
            }, 300));
        }

        if (DOM.sortSelect) {
            DOM.sortSelect.addEventListener('change', (e) => {
                state.set('filters.sortBy', e.target.value);
            });
        }
    };

    const syncUIWithState = () => {
        const filters = state.get('filters') || {};
        
        if (DOM.keywordsInput) DOM.keywordsInput.value = filters.keywords || '';
        if (DOM.priceMinInput) DOM.priceMinInput.value = filters.priceMin || '';
        if (DOM.priceMaxInput) DOM.priceMaxInput.value = filters.priceMax || '';
        if (DOM.radiusSlider) DOM.radiusSlider.value = filters.radius || DEFAULT_RADIUS;
        
        updateRadiusDisplay();
        renderCategoryPills();
        renderSortOptions();
    };

    const init = () => {
        DOM.modal = document.getElementById('filters-modal');
        DOM.form = document.getElementById('filters-form');
        DOM.keywordsInput = document.getElementById('filter-keywords');
        DOM.categoryPillsContainer = document.getElementById('filter-category-pills');
        DOM.priceMinInput = document.getElementById('filter-price-min');
        DOM.priceMaxInput = document.getElementById('filter-price-max');
        DOM.radiusSlider = document.getElementById('filter-distance');
        DOM.radiusDisplay = document.getElementById('filter-distance-value');
        DOM.sortSelect = document.getElementById('filter-sort-by');
        DOM.applyBtn = document.getElementById('filters-apply-btn');
        DOM.resetBtn = document.getElementById('filters-reset-btn');

        if (!DOM.form) {
            console.error('Filters: éléments du formulaire manquants.');
            return;
        }

        syncUIWithState();
        bindEvents();

        state.subscribe('categoriesChanged', renderCategoryPills);
    };

    return {
        init,
        getCurrentFilters: () => state.get('filters')
    };
})();

export const init = FiltersModule.init;
export const getCurrentFilters = FiltersModule.getCurrentFilters;