// js/state.js

/**
 * @file state.js
 * @description Gestionnaire d'état global pour MapMarket.
 * Centralise l'état de l'application (utilisateur, annonces, filtres, UI, etc.)
 * et fournit des mécanismes pour y accéder, le modifier et s'abonner aux changements.
 * Le token JWT n'est JAMAIS stocké dans cet état JavaScript.
 */

import { generateUUID } from './utils.js';

const LOCAL_STORAGE_KEY = 'mapMarketAppState';

// Définition des catégories en dur
const HARDCODED_CATEGORIES = [
    { id: "immobilier", name: "Immobilier", icon: "fa-solid fa-house-chimney", color: "var(--category-immobilier-color)" },
    { id: "vehicules", name: "Véhicules", icon: "fa-solid fa-car", color: "var(--category-vehicules-color)" },
    { id: "electronique", name: "Électronique", icon: "fa-solid fa-mobile-screen-button", color: "var(--category-electronique-color)" },
    { id: "mode", name: "Mode & Accessoires", icon: "fa-solid fa-shirt", color: "var(--category-mode-color)" },
    { id: "maison", name: "Maison & Jardin", icon: "fa-solid fa-couch", color: "var(--category-maison-color)" },
    { id: "loisirs", name: "Loisirs & Divertissement", icon: "fa-solid fa-puzzle-piece", color: "var(--category-loisirs-color)" },
    { id: "services", name: "Services", icon: "fa-solid fa-handshake-angle", color: "var(--category-services-color)" },
    { id: "autres", name: "Autres", icon: "fa-solid fa-ellipsis", color: "var(--category-autres-color)" }
];

// État initial de l'application
const initialState = {
    currentUser: null,
    ads: [],
    allAds: [],
    favorites: [],
    alerts: [],
    messages: {
        threads: [],
        activeThreadId: null,
        unreadGlobalCount: 0,
    },
    notifications: {
        list: [],
        unreadCount: 0,
    },
    filters: {
        keywords: '',
        category: '',
        priceMin: null,
        priceMax: null,
        distance: 25,
        sortBy: 'createdAt_desc',
        latitude: null,
        longitude: null,
    },
    ui: {
        darkMode: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches,
        language: navigator.language.split('-')[0] || 'fr',
        isOnline: navigator.onLine,
        currentOpenModal: null,
        map: {
            center: null,
            zoom: null,
            userPosition: null,
            tempMarkerPosition: null,
        },
        isLoading: false,
    },
    onboardingCompleted: false,
    categories: [], // Sera initialisé avec HARDCODED_CATEGORIES
    appSettings: {
        pushNotificationsEnabled: true,
        emailNotificationsEnabled: true,
    },
    appSettings: { // Nouvel objet pour les préférences
        pushNotificationsEnabled: true, // Peut être géré par localStorage aussi
        emailNotificationsEnabled: true,
    }
};

let _state = JSON.parse(JSON.stringify(initialState)); // Deep copy pour l'état initial de travail
_state.categories = [...HARDCODED_CATEGORIES]; // Initialiser avec les catégories en dur

const _listeners = {};

function _notify(event, data) {
    if (_listeners[event]) {
        _listeners[event].forEach(listener => {
            try {
                listener(data);
            } catch (error) {
                console.error(`Erreur dans un listener pour l'événement ${event}:`, error);
            }
        });
    }
    document.dispatchEvent(new CustomEvent(`mapMarket:${event}`, { detail: data }));
}

export function get(key) {
    const keys = key.split('.');
    let currentStatePart = _state;
    for (const k of keys) {
        if (currentStatePart && typeof currentStatePart === 'object' && k in currentStatePart) {
            currentStatePart = currentStatePart[k];
        } else {
            return undefined;
        }
    }
    if (typeof currentStatePart === 'object' && currentStatePart !== null) {
        return Array.isArray(currentStatePart) ? [...currentStatePart] : { ...currentStatePart };
    }
    return currentStatePart;
}

