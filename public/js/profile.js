// js/profile.js

/**
 * @file profile.js
 * @description Gestion du profil utilisateur : affichage, édition (nom, mot de passe, avatar),
 * et suppression de compte.
 */

import * as state from './state.js';
import { showToast, validateForm, validateField, secureFetch, toggleGlobalLoader, sanitizeHTML } from './utils.js';

const API_BASE_URL_USERS = '/api/users'; // Pour la mise à jour du profil, avatar
const API_BASE_URL_AUTH = '/api/auth'; // Pour la suppression de compte (peut être sur /api/users)

// --- Éléments du DOM pour le profil ---
let profileModal;
let profileAvatarImg, profileAvatarPreviewContainer, avatarUploadInput, changeAvatarBtn, removeAvatarBtn;
let profileForm, profileNameField, profileEmailField, profileNewPasswordField, profileConfirmPasswordField;
let editProfileBtn, saveProfileBtn, cancelEditProfileBtn;
let deleteAccountTriggerBtn, deleteAccountConfirmSection, deleteAccountCheckbox, confirmDeleteAccountBtn, cancelDeleteAccountBtn;
let statsAdsPublished, statsAvgRating, statsFavoritesCount;

// Champs en mode édition
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
    profileAvatarImg = document.getElementById('profile-avatar-img');
    profileAvatarPreviewContainer = document.getElementById('avatar-preview-container');
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
    const profileEditActions = document.getElementById('profile-edit-actions');


    // Section suppression de compte
    deleteAccountTriggerBtn = document.getElementById('delete-account-trigger-btn') || document.getElementById('settings-delete-account-btn'); // Peut être dans profil ou settings
    deleteAccountConfirmSection = document.getElementById('delete-account-confirmation-section');
    deleteAccountCheckbox = document.getElementById('delete-account-confirm-checkbox');
    confirmDeleteAccountBtn = document.getElementById('confirm-delete-account-btn');
    cancelDeleteAccountBtn = document.getElementById('cancel-delete-account-btn');

    // Statistiques (affichage simple pour l'instant)
    statsAdsPublished = document.getElementById('stats-ads-published');
    statsAvgRating = document.getElementById('stats-avg-rating');
    statsFavoritesCount = document.getElementById('stats-favorites-count');

    // --- Écouteurs d'événements ---

    // Ouverture de la modale de profil (gérée par modals.js via data-modal-trigger ou événement custom)
    // On écoute l'événement custom pour charger les données si la modale s'ouvre.
    document.addEventListener('mapMarket:modalOpened', (event) => {
        if (event.detail.modalId === 'profile-modal') {
            loadProfileData();
            switchToViewMode(); // S'assurer qu'on est en mode vue par défaut
        }
    });
    document.addEventListener('mapMarket:modalClosed', (event) => {
        if (event.detail.modalId === 'profile-modal') {
            cancelEditMode(); // Annuler les modifications non sauvegardées si on ferme la modale
        }
    });


    if (changeAvatarBtn && avatarUploadInput) {
        changeAvatarBtn.addEventListener('click', () => avatarUploadInput.click());
        avatarUploadInput.addEventListener('change', handleAvatarPreview);
    }
    if (profileAvatarPreviewContainer && avatarUploadInput) { // Permettre de cliquer sur l'image pour changer
        profileAvatarPreviewContainer.addEventListener('click', () => avatarUploadInput.click());
         profileAvatarPreviewContainer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
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
        });
    }
    if (cancelDeleteAccountBtn && deleteAccountConfirmSection && deleteAccountTriggerBtn) {
        cancelDeleteAccountBtn.addEventListener('click', () => {
            deleteAccountConfirmSection.classList.add('hidden');
            deleteAccountTriggerBtn.classList.remove('hidden');
            if(deleteAccountCheckbox) deleteAccountCheckbox.checked = false;
            if(confirmDeleteAccountBtn) confirmDeleteAccountBtn.disabled = true;
        });
    }
    if (deleteAccountCheckbox && confirmDeleteAccountBtn) {
        deleteAccountCheckbox.addEventListener('change', () => {
            confirmDeleteAccountBtn.disabled = !deleteAccountCheckbox.checked;
        });
    }
    if (confirmDeleteAccountBtn) {
        confirmDeleteAccountBtn.addEventListener('click', handleDeleteAccount);
    }

    // S'abonner aux changements de l'utilisateur pour mettre à jour le profil si nécessaire
    state.subscribe('currentUserChanged', (userData) => {
        if (userData && profileModal && profileModal.getAttribute('aria-hidden') === 'false') {
            // Si la modale de profil est ouverte et que les données utilisateur changent (ex: après une action dans un autre onglet)
            loadProfileData(userData);
        } else if (!userData) {
            // Si l'utilisateur est déconnecté, on ne fait rien ici, auth.js gère la fermeture des modales.
        }
    });
}

