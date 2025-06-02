// js/auth.js

/**
 * @file auth.js
 * @description Gestion de l'authentification des utilisateurs :
 * inscription, connexion, déconnexion, mot de passe oublié, validation email,
 * gestion du token JWT et mise à jour de l'état utilisateur.
 */

import {
    showToast,
    validateForm,
    validateField,
    secureFetch,
    toggleGlobalLoader,
    sanitizeHTML
} from './utils.js';
import * as state from './state.js';
// import { openModal, closeModal, switchAuthView } from './modals.js'; // modals.js gérera ses propres ouvertures/fermetures

const API_BASE_URL = '/api/auth'; // Ajustez selon votre configuration backend
const JWT_STORAGE_KEY = 'mapmarket_auth_token';

// --- Éléments du DOM (formulaires et champs spécifiques à l'authentification) ---
let loginForm, signupForm, resetPasswordForm, emailValidationView;
let loginEmailField, loginPasswordField;
let signupNameField, signupEmailField, signupPasswordField, signupPasswordConfirmField;
let resetEmailField;
let validationEmailAddressEl, resendValidationEmailBtn;

// Modale d'authentification et ses vues
let authModal;
let authModalTitleLogin, authModalTitleSignup, authModalTitleReset, authModalTitleValidateEmail;
let switchToSignupBtn, switchToLoginBtn;

// Éléments de l'interface utilisateur affectés par l'état d'authentification
let headerProfileBtn, headerProfileAvatar;

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour l'authentification.
 */
function initAuthUI() {
    authModal = document.getElementById('auth-modal');
    if (!authModal) {
        console.error("La modale d'authentification (auth-modal) est introuvable.");
        return;
    }

    loginForm = document.getElementById('login-form');
    signupForm = document.getElementById('signup-form');
    resetPasswordForm = document.getElementById('reset-password-form');
    emailValidationView = document.getElementById('email-validation-view');

    // Champs de connexion
    loginEmailField = document.getElementById('login-email');
    loginPasswordField = document.getElementById('login-password');

    // Champs d'inscription
    signupNameField = document.getElementById('signup-name');
    signupEmailField = document.getElementById('signup-email');
    signupPasswordField = document.getElementById('signup-password');
    signupPasswordConfirmField = document.getElementById('signup-password-confirm');

    // Champs de réinitialisation de mot de passe
    resetEmailField = document.getElementById('reset-email');

    // Éléments de validation d'email
    validationEmailAddressEl = document.getElementById('validation-email-address');
    resendValidationEmailBtn = document.getElementById('resend-validation-email-btn');

    // Titres de la modale
    authModalTitleLogin = document.getElementById('auth-modal-title-login');
    authModalTitleSignup = document.getElementById('auth-modal-title-signup');
    authModalTitleReset = document.getElementById('auth-modal-title-reset');
    authModalTitleValidateEmail = document.getElementById('auth-modal-title-validate-email');

    // Boutons de switch entre vues
    switchToSignupBtn = document.getElementById('auth-switch-to-signup-btn');
    switchToLoginBtn = document.getElementById('auth-switch-to-login-btn');

    // Éléments de l'en-tête
    headerProfileBtn = document.getElementById('header-profile-btn');
    headerProfileAvatar = document.getElementById('header-profile-avatar');


    // Ajout des écouteurs d'événements aux formulaires
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', handlePasswordResetRequest);
    }
    if (resendValidationEmailBtn) {
        resendValidationEmailBtn.addEventListener('click', handleResendValidationEmail);
    }

    // Gestion des liens pour changer de vue dans la modale d'authentification
    authModal.querySelectorAll('[data-auth-view-target]').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetViewId = link.dataset.authViewTarget;
            switchAuthView(targetViewId);
        });
    });

    // Boutons de déconnexion (peuvent être multiples dans l'UI)
    document.querySelectorAll('[data-firebase-auth-action="logout"], #logout-btn, #settings-logout-btn, #more-logout-btn').forEach(btn => {
        btn.addEventListener('click', logout);
    });

    // Vérifier l'état de connexion initial au chargement
    checkInitialAuthState();
}

