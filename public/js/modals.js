// js/modals.js

/**
 * @file modals.js
 * @description Gestionnaire universel pour les modales de l'application MapMarket.
 * Gère l'ouverture, la fermeture, le focus trap, la navigation clavier,
 * les animations (via classes CSS) et les attributs ARIA pour toutes les modales.
 */

import * as state from './state.js';
import { showToast } from './utils.js'; // Au cas où on voudrait notifier qqch depuis ici

// Variable pour garder une trace de l'élément qui a déclenché l'ouverture de la modale active
let activeModalTrigger = null;
// Variable pour garder une trace des éléments focusables dans la modale active
let focusableElementsInActiveModal = [];
// Variable pour stocker le dernier élément focus avant l'ouverture de la modale
let previouslyFocusedElement = null;

/**
 * Initialise les gestionnaires d'événements globaux pour les modales.
 * Met en place les écouteurs pour les déclencheurs d'ouverture et les événements de fermeture.
 */
function initModalSystem() {
    // Déclencheurs d'ouverture de modales (data-modal-trigger="modalId")
    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-modal-trigger]');
        if (trigger) {
            event.preventDefault();
            const modalId = trigger.dataset.modalTrigger;
            const associatedModal = document.getElementById(modalId);
            if (associatedModal) {
                openModal(modalId, trigger);
            } else {
                console.warn(`Modale avec ID '${modalId}' non trouvée.`);
                showToast(`Fonctionnalité non disponible pour le moment (modale '${modalId}' manquante).`, 'warning');
            }
        }

        // Déclencheurs de fermeture de modales (data-dismiss-modal="modalId" ou juste data-dismiss-modal)
        const dismissTrigger = event.target.closest('[data-dismiss-modal]');
        if (dismissTrigger) {
            event.preventDefault();
            const modalIdToDismiss = dismissTrigger.dataset.dismissModal;
            if (modalIdToDismiss && document.getElementById(modalIdToDismiss)) {
                closeModal(modalIdToDismiss);
            } else {
                // Si data-dismiss-modal n'a pas de valeur, on cherche la modale parente la plus proche
                const parentModal = dismissTrigger.closest('.modal-overlay[aria-hidden="false"]');
                if (parentModal) {
                    closeModal(parentModal.id);
                }
            }
        }
    });

    // Fermeture avec la touche Échap
    document.addEventListener('keydown', handleGlobalKeydown);

    // Fermeture en cliquant sur l'overlay (pour les modales qui le permettent)
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) { // Clic direct sur l'overlay
                // Vérifier si la modale n'a pas un attribut data-static-backdrop
                if (modal.getAttribute('aria-hidden') === 'false' && modal.dataset.staticBackdrop === undefined) {
                    closeModal(modal.id);
                }
            }
        });
    });

    // Écouteurs pour les événements custom d'ouverture/fermeture de modales
    document.addEventListener('mapmarket:openModal', handleOpenModalEvent);
    document.addEventListener('mapmarket:closeModal', handleCloseModalEvent);
    document.addEventListener('mapmarket:closeAllModals', handleCloseAllModalsEvent);

    console.log('Système de modales initialisé.');
}

/**
 * Ouvre une modale spécifiée.
 * @param {string} modalId - L'ID de la modale à ouvrir.
 * @param {HTMLElement} [triggerElement=null] - L'élément qui a déclenché l'ouverture.
 */