/**
 * Charge et affiche les données du profil de l'utilisateur connecté.
 * @param {Object} [userData=null] - Les données utilisateur à afficher. Si null, les prend depuis l'état.
 */
function loadProfileData(userData = null) {
    const currentUser = userData || state.getCurrentUser();

    if (currentUser) {
        if (profileNameField) profileNameField.value = sanitizeHTML(currentUser.name || '');
        if (profileEmailField) profileEmailField.value = sanitizeHTML(currentUser.email || '');
        if (profileAvatarImg) {
            profileAvatarImg.src = currentUser.avatarUrl || 'avatar-default.svg';
            profileAvatarImg.alt = `Avatar de ${sanitizeHTML(currentUser.name || 'utilisateur')}`;
        }
        if (removeAvatarBtn) {
            removeAvatarBtn.classList.toggle('hidden', !currentUser.avatarUrl || currentUser.avatarUrl.endsWith('avatar-default.svg'));
        }


        // Charger les statistiques (simulées pour l'instant)
        if (statsAdsPublished) statsAdsPublished.textContent = currentUser.stats?.adsPublished || 0;
        if (statsAvgRating) statsAvgRating.textContent = currentUser.stats?.avgRating || 'N/A';
        if (statsFavoritesCount) statsFavoritesCount.textContent = currentUser.stats?.favoritesCount || 0;

    } else {
        // Normalement, la modale de profil ne devrait pas être accessible si non connecté.
        // Mais par sécurité :
        showToast("Utilisateur non connecté. Impossible de charger le profil.", "error");
        document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'profile-modal' } }));
    }
}

/**
 * Gère la prévisualisation de l'avatar lorsque l'utilisateur sélectionne un fichier.
 */