/**
 * Change la vue active dans la modale d'authentification.
 * @param {string} viewId - ID de la vue à afficher ('login', 'signup', 'reset', 'validate-email').
 */
export function switchAuthView(viewId) {
    if (!authModal) return;

    const views = {
        login: loginForm,
        signup: signupForm,
        reset: resetPasswordForm,
        'validate-email': emailValidationView
    };
    const titles = {
        login: authModalTitleLogin,
        signup: authModalTitleSignup,
        reset: authModalTitleReset,
        'validate-email': authModalTitleValidateEmail
    };

    // Masquer toutes les vues et tous les titres
    Object.values(views).forEach(view => view?.classList.add('hidden'));
    Object.values(titles).forEach(title => title?.classList.add('hidden'));

    // Afficher la vue et le titre cibles
    if (views[viewId]) views[viewId].classList.remove('hidden');
    if (titles[viewId]) {
        titles[viewId].classList.remove('hidden');
        authModal.setAttribute('aria-labelledby', titles[viewId].id);
    }

    authModal.dataset.currentView = viewId;

    // Gérer la visibilité des boutons de bascule
    if (switchToSignupBtn && switchToLoginBtn) {
        if (viewId === 'login' || viewId === 'reset') {
            switchToSignupBtn.classList.remove('hidden');
            switchToLoginBtn.classList.add('hidden');
        } else if (viewId === 'signup') {
            switchToSignupBtn.classList.add('hidden');
            switchToLoginBtn.classList.remove('hidden');
        } else { // Pour 'validate-email' ou autres vues potentielles
            switchToSignupBtn.classList.add('hidden');
            switchToLoginBtn.classList.add('hidden');
        }
    }
     // Focus sur le premier champ du formulaire visible
    const currentForm = views[viewId];
    if (currentForm && typeof currentForm.querySelector === 'function') {
        const firstInput = currentForm.querySelector('input:not([type="hidden"]), select, textarea');
        firstInput?.focus();
    }
}


/**
 * Règles de validation pour les formulaires d'authentification.
 */
const authValidationRules = {
    loginForm: {
        'login-email': [
            { type: 'required', message: 'L\'adresse e-mail est requise.' },
            { type: 'email', message: 'Veuillez entrer une adresse e-mail valide.' }
        ],
        'login-password': [
            { type: 'required', message: 'Le mot de passe est requis.' }
        ]
    },
    signupForm: {
        'signup-name': [
            { type: 'required', message: 'Le nom d\'utilisateur est requis.' },
            { type: 'minLength', value: 3, message: 'Le nom d\'utilisateur doit comporter au moins 3 caractères.' }
        ],
        'signup-email': [
            { type: 'required', message: 'L\'adresse e-mail est requise.' },
            { type: 'email', message: 'Veuillez entrer une adresse e-mail valide.' }
        ],
        'signup-password': [
            { type: 'required', message: 'Le mot de passe est requis.' },
            { type: 'minLength', value: 6, message: 'Le mot de passe doit comporter au moins 6 caractères.' }
            // Ajouter ici des règles de complexité si nécessaire (ex: pattern)
        ],
        'signup-password-confirm': [
            { type: 'required', message: 'Veuillez confirmer votre mot de passe.' },
            { type: 'match', value: 'signup-password', message: 'Les mots de passe ne correspondent pas.' }
        ]
    },
    resetPasswordForm: {
        'reset-email': [
            { type: 'required', message: 'L\'adresse e-mail est requise.' },
            { type: 'email', message: 'Veuillez entrer une adresse e-mail valide.' }
        ]
    }
};

/**
 * Gère la soumission du formulaire de connexion.
 * @param {Event} event - L'événement de soumission.
 */
