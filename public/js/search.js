// public/js/search.js
import * as state from './state.js';
import { sanitizeHTML } from './utils.js';

const RECENT_SEARCHES_KEY = 'mapMarketRecentSearches';
const MAX_RECENT_SEARCHES = 4;
const BODY_ACTIVE_CLASS = 'search-overlay-active';

let searchOverlay, showSearchBtn, closeSearchBtn, searchInput, mainSearchButton;

let recentSearchesContainer, trendingCategoriesContainer;

export function init() {
    searchOverlay = document.getElementById('header-search-bar-wrapper');
    showSearchBtn = document.getElementById('header-show-search-btn');
    closeSearchBtn = document.getElementById('close-search-bar-btn');
    searchInput = document.getElementById('main-search-input');
    mainSearchButton = document.getElementById('main-search-button');
    recentSearchesContainer = document.getElementById('recent-searches');
    trendingCategoriesContainer = document.getElementById('trending-categories');

    if (!searchOverlay || !showSearchBtn || !closeSearchBtn || !searchInput) {
        console.warn('Search overlay: un ou plusieurs éléments DOM sont manquants.');
        return;
    }

    showSearchBtn.addEventListener('click', openSearchOverlay);
    closeSearchBtn.addEventListener('click', closeSearchOverlay);
    mainSearchButton?.addEventListener('click', executeSearch);

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeSearch();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !searchOverlay.classList.contains('hidden')) {
            closeSearchOverlay();
        }
    });
    console.log('Module Search initialisé.');
}

function openSearchOverlay() {
    searchOverlay.classList.remove('hidden');
    searchOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add(BODY_ACTIVE_CLASS);
    showSearchBtn.setAttribute('aria-expanded', 'true');
    renderRecentSearches();
    renderTrendingCategories();
    searchInput.focus();
}

function closeSearchOverlay() {
    searchOverlay.classList.add('hidden');
    searchOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove(BODY_ACTIVE_CLASS);
    showSearchBtn.setAttribute('aria-expanded', 'false');
    if (document.activeElement === searchInput || searchOverlay.contains(document.activeElement)) {
       showSearchBtn.focus();
    }
}

function executeSearch() {
    const term = searchInput.value.trim();
    if (!term) return;

    saveSearchTerm(term);
    const currentFilters = state.get('filters');
    state.set('filters', { ...currentFilters, keywords: term });
    document.dispatchEvent(new CustomEvent('mapMarket:filtersApplied', { detail: state.get('filters') }));
    closeSearchOverlay();
}

function saveSearchTerm(term) {
    if (!term) return;
    let searches = [];
    try {
        searches = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    } catch(e) {
        console.error("Impossible de parser les recherches récentes:", e);
        searches = [];
    }
    
    // Supprimer le terme s'il existe déjà pour le remonter en tête
    const lowerCaseTerm = term.toLowerCase();
    searches = searches.filter(s => s.toLowerCase() !== lowerCaseTerm);
    searches.unshift(term);
    
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES)));
}

function renderRecentSearches() {
    if (!recentSearchesContainer) return;
    let searches = [];
    try {
        searches = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    } catch(e) {
        searches = [];
    }

    recentSearchesContainer.innerHTML = '';
    if (searches.length === 0) {
        recentSearchesContainer.classList.add('hidden');
        return;
    }
    
    recentSearchesContainer.classList.remove('hidden');
    const title = document.createElement('h4');
    title.textContent = 'Recherches Récentes';
    recentSearchesContainer.appendChild(title);
    
    const list = document.createElement('div');
    list.className = 'suggestion-list';
    
    searches.forEach(term => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'suggestion-item';
        btn.innerHTML = `<i class="fa-solid fa-history"></i> <span>${sanitizeHTML(term)}</span>`;
        btn.addEventListener('click', () => {
            searchInput.value = term;
            executeSearch();
        });
        list.appendChild(btn);
    });
    recentSearchesContainer.appendChild(list);
}

function renderTrendingCategories() {
    if (!trendingCategoriesContainer) return;
    const categories = state.getCategories();
    trendingCategoriesContainer.innerHTML = '';
    if (!categories || categories.length === 0) {
        trendingCategoriesContainer.classList.add('hidden');
        return;
    }

    trendingCategoriesContainer.classList.remove('hidden');
    const title = document.createElement('h4');
    title.textContent = 'Catégories Populaires';
    trendingCategoriesContainer.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'trending-categories-section'; // Utilise la classe du conteneur pour le style des "chips"

    categories.slice(0, 8).forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'trend-chip';
        btn.dataset.categoryId = cat.id;
        btn.innerHTML = `<i class="${cat.icon || 'fa-solid fa-tag'}"></i> ${sanitizeHTML(cat.name)}`;
        btn.addEventListener('click', () => {
            const currentFilters = state.get('filters');
            state.set('filters', { ...currentFilters, category: cat.id, keywords: '' });
            document.dispatchEvent(new CustomEvent('mapMarket:filtersApplied', { detail: state.get('filters') }));
            closeSearchOverlay();
        });
        grid.appendChild(btn);
    });
    trendingCategoriesContainer.appendChild(grid);
}