export function set(key, value, silent = false) {
    const keys = key.split('.');
    let currentStatePart = _state;
    for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!currentStatePart[k] || typeof currentStatePart[k] !== 'object') {
            currentStatePart[k] = {};
        }
        currentStatePart = currentStatePart[k];
    }
    currentStatePart[keys[keys.length - 1]] = value;

    if (!silent) {
        _notify(key + 'Changed', value);
        const mainCategory = keys[0] + 'Changed';
        if (keys.length > 1 && mainCategory !== key + 'Changed') {
            _notify(mainCategory, get(keys[0]));
        }
        persistState();
    }
}

export function subscribe(event, listener) {
    if (!_listeners[event]) {
        _listeners[event] = [];
    }
    _listeners[event].push(listener);
    return () => unsubscribe(event, listener);
}

export function unsubscribe(event, listener) {
    if (_listeners[event]) {
        _listeners[event] = _listeners[event].filter(l => l !== listener);
    }
}

export function persistState() {
    try {
        const stateToPersist = {
            filters: _state.filters,
            ui: {
                darkMode: _state.ui.darkMode,
                language: _state.ui.language,
                map: _state.ui.map,
            },
            onboardingCompleted: _state.onboardingCompleted,
            // Les catégories sont maintenant en dur, pas besoin de les persister si elles ne changent pas.
            // Si elles devenaient modifiables par l'utilisateur, il faudrait les persister.
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToPersist));
    } catch (error) {
        console.warn("Erreur lors de la persistance de l'état dans localStorage:", error);
    }
}

export function hydrateState() {
    try {
        const persistedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (persistedStateJSON) {
            const persistedState = JSON.parse(persistedStateJSON);
            if (persistedState.filters) _state.filters = { ..._state.filters, ...persistedState.filters };
            if (persistedState.ui) {
                if (persistedState.ui.darkMode !== undefined) _state.ui.darkMode = persistedState.ui.darkMode;
                if (persistedState.ui.language) _state.ui.language = persistedState.ui.language;
                if (persistedState.ui.map) _state.ui.map = { ..._state.ui.map, ...persistedState.ui.map };
            }
            if (persistedState.onboardingCompleted !== undefined) _state.onboardingCompleted = persistedState.onboardingCompleted;
        }
        // Assurer que les catégories sont toujours celles en dur après l'hydratation
        // (au cas où elles auraient été stockées dans une version précédente)
        _state.categories = [...HARDCODED_CATEGORIES];

        document.documentElement.classList.toggle('dark-mode', _state.ui.darkMode);
        document.documentElement.lang = _state.ui.language;

        console.log('État hydraté depuis localStorage:', _state);
    } catch (error) {
        console.warn("Erreur lors de l'hydratation de l'état depuis localStorage:", error);
        _state.categories = [...HARDCODED_CATEGORIES]; // S'assurer que les catégories sont là même en cas d'erreur
    }
}

export function resetState(keepUiPreferences = false) {
    const uiPreferences = keepUiPreferences ? {
        darkMode: _state.ui.darkMode,
        language: _state.ui.language,
        map: _state.ui.map,
    } : {
        darkMode: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches,
        language: navigator.language.split('-')[0] || 'fr',
        map: initialState.ui.map, // Utiliser la carte de l'état initial de base
    };

    _state = JSON.parse(JSON.stringify(initialState)); // Recréer à partir de la base
    _state.ui = {
        ..._state.ui, // Prendre les valeurs par défaut de ui d'initialState
        ...uiPreferences, // Puis écraser avec les préférences conservées/calculées
        isOnline: navigator.onLine,
    };
    _state.categories = [...HARDCODED_CATEGORIES]; // Toujours réinitialiser avec les catégories en dur

    _notify('currentUserChanged', null);
    _notify('adsChanged', _state.ads);
    _notify('favoritesChanged', _state.favorites);
    _notify('alertsChanged', _state.alerts);
    _notify('messagesChanged', _state.messages);
    _notify('notificationsChanged', _state.notifications);
    _notify('filtersChanged', _state.filters);
    _notify('uiChanged', _state.ui);
    _notify('categoriesChanged', _state.categories); // Notifier que les catégories sont (ré)initialisées
    _notify('stateReset', _state);

    persistState();
    console.log('État réinitialisé.');
}

