// js/profile.js

/**
 * Module de gestion du profil utilisateur (MapMarket)
 * ---------------------------------------------------
 * Fonctionnalités :
 *   • Affichage des informations utilisateur (avatar, stats, badges…)
 *   • Mode édition (nom, avatar, mot de passe)
 *   • Suppression d’avatar & désactivation de compte
 *   • Mécanismes robustes d’erreurs, sécurité & UX
 *
 * Contrainte : conserver tous les noms de variables externes existants
 * pour assurer la rétro‑compatibilité avec le reste du codebase.
 *
 * @author  MapMarket
 * @version 2.0.0
 */

// -------------------- Dépendances --------------------
import * as state from './state.js';
import {
  showToast,
  validateForm, // conservé pour compatibilité même s’il n’est pas utilisé ici
  secureFetch,
  toggleGlobalLoader,
  sanitizeHTML,
} from './utils.js';
import { logout } from './auth.js';

// -------------------- Constantes ---------------------
const API_BASE_URL_USERS = '/api/users';

const selectors = {
  modal: '#profile-modal',
  avatarContainer: '#profile-avatar-container',
  avatarImg: '#profile-avatar-img',
  avatarInput: '#profile-avatar-input',
  editBtn: '#edit-profile-btn',
  cancelEditBtn: '#cancel-edit-profile-btn',
  saveBtn: '#save-profile-btn',
  removeAvatarBtn: '#remove-avatar-btn',
  form: '#profile-form',
  nameInput: '#name',
  emailInput: '#email',
  currentPwd: '#current-password',
  newPwd: '#new-password',
  confirmPwd: '#confirm-password',
  deleteTrigger: '#delete-account-trigger-btn',
  deleteConfirmSection: '#delete-account-confirm-section',
  deleteCheckbox: '#delete-account-checkbox',
  deleteConfirmBtn: '#confirm-delete-account-btn',
  deleteCancelBtn: '#cancel-delete-account-btn',
  statsAds: '#stats-ads-published',
  statsRating: '#stats-avg-rating',
  statsFav: '#stats-favorites-count',
  achievements: '#profile-achievements',
};

// Helper de sélection DOM     
const qs = (sel, scope = document) => scope.querySelector(sel);

// -------------------- Références globales -------------
let profileModal,
  profileAvatarContainer,
  profileAvatarImg,
  profileAvatarInput,
  editProfileBtn,
  cancelEditProfileBtn,
  saveProfileBtn,
  removeAvatarBtn,
  profileForm,
  nameInput,
  emailInput,
  currentPasswordField,
  newPasswordField,
  confirmPasswordField,
  deleteAccountTriggerBtn,
  deleteAccountConfirmSection,
  deleteAccountCheckbox,
  confirmDeleteAccountBtn,
  cancelDeleteAccountBtn,
  statsAdsPublished,
  statsAvgRating,
  statsFavoritesCount,
  profileAchievementsSection;

// Champs pouvant être restaurés lors de l’annulation
let editableFields = [];

// -------------------- Utilitaires internes ------------
/**
 * Enveloppe générique autour de secureFetch.
 * Renvoie directement `response.data` quand disponible.
 */
const apiRequest = async (url, options = {}) => {
  const response = await secureFetch(url, options);
  if (!response.ok) throw new Error(response.message || 'Erreur serveur');
  return response.data ?? response;
};

/**
 * Met à jour l’état visuel des badges d’achievements.
 */
const updateAchievements = user => {
  if (!profileAchievementsSection) return;
  const badges = profileAchievementsSection.querySelectorAll('.achievement-badge');
  const unlocked = {
    firstAd: user.stats?.adsPublished > 0,
    fastSeller: user.stats?.fastSales,
    collector: (user.favorites?.length ?? 0) >= 10,
  };
  badges[0]?.classList.toggle('locked', !unlocked.firstAd);
  badges[1]?.classList.toggle('locked', !unlocked.fastSeller);
  badges[3]?.classList.toggle('locked', !unlocked.collector);
};

