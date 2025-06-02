// js/profile.js

/**
 * @file profile.js
 * @description Gestion du profil utilisateur : affichage, édition (nom, mot de passe, avatar),
 * et suppression de compte.
 */

import * as state from './state.js';
import { showToast, validateForm, secureFetch, toggleGlobalLoader, sanitizeHTML } from './utils.js';
import { logout } from './auth.js'; // Importation explicite de la fonction logout

const API_BASE_URL_USERS = '/api/users'; // Pour la mise à jour du profil, avatar, etc.

// --- Éléments du DOM pour le profil ---
let profileModal;
let profileAvatarContainer, profileAvatarImg, profileAvatarDefaultIcon, avatarUploadInput, changeAvatarBtn, removeAvatarBtn;
let profileForm, profileNameField, profileEmailField, profileNewPasswordField, profileConfirmPasswordField;
let editProfileBtn, saveProfileBtn, cancelEditProfileBtn, profileEditActions;
let deleteAccountTriggerBtn, deleteAccountConfirmSection, deleteAccountCheckbox, confirmDeleteAccountBtn, cancelDeleteAccountBtn;
let statsAdsPublished, statsAvgRating, statsFavoritesCount; // Éléments pour les statistiques

// Champs éditables
let editableFields = [];

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour la gestion du profil.
 */
