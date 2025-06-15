// js/settings.js

/**
 * @file settings.js
 * @description Gestion des paramètres de l'application :
 * mode sombre, langue, préférences de notification.
 */

import * as state from './state.js';
import {
    showToast,
    secureFetch
    // toggleGlobalLoader // Non utilisé ici directement, mais importé au cas où
} from './utils.js';

const API_SETTINGS_URL = '/api/settings'; // Pour sauvegarder les préférences utilisateur côté serveur
let serviceWorkerRegistrationObject = null; // Pour gérer l'abonnement push

// --- Éléments du DOM ---
let settingsModal;
let darkModeToggle, languageSelect;
let pushNotificationsToggle, emailNotificationsToggle;
let settingsDeleteAccountBtn; // Le bouton de déconnexion est géré par auth.js via data-attribute

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour les paramètres.
 */
export function init() {
    console.log("Settings.init() : Démarrage de l'initialisation des paramètres.");
    settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) {
        console.warn("Settings.init(): Modale des paramètres (settings-modal) non trouvée. Le module ne sera pas pleinement fonctionnel.");
        return; // Ne pas continuer si la modale principale est absente
    }

    darkModeToggle = document.getElementById('dark-mode-toggle-setting');
    languageSelect = document.getElementById('language-select-setting');
    pushNotificationsToggle = document.getElementById('push-notifications-toggle');
    emailNotificationsToggle = document.getElementById('email-notifications-toggle');
    settingsDeleteAccountBtn = document.getElementById('settings-delete-account-btn');

    // Logs pour vérifier si les éléments sont trouvés
    if (!darkModeToggle) console.warn("Settings.init(): Contrôle 'darkModeToggle' (ID: dark-mode-toggle-setting) non trouvé.");
    if (!languageSelect) console.warn("Settings.init(): Contrôle 'languageSelect' (ID: language-select-setting) non trouvé.");
    if (!pushNotificationsToggle) console.warn("Settings.init(): Contrôle 'pushNotificationsToggle' (ID: push-notifications-toggle) non trouvé.");
    if (!emailNotificationsToggle) console.warn("Settings.init(): Contrôle 'emailNotificationsToggle' (ID: email-notifications-toggle) non trouvé.");
    if (!settingsDeleteAccountBtn) console.warn("Settings.init(): Bouton 'settingsDeleteAccountBtn' (ID: settings-delete-account-btn) non trouvé.");


    // --- Écouteurs d'événements ---
    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', handleDarkModeToggle);
        console.log("Settings.init(): Écouteur 'change' ajouté à darkModeToggle.");
    }
    if (languageSelect) {
        languageSelect.addEventListener('change', handleLanguageChange);
        console.log("Settings.init(): Écouteur 'change' ajouté à languageSelect.");
    }
    if (pushNotificationsToggle) {
        pushNotificationsToggle.addEventListener('change', handlePushNotificationsToggle);
        console.log("Settings.init(): Écouteur 'change' ajouté à pushNotificationsToggle.");
    }
    if (emailNotificationsToggle) {
        emailNotificationsToggle.addEventListener('change', handleEmailNotificationsToggle);
        console.log("Settings.init(): Écouteur 'change' ajouté à emailNotificationsToggle.");
    }

    if (settingsDeleteAccountBtn) {
        settingsDeleteAccountBtn.addEventListener('click', () => {
            console.log("Settings: Clic sur settingsDeleteAccountBtn");
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', {
                detail: { modalId: 'settings-modal' }
            }));
            const profileDeleteTrigger = document.getElementById('delete-account-trigger-btn');
            if (profileDeleteTrigger) {
                document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
                    detail: { modalId: 'profile-modal' }
                }));
                // Laisser le temps à la modale profil de s'ouvrir et d'être dans le DOM
                setTimeout(() => {
                    console.log("Settings: Tentative de clic sur profileDeleteTrigger");
                    profileDeleteTrigger.click(); // Déclenche l'affichage de la section de confirmation
                    profileDeleteTrigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 250);
            } else {
                console.error("Settings: Bouton 'delete-account-trigger-btn' non trouvé dans le profil.");
                showToast("Option de suppression de compte non trouvée dans le profil.", "error");
            }
        });
        console.log("Settings.init(): Écouteur 'click' ajouté à settingsDeleteAccountBtn.");
    }

    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'settings-modal') {
            console.log("Settings: Modale des paramètres ouverte, chargement des états des contrôles.");
            loadSettingsFromState();
            updatePushToggleStateBasedOnSubscription(); // Mettre à jour l'état du toggle push
        }
    });

    // Charger l'état initial des contrôles (au cas où la modale serait déjà visible ou pour une synchro initiale)
    // Cela est important si la modale est la première affichée ou si l'état change pendant qu'elle est cachée.
    loadSettingsFromState();

    // Récupérer l'enregistrement du Service Worker pour les notifications push
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            serviceWorkerRegistrationObject = registration;
            console.log("Settings: Service Worker prêt pour les notifications push.");
            updatePushToggleStateBasedOnSubscription(); // Mettre à jour une fois que le SW est prêt
        }).catch(error => {
            console.warn("Settings: Service Worker non prêt pour les notifications push.", error);
        });
    }

    console.log('Module Settings initialisé et écouteurs attachés (si éléments trouvés).');
}

