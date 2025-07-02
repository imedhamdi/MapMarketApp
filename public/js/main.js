// js/main.js

/**
 * @file main.js
 * @description Point d'entrée principal de l'application MapMarket.
 * Gère l'initialisation de tous les modules et les configurations globales.
 */

import * as Utils from './utils.js';
import * as State from './state.js';
import * as Auth from './auth.js';
import * as Modals from './modals.js';
import * as MapCtrl from './map.js';
import * as Ads from './ads.js';
import * as Favorites from './favorites.js';
import * as Profile from './profile.js';
import * as Filters from './filters.js';
import * as Alerts from './alerts.js';
import * as Messages from './messages.js';
import * as PWA from './pwa.js';
import * as Onboarding from './onboarding.js';
import * as History from './history.js';
import * as Settings from './settings.js';
import * as NotificationsDisplay from './notifications.js';

let socket; // Socket.IO global

function connectSocket() {
    const token = localStorage.getItem('mapmarket_auth_token');
    if (!token) return;
    socket = io({ auth: { token } });
    socket.on('unreadCountUpdated', (newCount) => {
        const badge = document.getElementById('messages-nav-badge');
        if (badge) {
            badge.textContent = newCount > 0 ? newCount : '';
            badge.classList.toggle('hidden', newCount <= 0);
        }
    });
}

function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