function initProfileUI() {
    profileModal = document.getElementById('profile-modal');
    if (!profileModal) {
        console.error("La modale de profil (profile-modal) est introuvable.");
        return;
    }

    // Avatar
    profileAvatarContainer = document.getElementById('profile-avatar-container'); // Conteneur global de l'avatar
    profileAvatarImg = document.getElementById('profile-avatar-img');
    profileAvatarDefaultIcon = document.getElementById('profile-avatar-default-icon');
    avatarUploadInput = document.getElementById('avatar-upload-input');
    changeAvatarBtn = document.getElementById('change-avatar-btn');
    removeAvatarBtn = document.getElementById('remove-avatar-btn');

    // Formulaire de profil
    profileForm = document.getElementById('profile-form');
    profileNameField = document.getElementById('profile-name');
    profileEmailField = document.getElementById('profile-email'); // Généralement non modifiable par l'utilisateur directement
    profileNewPasswordField = document.getElementById('profile-new-password');
    profileConfirmPasswordField = document.getElementById('profile-confirm-password');

    editableFields = [profileNameField, profileNewPasswordField, profileConfirmPasswordField];

    // Boutons d'action du formulaire
    editProfileBtn = document.getElementById('edit-profile-btn');
    saveProfileBtn = document.getElementById('save-profile-btn');
    cancelEditProfileBtn = document.getElementById('cancel-edit-profile-btn');
    profileEditActions = document.getElementById('profile-edit-actions');


    // Section suppression de compte
    deleteAccountTriggerBtn = document.getElementById('delete-account-trigger-btn');
    deleteAccountConfirmSection = document.getElementById('delete-account-confirmation-section');
    deleteAccountCheckbox = document.getElementById('delete-account-confirm-checkbox');
    confirmDeleteAccountBtn = document.getElementById('confirm-delete-account-btn');
    cancelDeleteAccountBtn = document.getElementById('cancel-delete-account-btn');

    // Statistiques
    statsAdsPublished = document.getElementById('stats-ads-published');
    statsAvgRating = document.getElementById('stats-avg-rating');
    statsFavoritesCount = document.getElementById('stats-favorites-count');

    // --- Écouteurs d'événements ---

    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'profile-modal') {
            loadProfileData();
            switchToViewMode();
            // S'assurer que la section de suppression est cachée initialement
            if (deleteAccountConfirmSection) deleteAccountConfirmSection.classList.add('hidden');
            if (deleteAccountTriggerBtn) deleteAccountTriggerBtn.classList.remove('hidden');
        }
    });

    document.addEventListener('mapMarket:modalClosed', (event) => {
        if (event.detail.modalId === 'profile-modal') {
            cancelEditMode(); // Annuler les modifications non sauvegardées
        }
    });

    if (changeAvatarBtn && avatarUploadInput) {
        changeAvatarBtn.addEventListener('click', () => avatarUploadInput.click());
        avatarUploadInput.addEventListener('change', handleAvatarPreview);
    }

    // Accessibilité : permettre de changer l'avatar en cliquant sur l'image/conteneur
    if (profileAvatarContainer && avatarUploadInput) {
        profileAvatarContainer.setAttribute('tabindex', '0'); // Rendre focusable
        profileAvatarContainer.setAttribute('role', 'button');
        profileAvatarContainer.setAttribute('aria-label', "Changer l'avatar");
        profileAvatarContainer.addEventListener('click', () => avatarUploadInput.click());
        profileAvatarContainer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                avatarUploadInput.click();
            }
        });
    }

    if (removeAvatarBtn) {
        removeAvatarBtn.addEventListener('click', handleRemoveAvatar);
    }

    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', switchToEditMode);
    }
    if (cancelEditProfileBtn) {
        cancelEditProfileBtn.addEventListener('click', cancelEditMode);
    }

    if (profileForm && saveProfileBtn) {
        profileForm.addEventListener('submit', handleProfileUpdate);
    }

    if (deleteAccountTriggerBtn && deleteAccountConfirmSection) {
        deleteAccountTriggerBtn.addEventListener('click', () => {
            deleteAccountConfirmSection.classList.remove('hidden');
            deleteAccountTriggerBtn.classList.add('hidden');
            deleteAccountTriggerBtn.setAttribute('aria-expanded', 'true');
            deleteAccountConfirmSection.setAttribute('aria-hidden', 'false');
            if (deleteAccountCheckbox) deleteAccountCheckbox.focus();
        });
        deleteAccountTriggerBtn.setAttribute('aria-controls', 'delete-account-confirmation-section');
        deleteAccountTriggerBtn.setAttribute('aria-expanded', 'false');
    }

    if (cancelDeleteAccountBtn && deleteAccountConfirmSection && deleteAccountTriggerBtn) {
        cancelDeleteAccountBtn.addEventListener('click', () => {
            deleteAccountConfirmSection.classList.add('hidden');
            deleteAccountTriggerBtn.classList.remove('hidden');
            deleteAccountTriggerBtn.setAttribute('aria-expanded', 'false');
            deleteAccountConfirmSection.setAttribute('aria-hidden', 'true');
            if (deleteAccountCheckbox) deleteAccountCheckbox.checked = false;
            if (confirmDeleteAccountBtn) confirmDeleteAccountBtn.disabled = true;
            deleteAccountTriggerBtn.focus();
        });
    }

    if (deleteAccountCheckbox && confirmDeleteAccountBtn) {
        deleteAccountCheckbox.addEventListener('change', () => {
            confirmDeleteAccountBtn.disabled = !deleteAccountCheckbox.checked;
            confirmDeleteAccountBtn.setAttribute('aria-disabled', String(!deleteAccountCheckbox.checked));
        });
        confirmDeleteAccountBtn.disabled = true; // Initialement désactivé
        confirmDeleteAccountBtn.setAttribute('aria-disabled', 'true');
    }

    if (confirmDeleteAccountBtn) {
        confirmDeleteAccountBtn.addEventListener('click', handleDeleteAccount);
    }

    state.subscribe('currentUserChanged', (userData) => {
        if (profileModal && profileModal.getAttribute('aria-hidden') === 'false') {
            if (userData) {
                // Si la modale est ouverte et que l'utilisateur est mis à jour, recharger les données
                // pour refléter les changements (ex: avatar mis à jour ailleurs)
                populateProfileFields(userData);
            } else {
                // Si l'utilisateur est déconnecté pendant que la modale est ouverte, la fermer.
                // auth.js devrait déjà gérer cela via 'mapmarket:closeAllModals' lors du logout.
                document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'profile-modal' } }));
            }
        }
    });
}

/**
 * Charge les données du profil utilisateur depuis l'API.
 */