function handleOnlineStatusChange() {
    set('ui.isOnline', navigator.onLine);
    const offlineIndicator = document.getElementById('offline-indicator-container');
    if (offlineIndicator) {
        offlineIndicator.classList.toggle('hidden', navigator.onLine);
    }
    _notify('onlineStatusChanged', {
        isOnline: navigator.onLine
    });
}

export function init() {
    hydrateState(); // Charge l'état persisté ET initialise les catégories avec HARDCODED_CATEGORIES
    window.addEventListener('online', handleOnlineStatusChange);
    window.addEventListener('offline', handleOnlineStatusChange);
    handleOnlineStatusChange(); // Initialiser au démarrage

    _notify('stateReady', _state);
    _notify('categoriesChanged', _state.categories); // Notifier que les catégories sont prêtes
    console.log('Module State initialisé (avec catégories en dur).');
}

// Getters et Setters spécifiques (Exemples)
export function getCurrentUser() { return get('currentUser'); }
export function setCurrentUser(userData) { set('currentUser', userData); }
export function getFilters() { return get('filters'); }
export function updateFilter(filterKey, filterValue) { set(`filters.${filterKey}`, filterValue); }
export function setAds(adsData) { set('ads', adsData); }
export function addAd(adData) { const currentAds = get('ads'); set('ads', [...currentAds, adData]); }
export function updateAd(updatedAd) {
    const currentAds = get('ads');
    const adIndex = currentAds.findIndex(ad => ad.id === updatedAd.id);
    if (adIndex > -1) {
        const newAds = [...currentAds];
        newAds[adIndex] = { ...newAds[adIndex], ...updatedAd };
        set('ads', newAds);
    }
}
export function removeAd(adId) { const currentAds = get('ads'); set('ads', currentAds.filter(ad => ad.id !== adId)); }
export function getCategories() { return get('categories'); }
export function setFavorites(favoriteAds) {
    const ids = favoriteAds.map(ad => ad._id || ad.id || ad);
    set('favorites', ids);
}
export function isFavorite(adId) {
    const favs = get('favorites') || [];
    return favs.includes(adId);
}
export function addFavorite(adId) {
    const favs = get('favorites') || [];
    if (!favs.includes(adId)) {
        set('favorites', [...favs, adId]);
    }
}
export function removeFavorite(adId) {
    const favs = get('favorites') || [];
    if (favs.includes(adId)) {
        set('favorites', favs.filter(id => id !== adId));
    }
}
// setCategories n'est plus nécessaire si elles sont en dur et non modifiables,
// mais on le garde au cas où, pour la cohérence.
export function setCategories(categoriesData) {
    // Si vous permettez de modifier les catégories en dur via une action (peu probable),
    // sinon cette fonction ne devrait pas être utilisée si les catégories sont fixes.
    // Pour l'instant, on la laisse mais on s'attend à ce qu'elles soient initialisées et fixes.
    set('categories', categoriesData);
}
export function isDarkMode() { return get('ui.darkMode'); }
export function toggleDarkMode(isDark) {
    const newDarkModeState = typeof isDark === 'boolean' ? isDark : !get('ui.darkMode');
    set('ui.darkMode', newDarkModeState);
    document.documentElement.classList.toggle('dark-mode', newDarkModeState);
}
export function getLanguage() { return get('ui.language'); }
export function setLanguage(langCode) {
    set('ui.language', langCode);
    document.documentElement.lang = langCode;
}
export function getMapState() { return get('ui.map'); }
export function setMapState(mapStateChanges) {
    const currentMapState = get('ui.map');
    set('ui.map', { ...currentMapState, ...mapStateChanges });
}

console.log('state.js chargé (avec catégories en dur).');
