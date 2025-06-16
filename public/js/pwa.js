// js/pwa.js

/**
 * @file pwa.js
 * @description Gestion des fonctionnalités Progressive Web App (PWA).
 * Enregistrement du Service Worker, gestion de l'invite d'installation (A2HS),
 * et feedback hors-ligne.
 */

import * as state from './store.js';
import {
    showToast
} from './utils.js';

const SERVICE_WORKER_PATH = '/sw.js'; // Assurez-vous que ce chemin est correct

// --- Éléments du DOM ---
let installPromptContainer, installAcceptBtn, installDismissBtn, installPwaMenuBtn;
let pwaInstallTextMenu; // Texte du bouton dans le menu "Plus"

// --- État du module ---
let deferredInstallPrompt = null; // Stocke l'événement `beforeinstallprompt`
let serviceWorkerRegistration = null;

/**
 * Initialise les fonctionnalités PWA.
 */
export function init() {
    if (!('serviceWorker' in navigator)) {
        console.warn('PWA: Service Workers ne sont pas supportés par ce navigateur.');
        if (installPwaMenuBtn) installPwaMenuBtn.classList.add('hidden');
        return;
    }

    installPromptContainer = document.getElementById('pwa-install-prompt-container');
    installAcceptBtn = document.getElementById('pwa-install-accept-btn');
    installDismissBtn = document.getElementById('pwa-install-dismiss-btn');
    installPwaMenuBtn = document.getElementById('more-pwa-install-btn');
    pwaInstallTextMenu = document.getElementById('pwa-install-text-menu');


    registerServiceWorker();
    setupInstallPromptHandlers();

    state.subscribe('ui.isOnlineChanged', ({
        isOnline
    }) => {
        if (!isOnline) {
            showToast("Vous êtes hors ligne. Certaines fonctionnalités peuvent être limitées.", "warning", 5000);
        }
    });

    console.log('Module PWA initialisé.');
}

/**
 * Enregistre le Service Worker.
 */
async function registerServiceWorker() {
    try {
        serviceWorkerRegistration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
            scope: '/'
        });
        console.log('PWA: Service Worker enregistré avec succès. Scope:', serviceWorkerRegistration.scope);

        serviceWorkerRegistration.addEventListener('updatefound', () => {
            const newWorker = serviceWorkerRegistration.installing;
            if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showToastWithAction(
                            "Une nouvelle version de l'application est disponible.",
                            "Rafraîchir",
                            () => {
                                newWorker.postMessage({
                                    action: 'skipWaiting'
                                });
                            },
                            10000
                        );
                    }
                });
            }
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('PWA: Nouveau Service Worker activé. Rechargement de la page.');
            window.location.reload();
        });

    } catch (error) {
        console.error('PWA: Échec de l\'enregistrement du Service Worker:', error);
        showToast("Impossible d'activer les fonctionnalités hors-ligne.", "error");
    }
}

/**
 * Met en place les gestionnaires pour l'invite d'installation PWA.
 */
function setupInstallPromptHandlers() {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        console.log('PWA: Événement `beforeinstallprompt` intercepté.');
        showInstallBanner(true);
        if (installPwaMenuBtn) {
            installPwaMenuBtn.classList.remove('hidden');
            if (pwaInstallTextMenu) pwaInstallTextMenu.textContent = "Installer l'application";
        }
    });

    if (installAcceptBtn) {
        installAcceptBtn.addEventListener('click', handleInstallApp);
    }

    if (installDismissBtn) {
        installDismissBtn.addEventListener('click', () => {
            showInstallBanner(false);
            showToast("Vous pourrez installer l'application plus tard depuis le menu.", "info", 4000);
        });
    }

    if (installPwaMenuBtn) {
        installPwaMenuBtn.addEventListener('click', handleInstallApp);
    }

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        console.log('PWA: Application déjà installée (mode standalone).');
        showInstallBanner(false);
        if (installPwaMenuBtn) {
            installPwaMenuBtn.classList.add('hidden');
        }
    }

    window.addEventListener('appinstalled', () => {
        console.log('PWA: Application installée avec succès !');
        deferredInstallPrompt = null;
        showInstallBanner(false);
        if (installPwaMenuBtn) {
            installPwaMenuBtn.classList.add('hidden');
        }
        showToast("MapMarket a été installée sur votre appareil !", "success", 5000);
    });
}

/**
 * Affiche ou masque la bannière d'installation PWA.
 * @param {boolean} show - True pour afficher, false pour masquer.
 */
function showInstallBanner(show) {
    if (installPromptContainer) {
        installPromptContainer.classList.toggle('hidden', !show);
        installPromptContainer.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
}

/**
 * Gère la tentative d'installation de la PWA.
 * Exportée pour être appelée depuis main.js (menu "Plus d'options").
 */
export async function handleInstallApp() { // Ajout de 'export'
    showInstallBanner(false);
    if (installPwaMenuBtn) {
        document.dispatchEvent(new CustomEvent('mapmarket:closeModal', {
            detail: {
                modalId: 'more-options-modal'
            }
        }));
    }

    if (!deferredInstallPrompt) {
        console.warn('PWA: Pas d\'événement d\'installation différé disponible.');
        showToast("L'installation n'est pas disponible pour le moment ou déjà effectuée.", "info");
        return;
    }

    deferredInstallPrompt.prompt();

    try {
        const {
            outcome
        } = await deferredInstallPrompt.userChoice;
        console.log(`PWA: Choix de l'utilisateur pour l'installation: ${outcome}`);
        if (outcome === 'accepted') {
            // L'événement 'appinstalled' sera déclenché.
        } else {
            showToast("Installation annulée.", "info");
        }
    } catch (error) {
        console.error("PWA: Erreur lors de l'invite d'installation:", error);
        showToast("Erreur lors de la tentative d'installation.", "error");
    }
    deferredInstallPrompt = null;
}

/**
 * Affiche un toast avec un bouton d'action.
 */
function showToastWithAction(message, actionText, actionCallback, duration = 0) {
    // Cette fonction est un exemple, showToast de utils.js ne gère pas les actions.
    // Vous devriez étendre votre showToast ou utiliser une lib de notifications plus avancée.
    // Pour l'instant, on affiche un toast simple et l'action en console.
    showToast(`${message} (Action: ${actionText})`, 'info', duration || 10000);
    console.log(`Action de toast suggérée: ${actionText}. Callback:`, actionCallback);
    // Pour une vraie implémentation, il faudrait modifier le DOM du toast pour ajouter un bouton.
}