async function loadProfileData() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        showToast("Utilisateur non connecté. Impossible de charger le profil.", "error");
        document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'profile-modal' } }));
        return;
    }

    toggleGlobalLoader(true, "Chargement du profil...");
    profileModal.setAttribute('aria-busy', 'true');

    try {
        const response = await secureFetch(`${API_BASE_URL_USERS}/me`, { method: 'GET' }, false);
        toggleGlobalLoader(false);
        profileModal.setAttribute('aria-busy', 'false');

        if (response && response.success && response.data && response.data.user) {
            const freshUserData = response.data.user;
            state.setCurrentUser(freshUserData); // Mettre à jour l'état global avec les données fraîches
            populateProfileFields(freshUserData);
        } else {
            showToast(response.message || "Erreur de chargement des données du profil. Utilisation des données locales.", "warning");
            // En cas d'échec, on affiche les données potentiellement stockées dans state.js
            populateProfileFields(currentUser);
        }
    } catch (error) {
        toggleGlobalLoader(false);
        profileModal.setAttribute('aria-busy', 'false');
        showToast(error.message || "Erreur critique lors du chargement du profil.", "error");
        document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'profile-modal' } }));
    }
}

/**
 * Peuple les champs du formulaire de profil avec les données utilisateur.
 * @param {Object} userData - Les données de l'utilisateur.
 */
function populateProfileFields(userData) {
    if (!userData) return;

    if (profileNameField) profileNameField.value = sanitizeHTML(userData.name || '');
    if (profileEmailField) profileEmailField.value = sanitizeHTML(userData.email || '');

    // Gestion de l'affichage de l'avatar
    if (profileAvatarImg && profileAvatarDefaultIcon && profileAvatarContainer) {
        if (userData.avatarUrl && !userData.avatarUrl.endsWith('avatar-default.svg')) {
            console.log('Valeur de userData.avatarUrl reçue du serveur:', userData.avatarUrl);
            console.log('Chemin final tenté pour profileAvatarImg.src:', avatarSrcToDisplay);
            profileAvatarImg.src = userData.avatarUrl;
            profileAvatarImg.alt = `Avatar de ${sanitizeHTML(userData.name || 'utilisateur')}`;
            profileAvatarImg.classList.remove('hidden');
            profileAvatarDefaultIcon.classList.add('hidden');
            if (removeAvatarBtn) removeAvatarBtn.classList.remove('hidden');
        } else {
            profileAvatarImg.classList.add('hidden');
            profileAvatarDefaultIcon.classList.remove('hidden');
            // S'assurer que l'alt est pertinent même pour l'icône par défaut si l'image est cachée
            profileAvatarContainer.setAttribute('aria-label', `Avatar par défaut pour ${sanitizeHTML(userData.name || 'utilisateur')}. Cliquez pour changer.`);
            if (removeAvatarBtn) removeAvatarBtn.classList.add('hidden');
        }
    }


    // Statistiques (s'assurer que les éléments existent avant de les populer)
    if (statsAdsPublished) statsAdsPublished.textContent = userData.stats?.adsPublished ?? 0;
    if (statsAvgRating) statsAvgRating.textContent = userData.stats?.avgRating ? `${parseFloat(userData.stats.avgRating).toFixed(1)}/5` : 'N/A';
    if (statsFavoritesCount) statsFavoritesCount.textContent = userData.stats?.favoritesCount ?? 0;

    // Assurer que les champs de mot de passe sont vides en mode vue
    if (profileNewPasswordField) profileNewPasswordField.value = '';
    if (profileConfirmPasswordField) profileConfirmPasswordField.value = '';
}


/**
 * Gère la prévisualisation de l'avatar et son téléversement immédiat si en mode édition.
 */
