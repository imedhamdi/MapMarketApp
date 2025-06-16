// js/onboarding.js

/**
 * @file onboarding.js
 * @description Gestion de l'expérience d'accueil (onboarding) pour les nouveaux utilisateurs.
 * Affiche des diapositives interactives, gère la navigation et la persistance de l'état "complété".
 */

import * as state from './store.js';
import {
    showToast
} from './utils.js'; // Pour d'éventuelles notifications

// --- Éléments du DOM ---
let onboardingModal, onboardingSlidesContainer, onboardingDotsContainer;
let prevOnboardingBtn, nextOnboardingBtn, finishOnboardingBtn, skipOnboardingBtn;
let lottieAnimationContainers = []; // Pour les animations Lottie

// --- État du module ---
let currentSlideIndex = 0;
let totalSlides = 0;
const ONBOARDING_COMPLETED_KEY = 'onboardingCompleted'; // Clé pour state.js

/**
 * Initialise les éléments du DOM et les écouteurs d'événements pour l'onboarding.
 */
export function init() {
    onboardingModal = document.getElementById('onboarding-modal');
    if (!onboardingModal) {
        // Si la modale n'existe pas, on ne fait rien.
        // console.warn("Modale d'onboarding (onboarding-modal) non trouvée.");
        return;
    }

    onboardingSlidesContainer = onboardingModal.querySelector('.onboarding-slides-container');
    onboardingDotsContainer = onboardingModal.querySelector('.onboarding-dots-navigation');
    prevOnboardingBtn = document.getElementById('prev-onboarding-btn');
    nextOnboardingBtn = document.getElementById('next-onboarding-btn');
    finishOnboardingBtn = document.getElementById('finish-onboarding-btn');
    skipOnboardingBtn = document.getElementById('skip-onboarding-btn');

    // Récupérer les conteneurs d'animation Lottie
    lottieAnimationContainers = [
        document.getElementById('lottie-onboarding-animation-1'),
        document.getElementById('lottie-onboarding-animation-2'),
        document.getElementById('lottie-onboarding-animation-3'),
    ].filter(el => el !== null);


    if (!onboardingSlidesContainer || !onboardingDotsContainer || !prevOnboardingBtn || !nextOnboardingBtn || !finishOnboardingBtn || !skipOnboardingBtn) {
        console.error("Un ou plusieurs éléments DOM pour l'onboarding sont manquants.");
        return;
    }

    const slides = onboardingSlidesContainer.querySelectorAll('.onboarding-slide');
    totalSlides = slides.length;

    if (totalSlides === 0) {
        console.warn("Aucune diapositive d'onboarding trouvée.");
        onboardingModal.classList.add('hidden'); // Cacher la modale si vide
        return;
    }

    // Écouteurs d'événements pour la navigation
    prevOnboardingBtn.addEventListener('click', () => showSlide(currentSlideIndex - 1));
    nextOnboardingBtn.addEventListener('click', () => showSlide(currentSlideIndex + 1));
    finishOnboardingBtn.addEventListener('click', completeOnboarding);
    skipOnboardingBtn.addEventListener('click', completeOnboarding);

    // Navigation par les points (dots)
    onboardingDotsContainer.querySelectorAll('.onboarding-dot').forEach(dot => {
        dot.addEventListener('click', (event) => {
            const slideIndex = parseInt(event.currentTarget.dataset.slideIndex);
            if (!isNaN(slideIndex)) {
                showSlide(slideIndex);
            }
        });
    });

    // Vérifier si l'onboarding doit être affiché au démarrage
    checkAndShowOnboarding();

    // Écouteur pour l'événement de réaffichage de l'onboarding (ex: depuis les paramètres)
    document.addEventListener('mapMarket:replayOnboarding', () => {
        currentSlideIndex = 0; // Réinitialiser à la première diapositive
        state.set(ONBOARDING_COMPLETED_KEY, false, true); // Marquer comme non complété (silencieusement pour ne pas persister immédiatement)
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
            detail: {
                modalId: 'onboarding-modal'
            }
        }));
        showSlide(0); // Afficher la première diapositive
        // Charger les animations Lottie pour la première diapositive
        loadLottieAnimation(0);
    });

    // Fermer la modale d'onboarding si on clique sur la croix (géré par modals.js)
    // ou si on appuie sur Echap (géré par modals.js)
    // Si on ferme la modale avant la fin, marquer comme "passé"
    document.addEventListener('mapMarket:modalClosed', (event) => {
        if (event.detail.modalId === 'onboarding-modal' && !state.get(ONBOARDING_COMPLETED_KEY)) {
            // Si la modale est fermée avant la fin (sans cliquer sur "Terminer" ou "Passer")
            // On peut choisir de le marquer comme complété pour ne pas le remontrer,
            // ou de le laisser non complété pour le remontrer la prochaine fois.
            // Pour l'instant, on le marque comme complété pour éviter de le remontrer.
            // completeOnboarding(false); // false pour ne pas afficher de toast de "bienvenue"
        }
    });


    console.log('Module Onboarding initialisé.');
}

/**
 * Vérifie si l'onboarding a déjà été complété et l'affiche si nécessaire.
 */