// -------------------- Initialisation UI ---------------
const initProfileUI = () => {
  // Mise en cache des éléments DOM
  ({
    modal: profileModal,
    avatarContainer: profileAvatarContainer,
    avatarImg: profileAvatarImg,
    avatarInput: profileAvatarInput,
    editBtn: editProfileBtn,
    cancelEditBtn: cancelEditProfileBtn,
    saveBtn: saveProfileBtn,
    removeAvatarBtn,
    form: profileForm,
    nameInput,
    emailInput,
    currentPwd: currentPasswordField,
    newPwd: newPasswordField,
    confirmPwd: confirmPasswordField,
    deleteTrigger: deleteAccountTriggerBtn,
    deleteConfirmSection: deleteAccountConfirmSection,
    deleteCheckbox: deleteAccountCheckbox,
    deleteConfirmBtn: confirmDeleteAccountBtn,
    deleteCancelBtn: cancelDeleteAccountBtn,
    statsAds: statsAdsPublished,
    statsRating: statsAvgRating,
    statsFav: statsFavoritesCount,
    achievements: profileAchievementsSection,
  } = Object.fromEntries(
    Object.entries(selectors).map(([key, sel]) => [key, qs(sel)])
  ));

  if (!profileModal) {
    console.error('profile-modal introuvable');
    return;
  }

  // Bindings
  editProfileBtn?.addEventListener('click', switchToEditMode);
  cancelEditProfileBtn?.addEventListener('click', cancelEditMode);
  profileForm?.addEventListener('submit', handleProfileUpdate);
  profileAvatarInput?.addEventListener('change', () => profileAvatarImg?.classList.add('ring-2'));
  removeAvatarBtn?.addEventListener('click', handleRemoveAvatar);

  deleteAccountTriggerBtn?.addEventListener('click', () => {
    deleteAccountConfirmSection?.classList.remove('hidden');
    deleteAccountTriggerBtn.classList.add('hidden');
  });

  cancelDeleteAccountBtn?.addEventListener('click', () => {
    deleteAccountConfirmSection?.classList.add('hidden');
    deleteAccountTriggerBtn?.classList.remove('hidden');
    deleteAccountCheckbox.checked = false;
    confirmDeleteAccountBtn.disabled = true;
  });

  deleteAccountCheckbox?.addEventListener(
    'change',
    () => (confirmDeleteAccountBtn.disabled = !deleteAccountCheckbox.checked)
  );

  confirmDeleteAccountBtn?.addEventListener('click', handleDeleteAccount);

  // Charge initiale des données utilisateur
  fetchUserData();
};

// -------------------- Récupération données -------------
const fetchUserData = async () => {
  try {
    toggleGlobalLoader(true);
    const data = await apiRequest(`${API_BASE_URL_USERS}/me`);
    populateProfileUI(data);
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    toggleGlobalLoader(false);
  }
};

const populateProfileUI = user => {
  if (!user) return;
  profileAvatarImg.src = user.avatarUrl ?? '/img/default-avatar.png';
  nameInput.value = user.name;
  emailInput.value = user.email;

  statsAdsPublished.textContent = user.stats?.adsPublished ?? 0;
  statsFavoritesCount.textContent = user.favorites?.length ?? 0;

  if (statsAvgRating) {
    const rating = parseFloat(user.stats?.avgRating) || 0;
    statsAvgRating.textContent = `${rating.toFixed(1)}/5`;
    statsAvgRating.nextElementSibling?.querySelector('.fill')?.style.setProperty('width', `${(rating / 5) * 100}%`);
  }

  updateAchievements(user);
};

// -------------------- Mode édition --------------------
const switchToEditMode = () => {
  profileForm.classList.remove('pointer-events-none');
  profileModal.classList.add('edit-mode');

  editableFields = [nameInput, profileAvatarInput];
  editableFields.forEach(el => {
    el.dataset.oldValue = el.value;
    el.removeAttribute('disabled');
  });

  editProfileBtn.classList.add('hidden');
  cancelEditProfileBtn.classList.remove('hidden');
  saveProfileBtn.classList.remove('hidden');
};

const cancelEditMode = () => {
  profileModal.classList.remove('edit-mode');
  profileForm.classList.add('pointer-events-none');

  editableFields.forEach(el => {
    if (el.type === 'file') el.value = '';
    else el.value = el.dataset.oldValue ?? '';
    el.setAttribute('disabled', 'disabled');
  });

  cancelEditProfileBtn.classList.add('hidden');
  saveProfileBtn.classList.add('hidden');
  editProfileBtn.classList.remove('hidden');
};

// -------------------- Actions utilisateur -------------
const handleRemoveAvatar = async () => {
  try {
    toggleGlobalLoader(true);
    await apiRequest(`${API_BASE_URL_USERS}/me/avatar`, { method: 'DELETE' });
    profileAvatarImg.src = '/img/default-avatar.png';
    showToast('Avatar supprimé', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    toggleGlobalLoader(false);
  }
};

const handleProfileUpdate = async evt => {
  evt.preventDefault();

  const { value: name } = nameInput;
  const { files } = profileAvatarInput;
  const currentPassword = currentPasswordField.value;
  const newPassword = newPasswordField.value;
  const confirmPassword = confirmPasswordField.value;

  // Validation basique
  if (newPassword && newPassword !== confirmPassword) {
    return showToast('Les mots de passe ne correspondent pas', 'warning');
  }

  const updates = new FormData();
  updates.append('name', sanitizeHTML(name));
  if (files?.[0]) updates.append('avatar', files[0]);

  try {
    toggleGlobalLoader(true);

    // 1. Update profil (nom, avatar)
    await apiRequest(`${API_BASE_URL_USERS}/me`, { method: 'PATCH', body: updates });

    // 2. Update mot de passe (facultatif)
    if (newPassword) {
      await apiRequest(`${API_BASE_URL_USERS}/me/password`, {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    showToast('Profil mis à jour', 'success');
    cancelEditMode();
    fetchUserData();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    toggleGlobalLoader(false);
  }
};

const handleDeleteAccount = async () => {
  try {
    toggleGlobalLoader(true);
    await apiRequest(`${API_BASE_URL_USERS}/me`, { method: 'DELETE' });
    showToast('Compte désactivé', 'success', 5000);
    logout();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    toggleGlobalLoader(false);
  }
};

// -------------------- Export public -------------------
export const init = () => initProfileUI();