export function openModal(modalId, triggerElement = null) {
    const modal = document.getElementById(modalId);
    if (!modal || modal.getAttribute('aria-hidden') === 'false') {
        if (modal && modal.getAttribute('aria-hidden') === 'false') {
            console.warn(`Modale '${modalId}' déjà ouverte.`);
        } else {
            console.warn(`Tentative d'ouverture d'une modale inexistante: ${modalId}`);
        }
        return;
    }

    // Fermer toute autre modale potentiellement ouverte (généralement une seule à la fois)
    const currentOpenModalId = state.get('ui.currentOpenModal');
    if (currentOpenModalId && currentOpenModalId !== modalId) {
        closeModal(currentOpenModalId, null, true); // silent=true pour éviter des conflits d'état
    }

    previouslyFocusedElement = document.activeElement;
    activeModalTrigger = triggerElement;

    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open'); // Empêche le scroll du body
    if (triggerElement) {
        triggerElement.setAttribute('aria-expanded', 'true');
    }

    state.set('ui.currentOpenModal', modalId);

    // Gestion du focus
    setupFocusTrap(modal);
    const firstFocusable = focusableElementsInActiveModal.length > 0 ? focusableElementsInActiveModal[0] : modal.querySelector('.modal-close-btn, button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');

    // Attendre la fin de l'animation d'ouverture (si applicable) avant de focus
    // Les animations sont gérées par CSS, on peut utiliser un petit délai ou transitionend
    setTimeout(() => {
        if (firstFocusable) {
            firstFocusable.focus();
        } else {
            // Si aucun élément focusable n'est trouvé, focus la modale elle-même pour le focus trap.
            modal.focus();
        }
    }, 100); // Ajuster si des animations CSS plus longues sont utilisées

    // Dispatch un événement après l'ouverture
    modal.dispatchEvent(new CustomEvent('modal:opened', { bubbles: true, detail: { modalId } }));
    document.dispatchEvent(new CustomEvent('mapMarket:modalOpened', { detail: { modalId } }));

    console.log(`Modale '${modalId}' ouverte.`);
}

/**
 * Ferme une modale spécifiée.
 * @param {string} modalId - L'ID de la modale à fermer.
 * @param {HTMLElement} [triggerElement=null] - L'élément qui a déclenché la fermeture (si différent de celui d'ouverture).
 * @param {boolean} [silent=false] - Si true, ne met pas à jour l'état global (utilisé pour fermetures en cascade).
 */
export function closeModal(modalId, triggerElement = null, silent = false) {
    const modal = document.getElementById(modalId);
    if (!modal || modal.getAttribute('aria-hidden') === 'true') {
        // console.warn(`Tentative de fermeture d'une modale inexistante ou déjà fermée: ${modalId}`);
        return;
    }

    modal.setAttribute('aria-hidden', 'true');

    if (modalId === 'ad-detail-modal') {
        const adPreviewCard = document.getElementById('ad-preview-card');
        if (adPreviewCard) {
            adPreviewCard.classList.remove('hidden');
            const adId = adPreviewCard.dataset.adId;
            updatePreviewCardFavoriteIcon(adId);
        }
    }

    const triggerToUpdate = triggerElement || activeModalTrigger || document.querySelector(`[data-modal-trigger="${modalId}"], [aria-controls="${modalId}"]`);
    if (triggerToUpdate) {
        triggerToUpdate.setAttribute('aria-expanded', 'false');
    }

    if (!silent) {
        if (state.get('ui.currentOpenModal') === modalId) {
            state.set('ui.currentOpenModal', null);
        }
    }

    // Vérifier s'il reste d'autres modales ouvertes avant de retirer la classe sur le body
    // Ceci est important si on autorise les modales empilées (ce qui n'est pas le cas par défaut ici)
    const stillOpenModals = document.querySelector('.modal-overlay[aria-hidden="false"]');
    if (!stillOpenModals) {
        document.body.classList.remove('modal-open');
    }

    // Rétablir le focus sur l'élément qui a ouvert la modale, ou le body
    if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus();
    } else if (activeModalTrigger && typeof activeModalTrigger.focus === 'function') {
        activeModalTrigger.focus();
    }

    activeModalTrigger = null;
    previouslyFocusedElement = null;
    focusableElementsInActiveModal = [];

    // Dispatch un événement après la fermeture
    modal.dispatchEvent(new CustomEvent('modal:closed', { bubbles: true, detail: { modalId } }));
    document.dispatchEvent(new CustomEvent('mapMarket:modalClosed', { detail: { modalId } }));

    console.log(`Modale '${modalId}' fermée.`);
}

