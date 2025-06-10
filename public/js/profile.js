// js/profile.js

/**
 * @file profile.js
 * @description Gestion du profil utilisateur : affichage, édition (nom, mot de passe, avatar),
 * et désactivation de compte.
 * @version 1.1.0 - Corrigé pour l'affichage de l'avatar et la robustesse.
 */

import * as state from './state.js';
import { showToast, validateForm, secureFetch, toggleGlobalLoader, sanitizeHTML } from './utils.js';
import { logout } from './auth.js'; // Importation explicite de la fonction logout

const API_BASE_URL_USERS = '/api/users';

// --- Éléments du DOM pour le profil ---
let profileModal;
let profileAvatarContainer, profileAvatarImg, avatarUploadInput, changeAvatarBtn, removeAvatarBtn;
let profileForm, profileNameField, profileEmailField, profileNewPasswordField, profileConfirmPasswordField;
let editProfileBtn, saveProfileBtn, cancelEditProfileBtn, profileEditActions;
let deleteAccountTriggerBtn, deleteAccountConfirmSection, deleteAccountCheckbox, confirmDeleteAccountBtn, cancelDeleteAccountBtn;
let statsAdsPublished, statsAvgRating, statsFavoritesCount;

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
    profileAvatarContainer = document.getElementById('avatar-preview-container');
    profileAvatarImg = document.getElementById('profile-avatar-img');
    avatarUploadInput = document.getElementById('avatar-upload-input');
    changeAvatarBtn = document.getElementById('change-avatar-btn');
    removeAvatarBtn = document.getElementById('remove-avatar-btn');

    // Formulaire de profil
    profileForm = document.getElementById('profile-form');
    profileNameField = document.getElementById('profile-name');
    profileEmailField = document.getElementById('profile-email');
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
            if (deleteAccountConfirmSection) deleteAccountConfirmSection.classList.add('hidden');
            if (deleteAccountTriggerBtn) deleteAccountTriggerBtn.classList.remove('hidden');
        }
    });

    document.addEventListener('mapMarket:modalClosed', (event) => {
        if (event.detail.modalId === 'profile-modal') {
            cancelEditMode();
        }
    });

    if (changeAvatarBtn && avatarUploadInput) {
        changeAvatarBtn.addEventListener('click', () => avatarUploadInput.click());
        avatarUploadInput.addEventListener('change', handleAvatarPreview);
    }

    if (profileAvatarContainer && avatarUploadInput) {
        profileAvatarContainer.setAttribute('tabindex', '0');
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

    if (editProfileBtn) editProfileBtn.addEventListener('click', switchToEditMode);
    if (cancelEditProfileBtn) cancelEditProfileBtn.addEventListener('click', cancelEditMode);
    if (profileForm && saveProfileBtn) profileForm.addEventListener('submit', handleProfileUpdate);
    if (deleteAccountTriggerBtn) {
        deleteAccountTriggerBtn.addEventListener('click', () => {
            if (deleteAccountConfirmSection) deleteAccountConfirmSection.classList.remove('hidden');
            deleteAccountTriggerBtn.classList.add('hidden');
        });
    }
    if (cancelDeleteAccountBtn) {
        cancelDeleteAccountBtn.addEventListener('click', () => {
            if (deleteAccountConfirmSection) deleteAccountConfirmSection.classList.add('hidden');
            if (deleteAccountTriggerBtn) deleteAccountTriggerBtn.classList.remove('hidden');
            if (deleteAccountCheckbox) deleteAccountCheckbox.checked = false;
            if (confirmDeleteAccountBtn) confirmDeleteAccountBtn.disabled = true;
        });
    }

    if (deleteAccountCheckbox && confirmDeleteAccountBtn) {
        deleteAccountCheckbox.addEventListener('change', () => {
            confirmDeleteAccountBtn.disabled = !deleteAccountCheckbox.checked;
        });
        confirmDeleteAccountBtn.disabled = true;
    }

    if (confirmDeleteAccountBtn) confirmDeleteAccountBtn.addEventListener('click', handleDeleteAccount);

    state.subscribe('currentUserChanged', (userData) => {
        if (profileModal && profileModal.getAttribute('aria-hidden') === 'false') {
            if (userData) {
                populateProfileFields(userData);
            } else {
                document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'profile-modal' } }));
            }
        }
    });
}

