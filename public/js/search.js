// js/search.js

import * as state from './state.js';

const RECENT_KEY = 'mapMarketRecentSearches';
const BODY_ACTIVE_CLASS = 'search-overlay-active';

export function init() {
    const headerShowSearchBtn = document.getElementById('header-show-search-btn');
    const searchBarWrapper = document.getElementById('header-search-bar-wrapper');
    const closeSearchBarBtn = document.getElementById('close-search-bar-btn');
    const mainSearchInput = document.getElementById('main-search-input');
    const mainSearchButton = document.getElementById('main-search-button');

    if (!headerShowSearchBtn || !searchBarWrapper || !closeSearchBarBtn || !mainSearchInput) {
        console.warn('Search overlay: éléments manquants.');
        return;
    }

    headerShowSearchBtn.addEventListener('click', openOverlay);
    closeSearchBarBtn.addEventListener('click', closeOverlay);
    mainSearchButton?.addEventListener('click', executeSearch);

    mainSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeSearch();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !searchBarWrapper.classList.contains('hidden')) {
            closeOverlay();
        }
    });

    renderRecentSearches();
    renderTrendingCategories();

    function openOverlay() {
        searchBarWrapper.classList.remove('hidden');
        searchBarWrapper.setAttribute('aria-hidden', 'false');
        document.body.classList.add(BODY_ACTIVE_CLASS);
        headerShowSearchBtn.setAttribute('aria-expanded', 'true');
        renderRecentSearches();
        renderTrendingCategories();
        mainSearchInput.focus();
    }

    function closeOverlay() {
        searchBarWrapper.classList.add('hidden');
        searchBarWrapper.setAttribute('aria-hidden', 'true');
        document.body.classList.remove(BODY_ACTIVE_CLASS);
        headerShowSearchBtn.setAttribute('aria-expanded', 'false');
        headerShowSearchBtn.focus();
    }

    function executeSearch() {
        const term = mainSearchInput.value.trim();
        if (!term) return;
        saveSearchTerm(term);
        const current = state.get('filters');
        state.set('filters', { ...current, keywords: term });
        document.dispatchEvent(new CustomEvent('mapMarket:filtersApplied', { detail: state.get('filters') }));
        closeOverlay();
    }
}

export function saveSearchTerm(term) {
    if (!term) return;
    const items = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const trimmed = term.trim();
    const existingIdx = items.indexOf(trimmed);
    if (existingIdx !== -1) items.splice(existingIdx, 1);
    items.unshift(trimmed);
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 3)));
}

export function renderRecentSearches() {
    const container = document.getElementById('recent-searches');
    if (!container) return;
    container.innerHTML = '';
    const searches = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    if (!searches.length) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    const fragment = document.createDocumentFragment();
    searches.forEach(term => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'recent-search-item';
        btn.textContent = term;
        btn.addEventListener('click', () => {
            const input = document.getElementById('main-search-input');
            if (input) input.value = term;
            document.getElementById('main-search-button')?.click();
        });
        fragment.appendChild(btn);
    });
    container.appendChild(fragment);
}

export function renderTrendingCategories() {
    const container = document.getElementById('trending-categories');
    if (!container) return;
    container.innerHTML = '';
    const categories = state.getCategories();
    const fragment = document.createDocumentFragment();
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'trend-chip';
        btn.textContent = cat.name;
        btn.dataset.categoryId = cat.id;
        btn.addEventListener('click', () => {
            const filters = state.get('filters');
            state.set('filters', { ...filters, category: cat.id });
            document.dispatchEvent(new CustomEvent('mapMarket:filtersApplied', { detail: state.get('filters') }));
            const closeBtn = document.getElementById('close-search-bar-btn');
            closeBtn?.click();
        });
        fragment.appendChild(btn);
    });
    container.appendChild(fragment);
}