class App {
    constructor() {
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) {
            console.warn("MapMarket App: Déjà initialisée.");
            return;
        }
        console.log("MapMarket App: Initialisation en cours...");
        try {
            State.init();
            Modals.init();
            Auth.init();
            PWA.init();
            Settings.init();
            MapCtrl.init();
            Ads.init();
            Filters.init();
            Alerts.init();
            Favorites.init();
            Profile.init();
            Messages.init();
            History.init();
            NotificationsDisplay.init();
            Onboarding.init();

            this.setupGlobalEventListeners();
            this.setupGlobalUIHelpers();

            this.isInitialized = true;
            console.log("MapMarket App: Initialisation terminée avec succès.");
            if (State.get('onboardingCompleted')) {
                setTimeout(() => {
                    Utils.showToast("Bienvenue de retour sur MapMarket !", "info", 3000);
                }, 1500);
            }
        } catch (error) {
            console.error("MapMarket App: Erreur critique lors de l'initialisation:", error);
            Utils.showToast("Erreur critique lors du chargement de l'application.", "error", 0);
            const appRoot = document.getElementById('app-root');
            if (appRoot) {
                appRoot.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: red;">
                        <h1>Erreur de chargement</h1>
                        <p>MapMarket n'a pas pu démarrer correctement. Veuillez réessayer plus tard.</p>
                    </div>`;
            }
        }
    }

    setupGlobalEventListeners() {
        // --- Boutons de l'en-tête (Profil, Filtres, Notifications) ---
        const headerProfileBtn = document.getElementById('header-profile-btn');
        if (headerProfileBtn) {
            headerProfileBtn.addEventListener('click', () => {
                const isLoggedIn = headerProfileBtn.dataset.userLoggedIn === 'true';
                const modalToOpen = isLoggedIn ? 'profile-modal' : 'auth-modal';
                document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                    detail: { modalId: modalToOpen, triggerElement: headerProfileBtn }
                }));
                if (modalToOpen === 'auth-modal' && typeof Auth.switchAuthView === 'function') {
                    Auth.switchAuthView('login');
                }
            });
        }

        const headerFilterBtn = document.getElementById('header-filter-btn');
        if (headerFilterBtn) {
            headerFilterBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                    detail: { modalId: 'filters-modal', triggerElement: headerFilterBtn }
                }));
            });
        }

        const headerNotificationsBtn = document.getElementById('header-notifications-btn');
        if (headerNotificationsBtn) {
            headerNotificationsBtn.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                    detail: { modalId: 'notifications-panel', triggerElement: headerNotificationsBtn }
                }));
            });
        }

        // --- Navigation inférieure ---
        const navButtons = document.querySelectorAll('#bottom-navigation .nav-btn');
        navButtons.forEach(button => {
            button.addEventListener('click', function(event) {
                navButtons.forEach(btn => {
                    btn.classList.remove('active');
                    btn.removeAttribute('aria-current');
                });
                this.classList.add('active');
                this.setAttribute('aria-current', 'page');

                const modalId = this.getAttribute('aria-controls');

                if (this.id === 'nav-explore-btn') {
                    console.log("Bouton Explorer cliqué - Vue carte active.");
                    if (typeof MapCtrl.geolocateUser === 'function') {
                        MapCtrl.geolocateUser(true);
                    }
                    document.dispatchEvent(new CustomEvent('mapmarket:closeAllModals'));
                } else if (this.id === 'nav-publish-ad-btn') {
                    const currentUser = State.getCurrentUser();
                    if (!currentUser) {
                        Utils.showToast("Veuillez vous connecter pour publier une annonce.", "warning");
                        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal' }}));
                        if (typeof Auth.switchAuthView === 'function') Auth.switchAuthView('login');
                        // Réinitialiser le bouton actif sur Explorer
                        document.querySelector('#nav-explore-btn')?.classList.add('active');
                        document.querySelector('#nav-explore-btn')?.setAttribute('aria-current', 'page');
                        this.classList.remove('active');
                        this.removeAttribute('aria-current');
                        return;
                    }
                    if (typeof Ads.prepareAdFormForCreate === 'function') {
                        Ads.prepareAdFormForCreate();
                    }
                    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                        detail: { modalId: 'ad-form-modal', triggerElement: this }
                    }));
                } else if (modalId) { // Pour Favoris, Messages, Plus
                    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                        detail: { modalId: modalId, triggerElement: this }
                    }));
                }
            });
        });

        // --- Gestion des boutons dans la modale "Plus d'options" ---
        const moreOptionsModal = document.getElementById('more-options-modal');
        if (moreOptionsModal) {
            moreOptionsModal.addEventListener('click', (event) => {
                const targetButton = event.target.closest('.more-option-item');
                if (!targetButton) return;

                const modalToClose = 'more-options-modal';
                let shouldCloseMoreOptions = true;
                let modalToOpenAfterMore = null;
                let triggerForNextModal = targetButton;

                if (targetButton.id === 'more-my-ads-btn') {
                    const currentUser = State.getCurrentUser();
                    if (!currentUser) {
                        Utils.showToast("Veuillez vous connecter pour voir vos annonces.", "warning");
                        modalToOpenAfterMore = 'auth-modal';
                    } else {
                        modalToOpenAfterMore = 'my-ads-modal';
                    }
                } else if (targetButton.id === 'more-replay-onboarding-btn') {
                    document.dispatchEvent(new CustomEvent('mapMarket:replayOnboarding'));
                } else if (targetButton.id === 'more-pwa-install-btn') {
                     if (typeof PWA.handleInstallApp === 'function') {
                        PWA.handleInstallApp();
                    } else {
                        console.warn("PWA.handleInstallApp n'est pas une fonction.");
                        Utils.showToast("L'installation n'est pas disponible.", "info");
                    }
                    shouldCloseMoreOptions = false;
                } else if (targetButton.dataset.firebaseAuthAction === 'logout' || targetButton.id === 'more-logout-btn') {
                    // L'action de déconnexion est gérée par auth.js.
                    // La modale "Plus" se fermera.
                } else {
                    // Pour les autres boutons qui ouvrent une modale (Profil, Alertes, Historique, Paramètres)
                    const controlledModalId = targetButton.getAttribute('aria-controls');
                    if (controlledModalId) {
                        modalToOpenAfterMore = controlledModalId;
                    } else {
                        shouldCloseMoreOptions = false;
                    }
                }

                if (shouldCloseMoreOptions) {
                    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: modalToClose }}));
                }

                if (modalToOpenAfterMore) {
                    setTimeout(() => {
                        document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                            detail: { modalId: modalToOpenAfterMore, triggerElement: triggerForNextModal }
                        }));
                        if (modalToOpenAfterMore === 'auth-modal' && typeof Auth.switchAuthView === 'function') {
                           Auth.switchAuthView('login');
                        }
                        if (modalToOpenAfterMore === 'my-ads-modal') {
                            document.dispatchEvent(new CustomEvent('mapMarket:openMyAds'));
                        }
                    }, 50);
                }
            });
        }

        document.addEventListener('mapMarket:userLoggedIn', connectSocket);
        document.addEventListener('mapMarket:userLoggedOut', disconnectSocket);

        if (State.getCurrentUser()) {
            connectSocket();
        }
    }

    setupGlobalUIHelpers() {
        document.addEventListener('error', (event) => {
            const target = event.target;
            if (target && target.tagName === 'IMG') {
                const placeholderUrl = `https://placehold.co/${target.offsetWidth || 60}x${target.offsetHeight || 60}/e0e0e0/757575?text=Img HS`;
                if (target.src !== placeholderUrl) {
                    console.warn(`Image non trouvée: ${target.src}. Remplacement par placeholder.`);
                    target.src = placeholderUrl;
                    target.alt = "Image non disponible";
                }
            }
        }, true);
    }
}

const mapMarketApp = new App();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mapMarketApp.init());
} else {
    mapMarketApp.init();
}