async function loadProfileData() {
    const currentUser = state.getCurrentUser();
    if (!currentUser) {
        showToast("Utilisateur non connecté. Impossible de charger le profil.", "error");
        document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'profile-modal' } }));
        return;
    }
    try {
        const response = await secureFetch(`${API_BASE_URL_USERS}/me`);
        if (response && response.success && response.data && response.data.user) {
            state.setCurrentUser(response.data.user);
            populateProfileFields(response.data.user);
        } else {
            showToast(response.message || "Erreur de chargement des données du profil.", "warning");
            populateProfileFields(currentUser);
        }
    } catch (error) {
        showToast(error.message || "Erreur critique lors du chargement du profil.", "error");
        document.dispatchEvent(new CustomEvent('mapmarket:closeModal', { detail: { modalId: 'profile-modal' } }));
    }
}

/**
 * Peuple les champs du formulaire de profil avec les données utilisateur.
 * Version corrigée pour afficher correctement l'avatar.
 * @param {Object} userData - Les données de l'utilisateur.
 */
function populateProfileFields(userData) {
    if (!userData) return;

    if (profileNameField) profileNameField.value = sanitizeHTML(userData.name || '');
    if (profileEmailField) profileEmailField.value = sanitizeHTML(userData.email || '');

    // Gestion de l'affichage de l'avatar
    if (profileAvatarImg && profileAvatarContainer) {
        if (userData.avatarUrl && !userData.avatarUrl.endsWith('avatar-default.svg')) {
            // L'URL est complète grâce au backend (ex: http://localhost:5001/uploads/avatars/...)
            profileAvatarImg.src = userData.avatarUrl;
            profileAvatarImg.alt = `Avatar de ${sanitizeHTML(userData.name || 'utilisateur')}`;
            profileAvatarImg.classList.remove('hidden');

            if (removeAvatarBtn) removeAvatarBtn.classList.remove('hidden');
        } else {
            // Pas d'avatar personnalisé, afficher l'état par défaut
            profileAvatarImg.src = 'avatar-default.svg'; // Réinitialiser au défaut
            profileAvatarImg.alt = 'Avatar par défaut';
            // Il n'est pas nécessaire de cacher l'élément img, il affichera l'avatar par défaut
            // ou l'image de secours définie dans son attribut onerror.
            if (removeAvatarBtn) removeAvatarBtn.classList.add('hidden');
        }
    }

    // Statistiques
    if (statsAdsPublished) statsAdsPublished.textContent = userData.stats?.adsPublished ?? '0';
    if (statsAvgRating) statsAvgRating.textContent = userData.stats?.avgRating ? `${parseFloat(userData.stats.avgRating).toFixed(1)}/5` : 'N/A';
    if (statsFavoritesCount) statsFavoritesCount.textContent = userData.stats?.favoritesCount ?? '0';

    if (profileNewPasswordField) profileNewPasswordField.value = '';
    if (profileConfirmPasswordField) profileConfirmPasswordField.value = '';
}


async function handleAvatarPreview() {
    if (!avatarUploadInput || !profileAvatarImg) return;
    const file = avatarUploadInput.files[0];
    if (file) {
        await handleAvatarUpload(file);
    }
}

async function handleAvatarUpload(fileToUpload) {
    if (!fileToUpload) return false;
    const formData = new FormData();
    formData.append('avatar', fileToUpload);

    toggleGlobalLoader(true, "Téléversement...");
    try {
        const response = await secureFetch(`${API_BASE_URL_USERS}/avatar`, { method: 'POST', body: formData }, false);
        if (response && response.success && response.data.avatarUrl) {
            showToast("Avatar mis à jour !", "success");
            const currentUser = state.getCurrentUser();
            if (currentUser) {
                state.setCurrentUser({ ...currentUser, avatarUrl: response.data.avatarUrl });
            }
            return true;
        }
        throw new Error(response.message || "Erreur de mise à jour de l'avatar.");
    } catch (error) {
        showToast(error.message, "error");
        const currentUser = state.getCurrentUser();
        if (currentUser) populateProfileFields(currentUser);
        return false;
    } finally {
        toggleGlobalLoader(false);
    }
}