async function handleLogin(event) {
    event.preventDefault();
    if (!loginForm || !validateForm(loginForm, authValidationRules.loginForm)) {
        showToast('Veuillez corriger les erreurs dans le formulaire.', 'error');
        return;
    }

    const email = loginEmailField.value.trim();
    const password = loginPasswordField.value;

    try {
        const response = await secureFetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            body: { email, password }
        });

        if (response && response.token && response.user) {
            localStorage.setItem(JWT_STORAGE_KEY, response.token);
            state.setCurrentUser(response.user);
            updateUIAfterLogin(response.user);
            showToast('Connexion réussie ! Bienvenue.', 'success');
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'auth-modal' } }));

            // Rediriger ou effectuer d'autres actions après la connexion
            // Par exemple, si l'utilisateur n'a pas validé son email :
            if (!response.user.emailVerified) {
                showEmailValidationScreen(response.user.email);
            }

        } else {
            // La gestion d'erreur de secureFetch devrait déjà afficher un toast
            // Mais on peut ajouter un message plus spécifique si la réponse est inattendue
            showToast(response.message || 'Erreur de connexion. Réponse inattendue du serveur.', 'error');
        }
    } catch (error) {
        // secureFetch gère déjà l'affichage du toast d'erreur.
        // On pourrait vouloir logger l'erreur ici ou effectuer d'autres actions.
        console.error('Erreur lors de la connexion:', error);
    }
}

/**
 * Gère la soumission du formulaire d'inscription.
 * @param {Event} event - L'événement de soumission.
 */
async function handleSignup(event) {
    event.preventDefault();
    if (!signupForm || !validateForm(signupForm, authValidationRules.signupForm)) {
        showToast('Veuillez corriger les erreurs dans le formulaire.', 'error');
        return;
    }

    const name = signupNameField.value.trim();
    const email = signupEmailField.value.trim();
    const password = signupPasswordField.value;

    try {
        const response = await secureFetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            body: { name, email, password }
        });

        if (response && response.message && response.user) { // Succès de l'inscription
            showToast(response.message, 'success');
            // Afficher l'écran de validation d'e-mail
            showEmailValidationScreen(response.user.email);
        } else {
            showToast(response.message || 'Erreur lors de l\'inscription.', 'error');
        }
    } catch (error) {
        console.error('Erreur lors de l\'inscription:', error);
        // secureFetch gère le toast, mais on pourrait vouloir un message plus spécifique
        // if (error.data && error.data.message) {
        //     showToast(error.data.message, 'error');
        // }
    }
}

/**
 * Affiche l'écran de validation d'e-mail.
 * @param {string} email - L'adresse e-mail à laquelle le message de validation a été envoyé.
 */
function showEmailValidationScreen(email) {
    if (validationEmailAddressEl) {
        validationEmailAddressEl.textContent = sanitizeHTML(email);
    }
    // Stocker l'email pour la fonction de renvoi
    if (resendValidationEmailBtn) {
        resendValidationEmailBtn.dataset.email = email;
    }
    switchAuthView('validate-email');
}

/**
 * Gère la demande de renvoi de l'e-mail de validation.
 */
async function handleResendValidationEmail() {
    const email = resendValidationEmailBtn?.dataset.email;
    if (!email) {
        showToast('Adresse e-mail non trouvée pour le renvoi.', 'error');
        switchAuthView('login'); // Revenir à la connexion si l'email est perdu
        return;
    }

    try {
        toggleGlobalLoader(true, "Envoi de l'e-mail de validation...");
        const response = await secureFetch(`${API_BASE_URL}/resend-validation-email`, {
            method: 'POST',
            body: { email }
        });
        toggleGlobalLoader(false);

        if (response && response.message) {
            showToast(response.message, 'success');
        } else {
            showToast('Erreur lors du renvoi de l\'e-mail de validation.', 'error');
        }
    } catch (error) {
        toggleGlobalLoader(false);
        console.error('Erreur lors du renvoi de l\'e-mail de validation:', error);
        // secureFetch gère le toast
    }
}


/**
 * Gère la demande de réinitialisation de mot de passe.
 * @param {Event} event - L'événement de soumission.
 */