function handleAvatarPreview() {
    if (!avatarUploadInput || !profileAvatarImg) return;
    const file = avatarUploadInput.files[0];

    if (file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            showToast("Format de fichier invalide. Veuillez choisir une image (JPEG, PNG, WebP, GIF).", "error");
            avatarUploadInput.value = '';
            return;
        }
        const maxSize = 2 * 1024 * 1024; // 2MB
        if (file.size > maxSize) {
            showToast("Le fichier est trop volumineux (max 2MB).", "error");
            avatarUploadInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            // Afficher la prévisualisation
            if (profileAvatarImg && profileAvatarDefaultIcon) {
                profileAvatarImg.src = e.target.result;
                profileAvatarImg.classList.remove('hidden');
                profileAvatarDefaultIcon.classList.add('hidden');
            }

            // Si on est en mode édition du profil OU si le bouton "Sauvegarder" n'est pas visible (mode vue simple),
            // on téléverse l'avatar immédiatement.
            // Cela permet de changer l'avatar même sans passer en mode "édition" du nom/mdp.
            await handleAvatarUpload(file);
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Gère le téléversement de l'avatar.
 * @param {File} fileToUpload - Le fichier à uploader.
 */
async function handleAvatarUpload(fileToUpload) {
    if (!fileToUpload) return false;

    const formData = new FormData();
    formData.append('avatar', fileToUpload);

    toggleGlobalLoader(true, "Téléversement de l'avatar...");
    profileModal.setAttribute('aria-busy', 'true');

    try {
        const response = await secureFetch(`${API_BASE_URL_USERS}/avatar`, {
            method: 'POST',
            body: formData,
        }, false);
        toggleGlobalLoader(false);
        profileModal.setAttribute('aria-busy', 'false');

        if (response && response.success && response.data && response.data.avatarUrl) {
            showToast("Avatar mis à jour avec succès !", "success");
            const currentUser = state.getCurrentUser();
            if (currentUser) {
                state.setCurrentUser({ ...currentUser, avatarUrl: response.data.avatarUrl });
                // populateProfileFields sera appelé par le state.subscribe, mettant à jour l'UI
            }
            if (removeAvatarBtn) removeAvatarBtn.classList.remove('hidden');
            avatarUploadInput.value = ''; // Réinitialiser le champ
            return true;
        } else {
            showToast(response.message || "Erreur lors de la mise à jour de l'avatar.", "error");
            // Revenir à l'avatar précédent si l'upload échoue
            const currentUser = state.getCurrentUser();
            if (currentUser) populateProfileFields(currentUser);
            return false;
        }
    } catch (error) {
        toggleGlobalLoader(false);
        profileModal.setAttribute('aria-busy', 'false');
        console.error("Erreur de téléversement de l'avatar:", error);
        showToast(error.message || "Une erreur réseau est survenue.", "error");
        const currentUser = state.getCurrentUser();
        if (currentUser) populateProfileFields(currentUser); // Revenir à l'état précédent
        return false;
    }
}

/**
 * Gère la suppression de l'avatar de l'utilisateur.
 */
async function handleRemoveAvatar() {
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal', // Assurez-vous que cette modale générique existe
            title: 'Supprimer l\'avatar',
            message: 'Êtes-vous sûr de vouloir supprimer votre avatar et revenir à l\'avatar par défaut ?',
            confirmText: 'Supprimer',
            cancelText: 'Annuler',
            onConfirm: async () => {
                toggleGlobalLoader(true, "Suppression de l'avatar...");
                profileModal.setAttribute('aria-busy', 'true');
                try {
                    const response = await secureFetch(`${API_BASE_URL_USERS}/avatar`, {
                        method: 'DELETE'
                    }, false);
                    toggleGlobalLoader(false);
                    profileModal.setAttribute('aria-busy', 'false');

                    if (response && response.success && response.data && response.data.avatarUrl) {
                        showToast("Avatar supprimé avec succès.", "success");
                        const currentUser = state.getCurrentUser();
                        if (currentUser) {
                            state.setCurrentUser({ ...currentUser, avatarUrl: response.data.avatarUrl });
                            // populateProfileFields sera appelé par state.subscribe
                        }
                        if (removeAvatarBtn) removeAvatarBtn.classList.add('hidden');
                        if (avatarUploadInput) avatarUploadInput.value = '';
                    } else {
                        showToast(response.message || "Erreur lors de la suppression de l'avatar.", "error");
                    }
                } catch (error) {
                    toggleGlobalLoader(false);
                    profileModal.setAttribute('aria-busy', 'false');
                    console.error("Erreur de suppression de l'avatar:", error);
                    showToast(error.message || "Une erreur réseau est survenue.", "error");
                }
            }
        }
    }));
}

/**
 * Bascule l'interface du profil en mode édition.
 */