/**
 * Ferme toutes les modales actuellement ouvertes.
 */
export function closeAllModals() {
    const openModals = document.querySelectorAll('.modal-overlay[aria-hidden="false"]');
    openModals.forEach(modal => {
        closeModal(modal.id);
    });
    if (openModals.length > 0) {
        document.body.classList.remove('modal-open');
        state.set('ui.currentOpenModal', null);
        console.log('Toutes les modales ont été fermées.');
    }
}

/**
 * Configure le piège de focus (focus trap) pour une modale.
 * @param {HTMLElement} modalElement - L'élément de la modale.
 */
function setupFocusTrap(modalElement) {
    focusableElementsInActiveModal = Array.from(
        modalElement.querySelectorAll(
            'a[href]:not([disabled]), button:not([disabled]), textarea:not([disabled]), input[type="text"]:not([disabled]), input[type="radio"]:not([disabled]), input[type="checkbox"]:not([disabled]), input[type="email"]:not([disabled]), input[type="password"]:not([disabled]), input[type="number"]:not([disabled]), input[type="search"]:not([disabled]), input[type="tel"]:not([disabled]), input[type="url"]:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    ).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0); // Seulement les éléments visibles

    if (focusableElementsInActiveModal.length === 0) {
        // Si aucun élément n'est focusable, on ajoute la modale elle-même avec tabindex="-1"
        // pour qu'elle puisse recevoir le focus et que le keydown listener fonctionne.
        // Mais pour un vrai trap, il faut au moins un élément focusable, comme un bouton fermer.
        // On s'assure que la modale a un tabindex pour pouvoir la focus, si rien d'autre.
        if (!modalElement.hasAttribute('tabindex')) {
            modalElement.setAttribute('tabindex', '-1');
        }
        // On pourrait ajouter la modale elle-même à la liste si elle est le seul élément focusable.
        // focusableElementsInActiveModal.push(modalElement);
    }
}

/**
 * Gère la navigation au clavier (Tab, Shift+Tab) à l'intérieur d'une modale ouverte.
 * @param {KeyboardEvent} event - L'événement clavier.
 */
function handleModalFocusNavigation(event) {
    const currentOpenModalId = state.get('ui.currentOpenModal');
    if (!currentOpenModalId || event.key !== 'Tab') return;

    const modal = document.getElementById(currentOpenModalId);
    if (!modal || modal.getAttribute('aria-hidden') === 'true') return;

    if (focusableElementsInActiveModal.length === 0) {
        event.preventDefault(); // Empêche de quitter la modale s'il n'y a rien à focus
        return;
    }

    const firstFocusableElement = focusableElementsInActiveModal[0];
    const lastFocusableElement = focusableElementsInActiveModal[focusableElementsInActiveModal.length - 1];

    if (event.shiftKey) { // Shift + Tab
        if (document.activeElement === firstFocusableElement) {
            lastFocusableElement.focus();
            event.preventDefault();
        }
    } else { // Tab
        if (document.activeElement === lastFocusableElement) {
            firstFocusableElement.focus();
            event.preventDefault();
        }
    }
}

/**
 * Gère les événements keydown globaux (pour Échap et Tab dans les modales).
 * @param {KeyboardEvent} event - L'événement clavier.
 */
function handleGlobalKeydown(event) {
    const currentOpenModalId = state.get('ui.currentOpenModal');
    if (!currentOpenModalId) return;

    const modal = document.getElementById(currentOpenModalId);
    if (!modal || modal.getAttribute('aria-hidden') === 'true') return;

    if (event.key === 'Escape') {
        if (modal.dataset.staticBackdrop === undefined) { // Ne ferme pas si static backdrop
            closeModal(currentOpenModalId);
        }
    } else if (event.key === 'Tab') {
        handleModalFocusNavigation(event);
    }
}

// --- Gestionnaires pour les événements custom ---
function handleOpenModalEvent(event) {
    // ✅ CORRECTION : On récupère TOUS les détails, y compris onConfirm et les autres textes.
    const { modalId, triggerElement, view, title, message, confirmText, isDestructive, onConfirm } = event.detail;

    if (!modalId) return;

    // ✅ CORRECTION : Logique spécifique pour la modale de confirmation.
    if (modalId === 'confirmation-modal') {
        const confirmationModal = document.getElementById('confirmation-modal');
        if (!confirmationModal) {
            console.error("La modale de confirmation avec l'ID 'confirmation-modal' est introuvable.");
            return;
        }

        // 1. Peupler le contenu de la modale de confirmation
        const modalTitle = confirmationModal.querySelector('.modal-title');
        const modalMessage = confirmationModal.querySelector('.modal-body p');
        const confirmBtn = confirmationModal.querySelector('#confirm-action-btn');

        if (modalTitle && title) modalTitle.textContent = title;
        if (modalMessage && message) modalMessage.textContent = message;
        if (confirmBtn && confirmText) confirmBtn.textContent = confirmText;
        if (confirmBtn && isDestructive) {
            confirmBtn.classList.add('btn-danger');
        } else if (confirmBtn) {
            confirmBtn.classList.remove('btn-danger');
        }

        // 2. Gérer le bouton de confirmation pour éviter les écouteurs multiples
        // On clone le bouton pour supprimer proprement tous les anciens écouteurs d'événements.
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        // 3. On attache la NOUVELLE fonction onConfirm au clic
        newConfirmBtn.addEventListener('click', () => {
            if (typeof onConfirm === 'function') {
                onConfirm(); // <-- C'est ici que la magie opère : la suppression est exécutée !
            }
            closeModal(modalId); // On ferme la modale après l'action
        });

        // 4. On ouvre la modale maintenant qu'elle est configurée
        openModal(modalId, triggerElement);

    } else {
        // Comportement générique pour toutes les autres modales
        openModal(modalId, triggerElement);
        if (view && modalId === 'auth-modal' && typeof window.authSwitchView === 'function') {
            window.authSwitchView(view);
        }
    }
}

// Met à jour l'icône favori sur la carte après la fermeture de la modale détail
function updatePreviewCardFavoriteIcon(adId) {
    const isFavorite = state.isFavorite(adId);
    const adPreviewCard = document.getElementById('ad-preview-card');
    if (adPreviewCard && adPreviewCard.dataset.adId === adId) {
        const favoriteBtn = adPreviewCard.querySelector('.favorite-btn');
        const heartIcon = favoriteBtn ? favoriteBtn.querySelector('i') : null;
        if (favoriteBtn) favoriteBtn.setAttribute('aria-pressed', isFavorite);
        if (heartIcon) {
            if (isFavorite) {
                heartIcon.classList.remove('fa-regular');
                heartIcon.classList.add('fa-solid');
            } else {
                heartIcon.classList.remove('fa-solid');
                heartIcon.classList.add('fa-regular');
            }
        }
        if (favoriteBtn) favoriteBtn.classList.toggle('active', isFavorite);
    }
}
function handleCloseModalEvent(event) {
    const { modalId } = event.detail;
    if (modalId) {
        closeModal(modalId);
    }
}

function handleCloseAllModalsEvent() {
    closeAllModals();
}


/**
 * Initialise le module de gestion des modales.
 * Doit être appelée une fois que le DOM est prêt.
 */
export function init() {
    // S'assurer que les éléments de base sont là
    if (!document.body) {
        console.error("Modals module: document.body non trouvé à l'initialisation.");
        return;
    }
    initModalSystem();
}

// L'initialisation sera appelée depuis main.js
// init();