async function handlePasswordResetRequest(event) {
    event.preventDefault();
    if (!resetPasswordForm || !validateForm(resetPasswordForm, authValidationRules.resetPasswordForm)) {
        showToast('Veuillez corriger les erreurs dans le formulaire.', 'error');
        return;
    }

    const email = resetEmailField.value.trim();

    try {
        const response = await secureFetch(`${API_BASE_URL}/forgot-password`, {
            method: 'POST',
            body: { email }
        });

        if (response && response.message) {
            showToast(response.message, 'success');
            switchAuthView('login'); // Revenir à la vue de connexion
            resetPasswordForm.reset(); // Vider le formulaire
        } else {
            showToast(response.message || 'Erreur lors de la demande de réinitialisation.', 'error');
        }
    } catch (error) {
        console.error('Erreur lors de la demande de réinitialisation de mot de passe:', error);
    }
}

/**
 * Gère la réinitialisation effective du mot de passe (après clic sur le lien dans l'e-mail).
 * Cette fonction sera appelée sur une page dédiée ou via des paramètres d'URL.
 * @param {string} token - Le token de réinitialisation reçu par e-mail.
 * @param {string} newPassword - Le nouveau mot de passe.
 */
export async function handlePasswordReset(token, newPassword) {
    // Ce formulaire/logique serait sur une page/vue distincte accessible via le lien de l'email
    // Pour cet exemple, on simule l'appel API.
    // Il faudrait un formulaire pour entrer le nouveau mot de passe et le confirmer.
    try {
        const response = await secureFetch(`${API_BASE_URL}/reset-password`, {
            method: 'POST',
            body: { token, newPassword }
        });
        if (response && response.message) {
            showToast(response.message, 'success');
            // Rediriger vers la page de connexion
            // window.location.hash = '#login'; // ou une autre méthode de navigation
            document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal', view: 'login' } }));
        } else {
            showToast(response.message || 'Erreur lors de la réinitialisation du mot de passe.', 'error');
        }
    } catch (error) {
        console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    }
}


/**
 * Déconnecte l'utilisateur.
 */
export function logout() {
    const token = localStorage.getItem(JWT_STORAGE_KEY);

    if (token) {
        // Optionnel : appeler une API de déconnexion pour invalider le token côté serveur
        secureFetch(`${API_BASE_URL}/logout`, { method: 'POST' }, false)
            .then(() => console.log('Token invalidé côté serveur (si applicable).'))
            .catch(error => console.warn('Erreur lors de la déconnexion côté serveur:', error))
            .finally(performLocalLogout);
    } else {
        performLocalLogout();
    }
}

/**
 * Effectue les actions de déconnexion locales.
 */
function performLocalLogout() {
    localStorage.removeItem(JWT_STORAGE_KEY);
    state.setCurrentUser(null); // Met à jour l'état global
    state.resetState(true); // Réinitialise l'état en gardant les préférences UI
    updateUIAfterLogout();
    showToast('Vous avez été déconnecté.', 'info');

    // Fermer toutes les modales qui nécessitent une authentification
    // et potentiellement rediriger vers la page d'accueil ou de connexion.
    document.dispatchEvent(new CustomEvent('mapmarket:closeAllModals'));
    // Assurer que la modale d'auth s'ouvre sur la vue login si elle est réouverte.
    // switchAuthView('login'); // Géré par le trigger du bouton profil
}


/**
 * Met à jour l'interface utilisateur après la connexion.
 * @param {object} userData - Les données de l'utilisateur connecté.
 */
function updateUIAfterLogin(userData) {
    if (headerProfileBtn) {
        headerProfileBtn.dataset.userLoggedIn = 'true';
        headerProfileBtn.setAttribute('aria-label', `Profil de ${sanitizeHTML(userData.name)}`);
    }
    if (headerProfileAvatar) {
        headerProfileAvatar.src = userData.avatarUrl || 'avatar-default.svg';
        headerProfileAvatar.alt = `Avatar de ${sanitizeHTML(userData.name)}`;
    }
    // Masquer les options "Connexion/Inscription" si elles sont visibles
    // Afficher les options "Mon compte", "Déconnexion"
    // Par exemple, dans le menu "Plus" ou le menu de profil.
    document.body.classList.add('user-logged-in');
    document.body.classList.remove('user-logged-out');

    // Dispatch un événement pour que d'autres modules puissent réagir
    document.dispatchEvent(new CustomEvent('mapMarket:userLoggedIn', { detail: userData }));
}

