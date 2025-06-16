const createStore = (initialState) => {
    let state = initialState || {};
    const listeners = new Set();

    const notify = () => {
        for (const listener of listeners) {
            try {
                listener({ ...state });
            } catch (err) {
                console.error('Store listener error:', err);
            }
        }
    };

    return {
        getState() {
            return { ...state };
        },
        setState(newState) {
            state = { ...state, ...newState };
            notify();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        unsubscribe(listener) {
            listeners.delete(listener);
        }
    };
};

// Initial state extracted from previous state.js
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
    categories: [],
    appSettings: {
        pushNotificationsEnabled: true,
        emailNotificationsEnabled: true,
    }
};

const store = createStore(initialState);
export default store;

// Helper functions mirroring the old state.js API
export const get = (key) => {
    const keys = key.split('.');
    let value = store.getState();
    for (const k of keys) {
        value = value ? value[k] : undefined;
    }
    if (Array.isArray(value)) return [...value];
    if (value && typeof value === 'object') return { ...value };
    return value;
};

export const set = (key, val) => {
    const keys = key.split('.');
    const current = store.getState();
    let nested = { ...current };
    let pointer = nested;
    for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        pointer[k] = { ...(pointer[k] || {}) };
        pointer = pointer[k];
    }
    pointer[keys[keys.length - 1]] = val;
    store.setState(nested);
};

export const subscribe = (listener) => store.subscribe(listener);
export const unsubscribe = (listener) => store.unsubscribe(listener);

export const getCurrentUser = () => get('currentUser');
export const setCurrentUser = (user) => set('currentUser', user);
export const getCategories = () => get('categories');
export const setAds = (ads) => set('ads', ads);
export const setFavorites = (fav) => set('favorites', fav);
export const addFavorite = (id) => {
    const favs = get('favorites') || [];
    if (!favs.includes(id)) set('favorites', [...favs, id]);
};
export const removeFavorite = (id) => {
    const favs = get('favorites') || [];
    set('favorites', favs.filter(f => f !== id));
};
export const isFavorite = (id) => {
    const favs = get('favorites') || [];
    return favs.includes(id);
};
export const getMapState = () => get('ui.map');
export const setMapState = (changes) => {
    const mapState = get('ui.map') || {};
    set('ui.map', { ...mapState, ...changes });
};
export const toggleDarkMode = (val) => {
    const current = get('ui.darkMode');
    const newVal = typeof val === 'boolean' ? val : !current;
    set('ui.darkMode', newVal);
    document.documentElement.classList.toggle('dark-mode', newVal);
};
export const setLanguage = (lang) => {
    set('ui.language', lang);
    document.documentElement.lang = lang;
};