function handleAvatarPreview() {
    if (!avatarUploadInput || !profileAvatarImg) return;
    const file = avatarUploadInput.files[0];
    if (file) {
        // Validation côté client (type, taille)
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            showToast("Format de fichier invalide. Veuillez choisir une image (JPEG, PNG, WebP, GIF).", "error");
            avatarUploadInput.value = ''; // Réinitialiser le champ
            return;
        }
        const maxSize = 2 * 1024 * 1024; // 2MB
        if (file.size > maxSize) {
            showToast("Le fichier est trop volumineux (max 2MB).", "error");
            avatarUploadInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            profileAvatarImg.src = e.target.result;
            if (removeAvatarBtn) removeAvatarBtn.classList.remove('hidden');
            // Si on est en mode édition, on pourrait directement uploader l'avatar ici
            // ou attendre la sauvegarde du profil. Pour l'instant, on attend la sauvegarde.
            if (saveProfileBtn && !saveProfileBtn.classList.contains('hidden')) { // Si en mode édition
                 handleAvatarUpload(file); // Uploader directement
            }
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Gère le téléversement de l'avatar.
 * @param {File} [fileToUpload=null] - Le fichier à uploader. Si null, utilise avatarUploadInput.files[0].
 */
async function handleAvatarUpload(fileToUpload = null) {
    const file = fileToUpload || (avatarUploadInput ? avatarUploadInput.files[0] : null);
    if (!file) {
        // showToast("Aucun fichier sélectionné pour l'avatar.", "info");
        return false; // Pas de fichier à uploader
    }

    const formData = new FormData();
    formData.append('avatar', file); // 'avatar' doit correspondre au nom attendu par le backend

    try {
        toggleGlobalLoader(true, "Téléversement de l'avatar...");
        const response = await secureFetch(`${API_BASE_URL_USERS}/avatar`, {
            method: 'POST',
            body: formData, // secureFetch gère la suppression du Content-Type pour FormData
        }, false); // false car toggleGlobalLoader est déjà appelé
        toggleGlobalLoader(false);

        if (response && response.avatarUrl) {
            showToast("Avatar mis à jour avec succès !", "success");
            // Mettre à jour l'état utilisateur avec la nouvelle URL de l'avatar
            const currentUser = state.getCurrentUser();
            if (currentUser) {
                state.setCurrentUser({ ...currentUser, avatarUrl: response.avatarUrl });
                // La mise à jour de l'UI (profileAvatarImg, header avatar) sera gérée par le listener de currentUserChanged
                // ou on peut le forcer ici :
                 if (profileAvatarImg) profileAvatarImg.src = response.avatarUrl;
                 const headerAvatar = document.getElementById('header-profile-avatar');
                 if (headerAvatar) headerAvatar.src = response.avatarUrl;
            }
            if (removeAvatarBtn) removeAvatarBtn.classList.remove('hidden');
            avatarUploadInput.value = ''; // Réinitialiser le champ après succès
            return true;
        } else {
            showToast(response.message || "Erreur lors de la mise à jour de l'avatar.", "error");
            return false;
        }
    } catch (error) {
        toggleGlobalLoader(false);
        // secureFetch gère déjà le toast d'erreur réseau/serveur.
        console.error("Erreur de téléversement de l'avatar:", error);
        return false;
    }
}

/**
 * Gère la suppression de l'avatar de l'utilisateur.
 */
async function handleRemoveAvatar() {
    // Confirmation (peut être une modale de confirmation dédiée ou un simple confirm)
    // Pour cet exemple, on utilise une confirmation simple, mais une modale est mieux.
    // window.confirm est bloquant, à éviter. Utiliser une modale de confirmation custom.
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal',
            title: 'Supprimer l\'avatar',
            message: 'Êtes-vous sûr de vouloir supprimer votre avatar ?',
            onConfirm: async () => {
                try {
                    toggleGlobalLoader(true, "Suppression de l'avatar...");
                    const response = await secureFetch(`${API_BASE_URL_USERS}/avatar`, {
                        method: 'DELETE'
                    }, false);
                    toggleGlobalLoader(false);

                    if (response && response.success) { // Le backend devrait confirmer la suppression
                        showToast("Avatar supprimé avec succès.", "success");
                        const defaultAvatar = 'avatar-default.svg';
                        const currentUser = state.getCurrentUser();
                        if (currentUser) {
                            state.setCurrentUser({ ...currentUser, avatarUrl: defaultAvatar });
                        }
                        if (profileAvatarImg) profileAvatarImg.src = defaultAvatar;
                        const headerAvatar = document.getElementById('header-profile-avatar');
                        if (headerAvatar) headerAvatar.src = defaultAvatar;
                        if (removeAvatarBtn) removeAvatarBtn.classList.add('hidden');
                        if (avatarUploadInput) avatarUploadInput.value = '';
                    } else {
                        showToast(response.message || "Erreur lors de la suppression de l'avatar.", "error");
                    }
                } catch (error) {
                    toggleGlobalLoader(false);
                    console.error("Erreur de suppression de l'avatar:", error);
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
    editableFields.forEach(field => field.readOnly = false);
    if (profileNameField) profileNameField.removeAttribute('readonly');


    const profileEditActions = document.getElementById('profile-edit-actions');
    if (profileEditActions) profileEditActions.classList.remove('hidden');
    if (editProfileBtn) editProfileBtn.classList.add('hidden');

    // Focus sur le premier champ éditable
    if (profileNameField) profileNameField.focus();
}

/**
 * Annule le mode édition et restaure les données initiales.
 */
function cancelEditMode() {
    if (!profileForm || profileForm.dataset.mode !== 'edit') return; // Ne rien faire si pas en mode édition
    profileForm.dataset.mode = 'view';
    editableFields.forEach(field => {
        if(field) field.readOnly = true;
    });
    if (profileNameField) profileNameField.setAttribute('readonly', true);


    const profileEditActions = document.getElementById('profile-edit-actions');
    if (profileEditActions) profileEditActions.classList.add('hidden');
    if (editProfileBtn) editProfileBtn.classList.remove('hidden');

    // Réinitialiser les messages d'erreur et les valeurs des champs de mot de passe
    if (profileNewPasswordField) profileNewPasswordField.value = '';
    if (profileConfirmPasswordField) profileConfirmPasswordField.value = '';
    profileForm.querySelectorAll('.form-error-message').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
    profileForm.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));


    // Recharger les données utilisateur pour annuler les changements non sauvegardés
    loadProfileData();
}
/**
 * Bascule l'interface du profil en mode vue (non-édition).
 */
function switchToViewMode() {
    if (!profileForm) return;
    profileForm.dataset.mode = 'view';
    editableFields.forEach(field => {
        if(field) field.readOnly = true;
    });
     if (profileNameField) profileNameField.setAttribute('readonly', true);


    const profileEditActions = document.getElementById('profile-edit-actions');
    if (profileEditActions) profileEditActions.classList.add('hidden');
    if (editProfileBtn) editProfileBtn.classList.remove('hidden');

    if (profileNewPasswordField) profileNewPasswordField.value = '';
    if (profileConfirmPasswordField) profileConfirmPasswordField.value = '';
    profileForm.querySelectorAll('.form-error-message').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
}


/**
 * Règles de validation pour le formulaire de profil.
 */
const profileValidationRules = {
    'profile-name': [
        { type: 'required', message: 'Le nom d\'utilisateur est requis.' },
        { type: 'minLength', value: 3, message: 'Le nom doit comporter au moins 3 caractères.' }
    ],
    'profile-new-password': [
        // Non requis, mais si rempli, doit respecter les règles
        { type: 'minLength', value: 6, message: 'Le mot de passe doit comporter au moins 6 caractères (si modifié).' }
    ],
    'profile-confirm-password': [
        // Requis seulement si profile-new-password est rempli
        { type: 'match', value: 'profile-new-password', message: 'Les nouveaux mots de passe ne correspondent pas.' }
    ]
};

/**
 * Gère la soumission du formulaire de mise à jour du profil.
 * @param {Event} event - L'événement de soumission.
 */
async function handleProfileUpdate(event) {
    event.preventDefault();

    // Ajuster les règles de validation dynamiquement pour la confirmation du mot de passe
    const currentRules = JSON.parse(JSON.stringify(profileValidationRules)); // Deep copy
    if (profileNewPasswordField && profileNewPasswordField.value.trim() !== '') {
        // Si un nouveau mot de passe est entré, sa confirmation devient requise
        currentRules['profile-confirm-password'].unshift({ type: 'required', message: 'Veuillez confirmer le nouveau mot de passe.' });
    } else {
        // Si aucun nouveau mot de passe, on peut alléger les contraintes sur la confirmation
        // ou s'assurer qu'elle n'est pas validée si vide.
        // Pour l'instant, la règle 'match' ne se déclenchera que si les deux sont remplis.
    }


    if (!profileForm || !validateForm(profileForm, currentRules)) {
        showToast('Veuillez corriger les erreurs dans le formulaire.', 'error');
        return;
    }

    const name = profileNameField.value.trim();
    const newPassword = profileNewPasswordField.value; // Ne pas trimmer le mot de passe

    const updateData = { name };
    if (newPassword) {
        updateData.password = newPassword; // Le backend s'attend à 'password' pour un nouveau mot de passe
    }

    // Le téléversement de l'avatar est géré séparément par handleAvatarUpload si l'utilisateur change l'image.
    // Si l'avatar a été prévisualisé mais pas encore uploadé (logique alternative), on pourrait l'uploader ici.
    // Pour ce modèle, on suppose que handleAvatarPreview ou un bouton "Sauver avatar" dédié appelle handleAvatarUpload.

    try {
        toggleGlobalLoader(true, "Mise à jour du profil...");
        const response = await secureFetch(`${API_BASE_URL_USERS}/profile`, {
            method: 'PUT', // Ou PATCH selon votre API
            body: updateData
        }, false);
        toggleGlobalLoader(false);

        if (response && response.user) {
            showToast("Profil mis à jour avec succès !", "success");
            state.setCurrentUser(response.user); // Met à jour l'état global
            // La mise à jour de l'UI (nom dans header, etc.) sera gérée par le listener de currentUserChanged
            switchToViewMode();
            // Vider les champs de mot de passe après succès
            if (profileNewPasswordField) profileNewPasswordField.value = '';
            if (profileConfirmPasswordField) profileConfirmPasswordField.value = '';
        } else {
            showToast(response.message || "Erreur lors de la mise à jour du profil.", "error");
        }
    } catch (error) {
        toggleGlobalLoader(false);
        console.error("Erreur de mise à jour du profil:", error);
    }
}


/**
 * Gère la suppression du compte utilisateur.
 */
async function handleDeleteAccount() {
    if (!deleteAccountCheckbox || !deleteAccountCheckbox.checked) {
        showToast("Veuillez cocher la case pour confirmer la suppression.", "warning");
        return;
    }

    try {
        toggleGlobalLoader(true, "Suppression du compte en cours...");
        // L'endpoint pour la suppression de compte peut nécessiter une confirmation de mot de passe
        // ou être sur /api/auth/delete-account ou /api/users/me
        const response = await secureFetch(`${API_BASE_URL_AUTH}/delete-account`, { // Ou API_BASE_URL_USERS
            method: 'DELETE',
            // Optionnel: envoyer le mot de passe actuel pour confirmation si requis par le backend
            // body: { currentPassword: '...' }
        }, false);
        toggleGlobalLoader(false);

        if (response && response.success) { // Le backend devrait confirmer
            showToast("Votre compte a été supprimé avec succès.", "success");
            // Déconnecter l'utilisateur et réinitialiser l'application
            // La fonction logout de auth.js s'occupera de nettoyer le token et l'état.
            if (typeof window.mapMarketLogout === 'function') { // Si logout est exposé globalement ou importé
                window.mapMarketLogout();
            } else { // Fallback si logout n'est pas directement accessible
                localStorage.removeItem('mapmarket_auth_token'); // Assurez-vous que la clé est correcte
                state.resetState();
                window.location.reload(); // Forcer un rechargement complet
            }
            document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'profile-modal' } }));

        } else {
            showToast(response.message || "Erreur lors de la suppression du compte.", "error");
        }
    } catch (error) {
        toggleGlobalLoader(false);
        console.error("Erreur de suppression de compte:", error);
    } finally {
        // Réinitialiser la section de confirmation
        if (deleteAccountConfirmSection) deleteAccountConfirmSection.classList.add('hidden');
        if (deleteAccountTriggerBtn) deleteAccountTriggerBtn.classList.remove('hidden');
        if (deleteAccountCheckbox) deleteAccountCheckbox.checked = false;
        if (confirmDeleteAccountBtn) confirmDeleteAccountBtn.disabled = true;
    }
}


/**
 * Initialise le module de profil.
 */
export function init() {
    initProfileUI();
    // La première charge de données se fera via l'événement 'mapMarket:modalOpened'
    // ou si l'utilisateur est déjà connecté et que la modale est ouverte au démarrage (peu probable).
    console.log('Module Profile initialisé.');
}

// L'initialisation sera appelée depuis main.js
// init();