async function handleRemoveAvatar() {
    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal',
            title: 'Supprimer l\'avatar',
            message: 'Voulez-vous vraiment supprimer votre avatar ?',
            onConfirm: async () => {
                toggleGlobalLoader(true, "Suppression...");
                try {
                    const response = await secureFetch(`${API_BASE_URL_USERS}/avatar`, { method: 'DELETE' }, false);
                    if (response && response.success) {
                        showToast("Avatar supprimé.", "success");
                        const currentUser = state.getCurrentUser();
                        if (currentUser) {
                            state.setCurrentUser({ ...currentUser, avatarUrl: 'avatar-default.svg' });
                        }
                    } else throw new Error(response.message);
                } catch (error) {
                    showToast(error.message || "Erreur de suppression.", "error");
                } finally {
                    toggleGlobalLoader(false);
                }
            }
        }
    }));
}

function switchToEditMode() {
    if (profileEditActions) profileEditActions.classList.remove('hidden');
    if (editProfileBtn) editProfileBtn.classList.add('hidden');
    editableFields.forEach(field => {
        if (field) {
            field.readOnly = false;
            field.classList.remove('readonly');
        }
    });
    if (profileNameField) profileNameField.focus();
}

function cancelEditMode() {
    switchToViewMode();
    const currentUser = state.getCurrentUser();
    if (currentUser) {
        populateProfileFields(currentUser);
    }
}

function switchToViewMode() {
    if (profileEditActions) profileEditActions.classList.add('hidden');
    if (editProfileBtn) editProfileBtn.classList.remove('hidden');
    editableFields.forEach(field => {
        if (field) {
            field.readOnly = true;
            field.classList.add('readonly');
            field.value = ''; // Clear password fields for security
        }
    });
    // Re-populate with original data to discard changes
    populateProfileFields(state.getCurrentUser());
}


const profileValidationRules = {
    'profile-name': [
        { type: 'required', message: 'Le nom d\'utilisateur est requis.' },
        { type: 'minLength', value: 3, message: 'Le nom doit comporter au moins 3 caractères.' }
    ],
    'profile-new-password': [
        { type: 'minLength', value: 6, message: 'Le mot de passe doit comporter au moins 6 caractères (si modifié).' }
    ],
    'profile-confirm-password': [
        { type: 'match', value: 'profile-new-password', message: 'Les nouveaux mots de passe ne correspondent pas.' }
    ]
};


async function handleProfileUpdate(event) {
    event.preventDefault();
    const rules = { ...profileValidationRules };
    if (!profileNewPasswordField.value) {
        delete rules['profile-new-password'];
        delete rules['profile-confirm-password'];
    }

    if (!validateForm(profileForm, rules)) {
        showToast("Veuillez corriger les erreurs.", "error");
        return;
    }

    const updateData = { name: profileNameField.value.trim() };
    if (profileNewPasswordField.value) {
        updateData.password = profileNewPasswordField.value;
    }

    toggleGlobalLoader(true, "Mise à jour...");
    try {
        const response = await secureFetch(`${API_BASE_URL_USERS}/profile`, { method: 'PUT', body: updateData }, false);
        if (response && response.success && response.data.user) {
            showToast("Profil mis à jour !", "success");
            state.setCurrentUser(response.data.user);
            switchToViewMode();
        } else throw new Error(response.message);
    } catch (error) {
        showToast(error.message || "Erreur de mise à jour.", "error");
    } finally {
        toggleGlobalLoader(false);
    }
}

async function handleDeleteAccount() {
    if (!deleteAccountCheckbox || !deleteAccountCheckbox.checked) return;

    document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
        detail: {
            modalId: 'confirmation-modal',
            title: 'Confirmation de suppression',
            message: 'Cette action est irréversible. Toutes vos données seront supprimées. Êtes-vous sûr ?',
            onConfirm: performAccountDeactivation
        }
    }));
}

async function performAccountDeactivation() {
    toggleGlobalLoader(true, "Suppression du compte...");
    try {
        const response = await secureFetch(`${API_BASE_URL_USERS}/me/deactivate`, { method: 'DELETE' }, false);
        if (response && response.success) {
            showToast("Votre compte a été désactivé.", "success", 5000);
            logout(); // Gère la déconnexion et le nettoyage local
        } else throw new Error(response.message);
    } catch (error) {
        showToast(error.message || "Erreur de suppression.", "error");
    } finally {
        toggleGlobalLoader(false);
    }
}

/**
 * Initialise le module de profil.
 */
export function init() {
    initProfileUI();
    console.log('Module Profile initialisé.');
}