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

    toggleGlobalLoader(true, "Connexion en cours..."); // Affiche un indicateur de chargement

    try {
        const response = await secureFetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            body: { email, password }
        }, false); // Le 'false' ici est si secureFetch gère son propre loader, sinon retirez-le.

        toggleGlobalLoader(false); // Masque l'indicateur de chargement

        // La réponse du serveur en cas de succès est :
        // { success: true, message: '...', token: '...', data: { user: { ... } } }
        if (response && response.success && response.token && response.data && response.data.user) {
            const loggedInUser = response.data.user;

            // 1. Stocker le token et mettre à jour l'état global de l'application
            localStorage.setItem(JWT_STORAGE_KEY, response.token);
            state.setCurrentUser(loggedInUser);

            // 2. Mettre à jour les éléments communs de l'interface utilisateur (ex: en-tête, menu)
            // Cette fonction est cruciale pour refléter l'état connecté sans rechargement complet.
            updateUIAfterLogin(loggedInUser);

            // 3. Gérer la suite en fonction de la vérification de l'e-mail
            if (loggedInUser.emailVerified) {
                // E-mail vérifié : Connexion standard
                showToast('Connexion réussie ! Bienvenue.', 'success', 3000); // Toast de succès (3 secondes)

                // Fermer la modale d'authentification
                document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'auth-modal' } }));
                loginForm.reset(); // Vider les champs du formulaire

                // UX APRÈS CONNEXION : Mettre à jour l'interface ou rediriger
                // Option A : Rechargement de la page (simple et robuste pour assurer la cohérence)
                // Un petit délai pour que l'utilisateur voie le toast et que la modale se ferme.
                setTimeout(() => {
                    window.location.reload();
                }, 500); // Recharger après 0.5 seconde

                // Option B (pour SPA plus avancée sans rechargement complet) :
                // - Si vous étiez sur une page spécifique avant d'ouvrir la modale, y retourner.
                //   Ex: const previousUrl = state.getRedirectUrl() || '/dashboard';
                //       router.navigate(previousUrl); state.clearRedirectUrl();
                // - Ou déclencher un événement pour que les composants se mettent à jour.
                //   Ex: document.dispatchEvent(new CustomEvent('userContextUpdated', { detail: { user: loggedInUser } }));

            } else {
                // E-mail NON vérifié : Connexion réussie, mais guider l'utilisateur
                showToast('Connexion réussie ! Veuillez vérifier votre e-mail pour activer toutes les fonctionnalités.', 'warning', 7000); // Toast d'avertissement plus long

                // Maintenir la modale ouverte et afficher l'écran de validation d'e-mail
                // L'utilisateur pourra y voir des instructions ou demander un renvoi de l'e-mail.
                showEmailValidationScreen(loggedInUser.email);
                // Ne pas fermer la modale ici.
            }

        } else {
            // Cas où la connexion a échoué mais le serveur a renvoyé une réponse structurée (moins courant si secureFetch lève des erreurs pour les statuts non-2xx)
            toggleGlobalLoader(false); // S'assurer que le loader est masqué
            showToast(response.message || 'Erreur de connexion. Réponse inattendue du serveur.', 'error');
        }
    } catch (error) {
        toggleGlobalLoader(false); // Masquer le loader en cas d'erreur
        console.error('Erreur détaillée lors de la connexion (capturée dans handleLogin):', error);
        // error.message devrait contenir le message d'erreur du serveur si secureFetch le propage.
        showToast(error.message || 'Une erreur de connexion est survenue.', 'error');
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
    const passwordConfirm = signupPasswordConfirmField.value;

    toggleGlobalLoader(true, "Inscription en cours...");

    try {
        const response = await secureFetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            body: {
                name,
                email,
                password,
                passwordConfirm
            }
        }, false); // Le dernier `false` est pour que secureFetch ne gère pas son propre loader

        toggleGlobalLoader(false);

        if (response && response.success && response.data && response.data.userId) {
            // 1. Afficher le toast de succès (peut durer plus longtemps)
            // Le message du serveur est: "Inscription réussie ! Un e-mail de validation a été envoyé..."
            showToast(response.message, 'success', 7000); // Toast de 7 secondes

            // 2. Afficher la vue de validation d'e-mail dans la modale
            // Cette vue devrait contenir un message clair, par exemple :
            // "Veuillez consulter votre boîte de réception à l'adresse [email] pour valider votre compte.
            // Cette fenêtre se fermera automatiquement."
            showEmailValidationScreen(email);

            // 3. Attendre 1.5 secondes avant de fermer la modale et de réinitialiser le formulaire
            setTimeout(() => {
                // Ferme la modale d'authentification
                document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'auth-modal' } }));

                // Réinitialise le formulaire d'inscription (bonne pratique)
                signupForm.reset();
            }, 1500); // Délai de 1500 millisecondes (1.5 secondes)

        } else if (response && response.message) {
            showToast(response.message, 'error');
        } else {
            showToast('Erreur lors de l\'inscription. Réponse inattendue du serveur.', 'error');
        }
    } catch (error) {
        toggleGlobalLoader(false);
        console.error('Erreur détaillée lors de l\'inscription (capturée dans handleSignup):', error);
        showToast(error.message || 'Une erreur de communication est survenue durant l\'inscription.', 'error');
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
        const targetUrl = `${API_BASE_URL}/me`; // CIBLE CORRECTE : /api/auth/me
        try {
            toggleGlobalLoader(true, "Vérification de la session...");
            const response = await secureFetch(targetUrl, { method: 'GET' }, false);
            toggleGlobalLoader(false);

            if (response && response.success && response.data && response.data.user) {
                const userData = response.data.user;
                state.setCurrentUser(userData);
                updateUIAfterLogin(userData);
                console.log('Utilisateur authentifié via token existant:', userData.name);

                if (!userData.emailVerified) {
                    const authModalIsOpen = authModal && authModal.getAttribute('aria-hidden') === 'false';
                    const currentAuthView = authModal?.dataset.currentView;
                    if (!(authModalIsOpen && currentAuthView === 'validate-email')) {
                        console.info(`L'utilisateur ${userData._id} est connecté mais son e-mail n'est pas vérifié.`);
                        // Gérer l'affichage de l'écran de validation d'e-mail ou un bandeau
                        // Exemple (si vous voulez toujours la modale pour ça) :
                        // document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'auth-modal' } }));
                        // showEmailValidationScreen(userData.email);
                        // showToast("Veuillez valider votre adresse e-mail.", "warning", 7000);
                    }
                }
            } else {
                // Le serveur a répondu, mais la structure n'est pas {success: true, data: {user: ...}}
                console.warn(`Token JWT présent, mais la récupération des données utilisateur depuis ${targetUrl} a échoué (structure de réponse incorrecte).`, response);
                performLocalLogout(); // Échec de validation de session -> déconnexion locale
            }
        } catch (error) {
            // Erreur réseau, ou secureFetch a levé une erreur pour un statut non-2xx (ex: 401, 403, 404 sur targetUrl)
            toggleGlobalLoader(false);
            console.warn(`Échec critique lors de la vérification du token initial sur ${targetUrl}: ${error.message}. Déconnexion locale effectuée.`);

            // Toute erreur ici signifie que nous ne pouvons pas valider la session avec le token actuel.
            // Il faut donc déconnecter l'utilisateur localement pour briser la boucle et nettoyer l'état.
            performLocalLogout();

            // Afficher un toast seulement si l'erreur n'est pas une erreur d'authentification standard (401/403)
            // pour lesquelles secureFetch ou d'autres parties pourraient déjà afficher un message.
            // Une 404 sur /api/auth/me est une erreur serveur critique, mais le client doit se déconnecter.
            if (!(error.message.includes('401') || error.message.includes('403'))) {
                 showToast("Votre session n'a pas pu être vérifiée. Veuillez vous reconnecter.", "error");
            }
        }
    } else {
        updateUIAfterLogout(); // Pas de token, s'assurer que l'UI est en mode déconnecté.
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