function switchToEditMode() {
    if (!profileForm) return;
    profileForm.dataset.mode = 'edit';
    editableFields.forEach(field => {
        if (field) {
            field.readOnly = false;
            field.classList.remove('readonly'); // Style pour readonly
            field.removeAttribute('aria-readonly');
        }
    });

    if (profileEditActions) profileEditActions.classList.remove('hidden');
    if (editProfileBtn) editProfileBtn.classList.add('hidden');
    if (saveProfileBtn) saveProfileBtn.focus(); // Focus sur le bouton de sauvegarde
}

/**
 * Annule le mode édition et restaure les données initiales.
 */
function cancelEditMode() {
    if (!profileForm || profileForm.dataset.mode !== 'edit') return;
    switchToViewMode(); // Réutilise la logique de passage en mode vue
    // Recharger les données utilisateur pour annuler les changements non sauvegardés dans les champs
    const currentUser = state.getCurrentUser();
    if (currentUser) {
        populateProfileFields(currentUser);
    }
}

/**
 * Bascule l'interface du profil en mode vue (non-édition).
 */
function switchToViewMode() {
    if (!profileForm) return;
    profileForm.dataset.mode = 'view';
    editableFields.forEach(field => {
        if (field) {
            field.readOnly = true;
            field.classList.add('readonly');
            field.setAttribute('aria-readonly', 'true');
        }
    });

    if (profileEditActions) profileEditActions.classList.add('hidden');
    if (editProfileBtn) editProfileBtn.classList.remove('hidden');

    // Nettoyer les champs de mot de passe et les erreurs de validation
    if (profileNewPasswordField) profileNewPasswordField.value = '';
    if (profileConfirmPasswordField) profileConfirmPasswordField.value = '';
    profileForm.querySelectorAll('.form-error-message').forEach(el => {
        el.textContent = '';
        el.classList.add('hidden');
    });
    profileForm.querySelectorAll('[aria-invalid="true"]').forEach(el => {
        el.setAttribute('aria-invalid', 'false');
        const errorMsgId = el.getAttribute('aria-describedby');
        if (errorMsgId) {
            const errorEl = document.getElementById(errorMsgId);
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.classList.add('hidden');
            }
        }
    });
}

/**
 * Règles de validation pour le formulaire de profil.
 */
const profileValidationRules = {
    'profile-name': [
        { type: 'required', message: 'Le nom d\'utilisateur est requis.' },
        { type: 'minLength', value: 3, message: 'Le nom doit comporter au moins 3 caractères.' },
        { type: 'maxLength', value: 50, message: 'Le nom ne doit pas dépasser 50 caractères.' }
    ],
    'profile-new-password': [
        { type: 'minLength', value: 6, message: 'Le mot de passe doit comporter au moins 6 caractères (si modifié).' },
        // { type: 'pattern', value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/, message: 'Doit inclure majuscule, minuscule, chiffre.'} // Exemple de règle de complexité
    ],
    'profile-confirm-password': [
        { type: 'match', value: 'profile-new-password', message: 'Les nouveaux mots de passe ne correspondent pas.' }
    ]
};

/**
 * Gère la soumission du formulaire de mise à jour du profil.
 * @param {Event} event - L'événement de soumission.
 */