/**
 * Met à jour l'interface utilisateur après la déconnexion.
 */
function updateUIAfterLogout() {
    if (headerProfileBtn) {
        headerProfileBtn.dataset.userLoggedIn = 'false';
        headerProfileBtn.setAttribute('aria-label', 'Ouvrir le menu utilisateur');
    }
    if (headerProfileAvatar) {
        headerProfileAvatar.src = 'avatar-default.svg';
        headerProfileAvatar.alt = 'Avatar utilisateur';
    }
    document.body.classList.remove('user-logged-in');
    document.body.classList.add('user-logged-out');

    // Dispatch un événement
    document.dispatchEvent(new CustomEvent('mapMarket:userLoggedOut'));
}

/**
 * Vérifie l'état d'authentification initial au chargement de la page.
 * Si un token JWT valide existe, tente de récupérer les informations de l'utilisateur.
 */
async function checkInitialAuthState() {
    const token = localStorage.getItem(JWT_STORAGE_KEY);
    if (token) {
        try {
            // Il est préférable de valider le token côté serveur en récupérant le profil
            toggleGlobalLoader(true, "Vérification de la session...");
            const userData = await secureFetch(`${API_BASE_URL}/profile`, { method: 'GET' }, false); // false pour ne pas montrer le loader global de secureFetch ici
            toggleGlobalLoader(false);

            if (userData) {
                state.setCurrentUser(userData);
                updateUIAfterLogin(userData);
                console.log('Utilisateur authentifié via token existant:', userData);

                if (!userData.emailVerified) {
                    // Si l'utilisateur est connecté mais n'a pas validé son email,
                    // et qu'il n'est pas déjà sur la modale d'auth pour valider.
                    const authModalIsOpen = authModal && authModal.getAttribute('aria-hidden') === 'false';
                    const currentAuthView = authModal?.dataset.currentView;
                    if (!(authModalIsOpen && currentAuthView === 'validate-email')) {
                         // Ouvre la modale d'authentification sur l'écran de validation
                        document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal' } }));
                        showEmailValidationScreen(userData.email);
                        showToast("Veuillez valider votre adresse e-mail.", "warning", 5000);
                    }
                }

            } else {
                // Token invalide ou expiré, le supprimer
                performLocalLogout(); // `secureFetch` peut avoir déjà géré cela si 401
            }
        } catch (error) {
            toggleGlobalLoader(false);
            console.warn('Erreur lors de la vérification du token initial:', error.message);
            // Si l'erreur est une 401 Unauthorized, le token est probablement invalide/expiré.
            if (error.status === 401 || error.status === 403) {
                performLocalLogout();
            } else {
                // Pour d'autres erreurs (ex: réseau), on ne déconnecte pas forcément,
                // mais on informe l'utilisateur.
                showToast("Impossible de vérifier votre session. Vérifiez votre connexion.", "error");
                updateUIAfterLogout(); // Mettre l'UI en état déconnecté visuellement
            }
        }
    } else {
        updateUIAfterLogout(); // Assurer que l'UI est en mode déconnecté
    }
}

/**
 * Initialise le module d'authentification.
 */
export function init() {
    initAuthUI();
    // `checkInitialAuthState` est déjà appelé dans initAuthUI
    // ou pourrait être appelé explicitement ici si initAuthUI ne le fait pas.

    // Écouter les changements de l'état `currentUser` pour mettre à jour l'UI
    // si une autre partie de l'application modifie `currentUser`.
    state.subscribe('currentUserChanged', (user) => {
        if (user) {
            updateUIAfterLogin(user);
        } else {
            updateUIAfterLogout();
        }
    });

    console.log('Module Auth initialisé.');
}

// L'initialisation sera appelée depuis main.js
// init();