/**
 * Charge les valeurs des paramètres depuis l'état global et les applique aux contrôles du formulaire.
 */
function loadSettingsFromState() {
    const currentUser = state.getCurrentUser();
    const uiState = state.get('ui');
    const userSettings = currentUser?.settings || {}; // Préférences stockées sur l'objet utilisateur

    if (darkModeToggle) {
        darkModeToggle.checked = uiState.darkMode || false;
        // console.log("Settings.loadSettings: Dark mode toggle initialisé à", darkModeToggle.checked);
    }
    if (languageSelect) {
        languageSelect.value = uiState.language || 'fr';
        // console.log("Settings.loadSettings: Langue select initialisé à", languageSelect.value);
    }
    if (pushNotificationsToggle) {
        // L'état initial du toggle reflète la préférence UI sauvegardée,
        // puis updatePushToggleStateBasedOnSubscription le met à jour avec l'état réel de l'abonnement.
        const pushPref = localStorage.getItem('mapMarketPushPreference');
        pushNotificationsToggle.checked = pushPref !== null ? JSON.parse(pushPref) : false; // Désactivé par défaut, l'utilisateur doit l'activer explicitement
        // console.log("Settings.loadSettings: Push toggle (pref UI) initialisé à", pushNotificationsToggle.checked);
    }
    if (emailNotificationsToggle) {
        const emailEnabled = userSettings.notifications?.emailEnabled; // Accès sécurisé
        emailNotificationsToggle.checked = emailEnabled !== undefined ? emailEnabled : true; // Activé par défaut si non défini
        // console.log("Settings.loadSettings: Email toggle initialisé à", emailNotificationsToggle.checked);
    }
}

/**
 * Met à jour l'état du toggle Push en fonction de l'abonnement réel.
 */
async function updatePushToggleStateBasedOnSubscription() {
    if (!pushNotificationsToggle || !serviceWorkerRegistrationObject || !serviceWorkerRegistrationObject.pushManager) {
        // console.log("Settings.updatePushToggle: Push toggle ou SW non prêt.");
        return;
    }
    try {
        const subscription = await serviceWorkerRegistrationObject.pushManager.getSubscription();
        const isSubscribed = !(subscription === null);
        if (pushNotificationsToggle.checked !== isSubscribed) {
            console.log(`Settings: Synchronisation du toggle Push. Préférence UI: ${pushNotificationsToggle.checked}, État réel abonnement: ${isSubscribed}`);
            pushNotificationsToggle.checked = isSubscribed;
        }
        localStorage.setItem('mapMarketPushPreference', JSON.stringify(isSubscribed)); // Sauvegarder l'état réel
    } catch (error) {
        console.error("Settings: Erreur lors de la vérification de l'abonnement Push:", error);
    }
}

/**
 * Gère le changement de l'interrupteur du mode sombre.
 */