async function handleProfileUpdate(event) {
    event.preventDefault();

    const currentRules = JSON.parse(JSON.stringify(profileValidationRules));
    if (profileNewPasswordField && profileNewPasswordField.value.trim() !== '') {
        currentRules['profile-confirm-password'].unshift({ type: 'required', message: 'Veuillez confirmer le nouveau mot de passe.' });
    } else {
        // Si pas de nouveau mdp, les champs mdp ne sont pas requis.
        // On peut retirer minLength pour new-password s'il est vide.
        // Mais validateForm devrait ignorer les champs non-required s'ils sont vides.
        // Pour être sûr, on ne valide password que s'il est rempli.
        if (profileNewPasswordField.value.trim() === '') {
            delete currentRules['profile-new-password']; // Ne pas valider si vide
            delete currentRules['profile-confirm-password']; // Ne pas valider si vide
        }
    }

    if (!profileForm || !validateForm(profileForm, currentRules)) {
        showToast('Veuillez corriger les erreurs dans le formulaire.', 'error');
        return;
    }

    const name = profileNameField.value.trim();
    const newPassword = profileNewPasswordField.value; // Ne pas trimmer

    const updateData = { name };
    if (newPassword) {
        updateData.password = newPassword;
    }

    toggleGlobalLoader(true, "Mise à jour du profil...");
    profileModal.setAttribute('aria-busy', 'true');

    try {
        const response = await secureFetch(`${API_BASE_URL_USERS}/profile`, {
            method: 'PUT',
            body: updateData
        }, false);
        toggleGlobalLoader(false);
        profileModal.setAttribute('aria-busy', 'false');

        if (response && response.success && response.data && response.data.user) {
            showToast("Profil mis à jour avec succès !", "success");
            state.setCurrentUser(response.data.user);
            // populateProfileFields sera appelé par state.subscribe
            switchToViewMode();
            // Les champs de mot de passe sont déjà nettoyés par populateProfileFields via switchToViewMode et le state update.
        } else {
            showToast(response.message || "Erreur lors de la mise à jour du profil.", "error");
        }
    } catch (error) {
        toggleGlobalLoader(false);
        profileModal.setAttribute('aria-busy', 'false');
        console.error("Erreur de mise à jour du profil:", error);
        showToast(error.message || "Une erreur réseau est survenue.", "error");
    }
}

/**
 * Gère la suppression (désactivation) du compte utilisateur.
 */
async function handleDeleteAccount() {
    if (!deleteAccountCheckbox || !deleteAccountCheckbox.checked) {
        showToast("Veuillez cocher la case pour confirmer la suppression.", "warning");
        return;
    }

    // Double confirmation via une modale dédiée
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal',
            title: 'Confirmation de suppression du compte',
            message: 'Êtes-vous absolument sûr de vouloir désactiver votre compte ? Cette action est irréversible.',
            confirmText: 'Oui, désactiver mon compte',
            cancelText: 'Annuler',
            isDestructive: true, // Pour styler le bouton de confirmation en rouge par exemple
            onConfirm: async () => {
                performAccountDeactivation();
            }
        }
    }));
}

/**
 * Effectue la désactivation du compte après confirmation.
 */
async function performAccountDeactivation() {
    toggleGlobalLoader(true, "Désactivation du compte en cours...");
    profileModal.setAttribute('aria-busy', 'true');

    try {
        // L'endpoint /api/users/me/deactivate est utilisé, en accord avec le userController (supposé)
        // pour une action sur l'utilisateur authentifié.
        const response = await secureFetch(`${API_BASE_URL_USERS}/me/deactivate`, { // Ou /me si la route est /api/users/me (DELETE)
            method: 'DELETE',
        }, false);
        toggleGlobalLoader(false);
        profileModal.setAttribute('aria-busy', 'false');

        if (response && response.success) {
            showToast("Votre compte a été désactivé avec succès.", "success", 5000);
            // La fonction logout de auth.js gère la suppression du token, la mise à jour de l'état et la redirection/UI.
            logout();
            // La modale de profil devrait se fermer (géré par le mapMarket:closeAllModals dans logout)
            // ou on peut le forcer ici si besoin, mais logout() devrait suffire.
            // document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'profile-modal' } }));

        } else {
            showToast(response.message || "Erreur lors de la désactivation du compte.", "error");
        }
    } catch (error) {
        toggleGlobalLoader(false);
        profileModal.setAttribute('aria-busy', 'false');
        console.error("Erreur de désactivation de compte:", error);
        showToast(error.message || "Une erreur réseau est survenue.", "error");
    } finally {
        // Réinitialiser la section de confirmation de suppression dans la modale profil
        if (deleteAccountConfirmSection) deleteAccountConfirmSection.classList.add('hidden');
        if (deleteAccountTriggerBtn) deleteAccountTriggerBtn.classList.remove('hidden');
        if (deleteAccountCheckbox) deleteAccountCheckbox.checked = false;
        if (confirmDeleteAccountBtn) {
            confirmDeleteAccountBtn.disabled = true;
            confirmDeleteAccountBtn.setAttribute('aria-disabled', 'true');
        }
    }
}

/**
 * Initialise le module de profil.
 */
export function init() {
    initProfileUI();
    console.log('Module Profile initialisé.');
}