function checkAndShowOnboarding() {
    const isOnboardingCompleted = state.get(ONBOARDING_COMPLETED_KEY);
    if (!isOnboardingCompleted) {
        document.dispatchEvent(new CustomEvent('mapmarket:openModal', {
            detail: {
                modalId: 'onboarding-modal'
            }
        }));
        showSlide(0); // Afficher la première diapositive
        loadLottieAnimation(0); // Charger l'animation pour la première diapositive
    } else {
        if (onboardingModal) onboardingModal.classList.add('hidden'); // S'assurer qu'elle est cachée
    }
}

/**
 * Affiche une diapositive spécifique de l'onboarding.
 * @param {number} slideIndex - L'index de la diapositive à afficher.
 */
function showSlide(index) {
    if (index < 0 || index >= totalSlides || !onboardingSlidesContainer) return;

    currentSlideIndex = index;

    // Masquer toutes les diapositives
    onboardingSlidesContainer.querySelectorAll('.onboarding-slide').forEach(slide => {
        slide.classList.remove('active');
        slide.setAttribute('aria-hidden', 'true');
    });

    // Afficher la diapositive actuelle
    const currentSlideElement = onboardingSlidesContainer.querySelectorAll('.onboarding-slide')[currentSlideIndex];
    if (currentSlideElement) {
        currentSlideElement.classList.add('active');
        currentSlideElement.setAttribute('aria-hidden', 'false');
    }

    // Mettre à jour les points de navigation
    onboardingDotsContainer.querySelectorAll('.onboarding-dot').forEach((dot, idx) => {
        dot.classList.toggle('active', idx === currentSlideIndex);
        dot.setAttribute('aria-selected', (idx === currentSlideIndex).toString());
    });

    // Mettre à jour la visibilité des boutons de navigation
    prevOnboardingBtn.classList.toggle('hidden', currentSlideIndex === 0);
    nextOnboardingBtn.classList.toggle('hidden', currentSlideIndex === totalSlides - 1);
    finishOnboardingBtn.classList.toggle('hidden', currentSlideIndex !== totalSlides - 1);
    skipOnboardingBtn.classList.toggle('hidden', currentSlideIndex === totalSlides - 1); // Cacher "Passer" sur la dernière slide

    // Mettre à jour l'attribut data-current-slide sur la modale
    if (onboardingModal) onboardingModal.dataset.currentSlide = currentSlideIndex;

    // Charger/jouer l'animation Lottie pour la diapositive actuelle
    loadLottieAnimation(currentSlideIndex);
}

/**
 * Marque l'onboarding comme complété et ferme la modale.
 * @param {boolean} [showWelcomeToast=true] - Indique si un toast de bienvenue doit être affiché.
 */
function completeOnboarding(showWelcomeToast = true) {
    state.set(ONBOARDING_COMPLETED_KEY, true); // Persiste via state.js -> localStorage
    document.dispatchEvent(new CustomEvent('mapmarket:closeModal', {
        detail: {
            modalId: 'onboarding-modal'
        }
    }));

    if (showWelcomeToast) {
        // Le toast de bienvenue est déjà dans index.html après l'init de la carte.
        // On pourrait en afficher un spécifique ici si besoin.
        // showToast("Bienvenue sur MapMarket ! Prêt à explorer ?", "success", 4000);
    }
    // Arrêter toutes les animations Lottie
    stopAllLottieAnimations();
}

/**
 * Charge (et potentiellement joue) une animation Lottie pour une diapositive donnée.
 * @param {number} slideIndex - L'index de la diapositive.
 */
function loadLottieAnimation(slideIndex) {
    // Arrêter les animations précédentes
    stopAllLottieAnimations();

    const animationContainer = lottieAnimationContainers[slideIndex];
    if (animationContainer && typeof bodymovin !== 'undefined') { // bodymovin est le nom global de Lottie
        // Vider le conteneur précédent
        animationContainer.innerHTML = '';

        // Définir le chemin vers le fichier JSON de l'animation
        // Ces chemins sont des exemples, vous devrez les remplacer par les vôtres.
        const animationPaths = [
            'animations/Animation1.json', // Pour la slide 0
            'animations/Animation2.json', // Pour la slide 1
            'animations/Animation3.json' // Pour la slide 2
        ];

        if (animationPaths[slideIndex]) {
            try {
                const anim = bodymovin.loadAnimation({
                    container: animationContainer,
                    renderer: 'svg', // ou 'canvas', 'html'
                    loop: true,
                    autoplay: true,
                    path: animationPaths[slideIndex]
                });
                animationContainer.dataset.lottieAnimation = anim; // Stocker la référence pour l'arrêter plus tard
            } catch (error) {
                console.error(`Erreur lors du chargement de l'animation Lottie pour la slide ${slideIndex}:`, error);
                animationContainer.textContent = `Erreur animation (fichier ${animationPaths[slideIndex]} manquant ou corrompu)`;
            }
        } else {
            // Placeholder si pas d'animation définie pour cette slide
            animationContainer.textContent = `Animation ${slideIndex + 1}`;
        }
    } else if (animationContainer) {
        animationContainer.textContent = `Animation ${slideIndex + 1} (Lottie non chargé)`;
    }
}

/**
 * Arrête toutes les animations Lottie en cours.
 */
function stopAllLottieAnimations() {
    lottieAnimationContainers.forEach(container => {
        if (container && container.dataset.lottieAnimation && typeof container.dataset.lottieAnimation.destroy === 'function') {
            try {
                container.dataset.lottieAnimation.destroy();
            } catch (e) { /* ignore */ }
        }
        if (container) container.innerHTML = ''; // Nettoyer au cas où
    });
}


// L'initialisation sera appelée depuis main.js
// init();