function handleDarkModeToggle() {
    if (!darkModeToggle) return;
    const isDark = darkModeToggle.checked;
    console.log("Settings: Clic sur darkModeToggle. Nouvel état souhaité:", isDark);
    state.toggleDarkMode(isDark);
    showToast(`Mode sombre ${isDark ? 'activé' : 'désactivé'}.`, 'info');
    saveUserSetting('darkMode', isDark);
}

/**
 * Gère le changement de la langue sélectionnée.
 */
function handleLanguageChange() {
    if (!languageSelect) return;
    const newLang = languageSelect.value;
    console.log("Settings: Clic sur languageSelect. Nouvelle langue:", newLang);
    state.setLanguage(newLang);
    showToast(`Langue changée en ${newLang === 'fr' ? 'Français' : 'English'}.`, 'info');
    document.dispatchEvent(new CustomEvent('mapMarket:languageChanged', { detail: { lang: newLang } }));
    saveUserSetting('language', newLang);
}

/**
 * Gère le changement de l'interrupteur des notifications push.
 */
async function handlePushNotificationsToggle() {
    if (!pushNotificationsToggle || !serviceWorkerRegistrationObject) {
        showToast("Les notifications Push ne sont pas prêtes ou non supportées.", "warning");
        if(pushNotificationsToggle) pushNotificationsToggle.checked = !pushNotificationsToggle.checked; // Annuler le changement visuel
        return;
    }
    const enabled = pushNotificationsToggle.checked;
    console.log("Settings: Clic sur pushNotificationsToggle. Nouvel état souhaité:", enabled);

    if (enabled) {
        if (!('Notification' in window)) {
            showToast("Les notifications Push ne sont pas supportées par ce navigateur.", "warning");
            pushNotificationsToggle.checked = false; localStorage.setItem('mapMarketPushPreference', 'false'); return;
        }
        try {
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }

            if (permission === 'granted') {
                const vapidPublicKey = 'BCXjH7YCFwNqX01pZ97duAd3XbA_x0jO3s_pX1_L8fPjV0L1g8tq3zU7fX0f_bYjZ8hH5A_pP0eP6Yk'; // ** REMPLACEZ PAR VOTRE VRAIE CLÉ PUBLIQUE VAPID **
                if (!vapidPublicKey || vapidPublicKey.startsWith('VOTRE')) {
                    console.error("Settings: Clé VAPID publique non configurée ! L'abonnement Push échouera.");
                    showToast("Configuration des notifications push incomplète côté client.", "error");
                    pushNotificationsToggle.checked = false; localStorage.setItem('mapMarketPushPreference', 'false'); return;
                }
                const subscription = await serviceWorkerRegistrationObject.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
                });
                showToast("Notifications push activées.", "success");
                await saveUserSetting('pushSubscription', JSON.parse(JSON.stringify(subscription)));
                localStorage.setItem('mapMarketPushPreference', 'true');
            } else {
                showToast(`Permission pour les notifications ${permission === 'denied' ? 'refusée' : 'ignorée'}.`, permission === 'denied' ? "warning" : "info", 5000);
                pushNotificationsToggle.checked = false; localStorage.setItem('mapMarketPushPreference', 'false');
            }
        } catch (error) {
            console.error("Settings: Erreur d'abonnement Push:", error);
            pushNotificationsToggle.checked = false; localStorage.setItem('mapMarketPushPreference', 'false');
        }
    } else { // Désactivation
        try {
            const subscription = await serviceWorkerRegistrationObject.pushManager.getSubscription();
            if (subscription) {
                const unsubscribed = await subscription.unsubscribe();
                if (unsubscribed) {
                    showToast("Notifications push désactivées.", "info");
                    await saveUserSetting('pushSubscription', null);
                } else {
                    showToast("Échec de la désactivation des notifications push.", "error");
                    pushNotificationsToggle.checked = true; // Remettre le toggle car échec
                }
            } else {
                 showToast("Aucun abonnement push actif à désactiver.", "info");
            }
        } catch (error) {
            console.error("Settings: Erreur de désabonnement Push:", error);
            pushNotificationsToggle.checked = true; // Remettre en cas d'erreur
        }
        localStorage.setItem('mapMarketPushPreference', 'false');
    }
    // Sauvegarder la préférence d'activation/désactivation (booléen) pour le backend
    saveUserSetting('notifications.pushEnabled', pushNotificationsToggle.checked);
}

/**
 * Gère le changement de l'interrupteur des notifications par e-mail.
 */
function handleEmailNotificationsToggle() {
    if (!emailNotificationsToggle) return;
    const enabled = emailNotificationsToggle.checked;
    console.log("Settings: Clic sur emailNotificationsToggle. Nouvel état souhaité:", enabled);

    // Mettre à jour l'état de l'application (ex: un objet appSettings dans state.js)
    // ou directement les settings de l'utilisateur si c'est là qu'ils sont gérés.
    const currentUser = state.getCurrentUser();
    if (currentUser) {
        const userSettings = currentUser.settings || {};
        const newNotifSettings = { ...(userSettings.notifications || {}), emailEnabled: enabled };
        state.setCurrentUser({ ...currentUser, settings: { ...userSettings, notifications: newNotifSettings } });
    } else {
        // Si pas d'utilisateur, on peut stocker localement, mais l'API call n'aura pas lieu.
        // Pour l'instant, on se concentre sur le cas utilisateur connecté pour saveUserSetting.
        console.warn("Settings: Utilisateur non connecté, la préférence email ne sera pas sauvegardée sur le serveur.");
    }

    showToast(`Notifications par e-mail ${enabled ? 'activées' : 'désactivées'}.`, 'info');
    saveUserSetting('notifications.emailEnabled', enabled);
}

/**
 * Sauvegarde une préférence utilisateur sur le serveur.
 * @param {string} key - La clé de la préférence (ex: 'darkMode', 'notifications.pushEnabled').
 * @param {any} value - La valeur de la préférence.
 */
async function saveUserSetting(key, value) {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        console.log(`Préférence '${key}' sauvegardée localement (utilisateur non connecté).`);
        // Pour darkMode et language, state.js gère déjà la persistance locale via persistState()
        // Pour les notifs, on se fie à localStorage pour la préférence UI si non connecté.
        return;
    }

    const settingPath = key.split('.');
    const payload = { settings: {} };
    let currentLevel = payload.settings;
    settingPath.forEach((k, index) => {
        if (index === settingPath.length - 1) {
            currentLevel[k] = value;
        } else {
            currentLevel[k] = currentLevel[k] || {}; // Créer l'objet imbriqué s'il n'existe pas
            currentLevel = currentLevel[k];
        }
    });

    try {
        // Ne pas montrer de loader global pour ces petites sauvegardes en arrière-plan
        const response = await secureFetch(API_SETTINGS_URL, {
            method: 'PUT', // Ou POST, selon votre API pour les settings
            body: payload
        }, false);
        console.log(`Préférence utilisateur '${key}' sauvegardée sur le serveur. Réponse:`, response);

        // Mettre à jour l'objet currentUser dans l'état local pour refléter le changement
        // Cela est important si le backend ne renvoie pas l'objet utilisateur complet mis à jour.
        const updatedUser = JSON.parse(JSON.stringify(state.getCurrentUser())); // Cloner pour éviter la mutation directe
        if (!updatedUser.settings) updatedUser.settings = {};

        let tempRef = updatedUser.settings;
        settingPath.forEach((k, index) => {
            if (index === settingPath.length - 1) {
                tempRef[k] = value;
            } else {
                if (typeof tempRef[k] !== 'object' || tempRef[k] === null) tempRef[k] = {}; // S'assurer que c'est un objet
                tempRef = tempRef[k];
            }
        });
        state.setCurrentUser(updatedUser); // Met à jour l'état global de l'utilisateur

    } catch (error) {
        console.error(`Erreur lors de la sauvegarde de la préférence '${key}' sur le serveur:`, error);
        // Optionnel: annuler le changement UI si la sauvegarde échoue ?
        // Par exemple, pour un toggle: toggleElement.checked = !toggleElement.checked;
    }
}

/**
 * Convertit une clé VAPID base64 URL safe en Uint8Array.
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
