// js/utils.js

/**
 * @file utils.js
 * @description Fonctions utilitaires pour l'application MapMarket.
 * Ce module centralise les helpers pour les toasts, loaders, debounce,
 * validation de formulaires, formatage de prix/dates, sanitization XSS,
 * et génération d'ID uniques. Aucune logique métier spécifique à un module
 * ne doit se trouver ici.
 */

/**
 * Affiche une notification toast.
 * @param {string} message - Le message à afficher.
 * @param {string} [type='info'] - Le type de toast (info, success, error, warning).
 * @param {number} [duration=3000] - La durée d'affichage en millisecondes.
 */
export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-notifications-container');
    const template = document.getElementById('toast-notification-template');

    if (!container || !template) {
        console.warn('Éléments de toast non trouvés. Message:', message);
        // Fallback simple si les éléments du DOM ne sont pas prêts ou trouvés
        alert(`Toast (${type}): ${message}`);
        return;
    }

    const toastClone = template.content.cloneNode(true);
    const toastElement = toastClone.querySelector('.toast-notification');
    const toastIconEl = toastElement.querySelector('.toast-icon');
    const toastMessageEl = toastElement.querySelector('.toast-message');
    const toastCloseBtn = toastElement.querySelector('.toast-close-btn');

    toastElement.dataset.toastType = type;
    toastMessageEl.textContent = message;

    const icons = {
        info: 'fa-info-circle',
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle'
    };
    toastIconEl.className = `toast-icon fa-solid ${icons[type] || icons.info}`;

    toastCloseBtn.addEventListener('click', () => dismissToast(toastElement));

    container.appendChild(toastElement);

    // Force reflow pour que l'animation CSS se déclenche
    // void toastElement.offsetWidth; // Technique classique, mais requestAnimationFrame est plus moderne
    requestAnimationFrame(() => {
        toastElement.classList.add('toast-visible');
    });


    if (duration > 0) {
        setTimeout(() => dismissToast(toastElement), duration);
    }
}

/**
 * Masque et supprime un toast.
 * @param {HTMLElement} toastElement - L'élément toast à masquer.
 */
function dismissToast(toastElement) {
    if (!toastElement || !toastElement.classList.contains('toast-visible')) return;

    toastElement.classList.remove('toast-visible');
    toastElement.addEventListener('transitionend', () => {
        if (toastElement.parentNode) {
            toastElement.remove();
        }
    }, { once: true });
}

/**
 * Affiche ou masque le loader global.
 * @param {boolean} show - True pour afficher, false pour masquer.
 * @param {string} [message='Chargement...'] - Message à afficher avec le loader.
 */
export function toggleGlobalLoader(show, message = 'Chargement...') {
    const loaderContainer = document.getElementById('global-loader-container');
    const loaderMessageEl = document.getElementById('global-loader-message');
    if (loaderContainer) {
        if (show) {
            if (loaderMessageEl) loaderMessageEl.textContent = message;
            loaderContainer.classList.remove('hidden');
            loaderContainer.setAttribute('aria-busy', 'true');
        } else {
            loaderContainer.classList.add('hidden');
            loaderContainer.setAttribute('aria-busy', 'false');
        }
    }
}

/**
 * Fonction debounce pour limiter la fréquence d'exécution d'une fonction.
 * @param {Function} func - La fonction à exécuter.
 * @param {number} delay - Le délai en millisecondes.
 * @returns {Function} - La fonction "debounced".
 */
export function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

/**
 * Valide un champ de formulaire selon des règles spécifiques.
 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} field - Le champ à valider.
 * @param {Array<Object>} rules - Un tableau de règles de validation.
 * Chaque règle est un objet { type: string, message: string, value?: any (ex: minLength, pattern) }
 * @returns {boolean} - True si valide, false sinon.
 */
export function validateField(field, rules) {
    let isValid = true;
    const errorElement = document.getElementById(`${field.id}-error`);
    if (!errorElement) {
        console.warn(`Élément d'erreur non trouvé pour ${field.id}`);
        // Si pas d'élément d'erreur, on ne peut pas afficher le message mais on peut quand même valider
    } else {
         errorElement.textContent = ''; // Reset error message
         errorElement.style.display = 'none';
    }


    for (const rule of rules) {
        let fieldViolatedRule = false;
        switch (rule.type) {
            case 'required':
                if (field.type === 'checkbox' && !field.checked) fieldViolatedRule = true;
                else if (field.value.trim() === '') fieldViolatedRule = true;
                break;
            case 'minLength':
                if (field.value.trim().length < rule.value) fieldViolatedRule = true;
                break;
            case 'maxLength':
                if (field.value.trim().length > rule.value) fieldViolatedRule = true;
                break;
            case 'email':
                // Regex simple pour format email, peut être améliorée
                const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailPattern.test(field.value.trim())) fieldViolatedRule = true;
                break;
            case 'password':
                // Exemple : au moins 6 caractères, une majuscule, un chiffre
                // const passwordPattern = /^(?=.*[A-Z])(?=.*\d).{6,}$/;
                // Pour cet exercice, on se base sur minLength si spécifié pour le mot de passe
                if (rule.minLength && field.value.length < rule.minLength) fieldViolatedRule = true;
                break;
            case 'match':
                const fieldToMatch = document.getElementById(rule.value);
                if (fieldToMatch && field.value !== fieldToMatch.value) fieldViolatedRule = true;
                break;
            case 'fileType': // rule.value est un tableau de types MIME acceptés (ex: ['image/jpeg', 'image/png'])
                if (field.files && field.files[0]) {
                    if (!rule.value.includes(field.files[0].type)) fieldViolatedRule = true;
                }
                break;
            case 'maxFileSize': // rule.value est la taille max en octets
                if (field.files && field.files[0]) {
                    if (field.files[0].size > rule.value) fieldViolatedRule = true;
                }
                break;
            case 'pattern': // rule.value est une RegExp
                if (!rule.value.test(field.value)) fieldViolatedRule = true;
                break;
            case 'numberRange': // rule.value est un objet { min, max }
                const numValue = parseFloat(field.value);
                if (isNaN(numValue) || (rule.value.min !== undefined && numValue < rule.value.min) || (rule.value.max !== undefined && numValue > rule.value.max)) {
                    fieldViolatedRule = true;
                }
                break;
        }

        if (fieldViolatedRule) {
            isValid = false;
            if (errorElement) {
                errorElement.textContent = rule.message;
                errorElement.style.display = 'block'; // Assurez-vous que l'élément est visible
            } else {
                console.warn(`Validation error for ${field.id}: ${rule.message} (error element missing)`);
            }
            field.setAttribute('aria-invalid', 'true');
            if (errorElement) field.setAttribute('aria-describedby', errorElement.id);
            break; // Stop at first error for this field
        }
    }

    if (isValid) {
        field.removeAttribute('aria-invalid');
        if (errorElement) field.removeAttribute('aria-describedby');
    }

    return isValid;
}

/**
 * Valide un formulaire entier.
 * @param {HTMLFormElement} form - Le formulaire à valider.
 * @param {Object} formRules - Un objet où les clés sont les `name` des champs
 * et les valeurs sont des tableaux de règles (voir `validateField`).
 * @returns {boolean} - True si tout le formulaire est valide, false sinon.
 */
export function validateForm(form, formRules) {
    let isFormValid = true;
    for (const fieldName in formRules) {
        const field = form.elements[fieldName];
        if (field) {
            // Pour les groupes de radio, valider le groupe entier une seule fois.
            if (field.type === 'radio' && field.name === fieldName) {
                 const radioGroup = form.elements[fieldName];
                 let radioSelected = false;
                 for(const radio of radioGroup) {
                     if (radio.checked) {
                         radioSelected = true;
                         break;
                     }
                 }
                 if (!radioSelected && formRules[fieldName].some(rule => rule.type === 'required')) {
                    isFormValid = false;
                    const errorElement = document.getElementById(`${fieldName}-error`) || document.getElementById(`${radioGroup[0].id}-error`); // Try to find error el
                    if (errorElement) {
                        errorElement.textContent = formRules[fieldName].find(rule => rule.type === 'required').message;
                        errorElement.style.display = 'block';
                        radioGroup[0].setAttribute('aria-invalid', 'true'); // Mark first radio as invalid for group
                        radioGroup[0].setAttribute('aria-describedby', errorElement.id);
                    }
                 } else {
                    const errorElement = document.getElementById(`${fieldName}-error`) || document.getElementById(`${radioGroup[0].id}-error`);
                    if (errorElement) {
                        errorElement.textContent = '';
                        errorElement.style.display = 'none';
                    }
                    radioGroup[0].removeAttribute('aria-invalid');
                    radioGroup[0].removeAttribute('aria-describedby');
                 }

            } else if (field.type !== 'radio') { // Valider les autres champs normalement
                if (!validateField(field, formRules[fieldName])) {
                    isFormValid = false;
                    // Le message d'erreur est déjà affiché par validateField
                }
            }
        } else {
            console.warn(`Champ nommé "${fieldName}" non trouvé dans le formulaire "${form.id}".`);
        }
    }
    return isFormValid;
}


/**
 * Formate un prix.
 * @param {number} price - Le prix à formater.
 * @param {string} [currency='EUR'] - La devise.
 * @param {string} [locale='fr-FR'] - La locale pour le formatage.
 * @returns {string} - Le prix formaté.
 */
export function formatPrice(price, currency = 'EUR', locale = 'fr-FR') {
    if (typeof price !== 'number' || isNaN(price)) {
        return 'N/A';
    }
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(price);
    } catch (e) {
        console.error("Erreur de formatage du prix:", e);
        return `${price} ${currency}`; // Fallback
    }
}

/**
 * Formate une date.
 * @param {Date|string|number} dateInput - La date à formater.
 * @param {Object} [options] - Options de formatage pour Intl.DateTimeFormat.
 * @param {string} [locale='fr-FR'] - La locale pour le formatage.
 * @returns {string} - La date formatée.
 */
export function formatDate(dateInput, options = { year: 'numeric', month: 'long', day: 'numeric' }, locale = 'fr-FR') {
    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) {
            return 'Date invalide';
        }
        return new Intl.DateTimeFormat(locale, options).format(date);
    } catch (e) {
        console.error("Erreur de formatage de la date:", e);
        return String(dateInput); // Fallback
    }
}

/**
 * Nettoie une chaîne de caractères pour prévenir les attaques XSS.
 * Remplace les caractères HTML potentiellement dangereux par leurs entités.
 * @param {string} str - La chaîne à nettoyer.
 * @returns {string} - La chaîne nettoyée.
 */
export function sanitizeHTML(str) {
    if (typeof str !== 'string') return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
    // Alternative plus stricte si besoin, mais textContent est généralement sûr pour l'injection dans le DOM.
    // Pour l'injection dans des attributs HTML, une sanitization plus poussée peut être nécessaire.
    // return str.replace(/[&<>"']/g, function (match) {
    //     return {
    //         '&': '&amp;',
    //         '<': '&lt;',
    //         '>': '&gt;',
    //         '"': '&quot;',
    //         "'": '&#39;'
    //     }[match];
    // });
}

/**
 * Génère un ID unique (UUID v4).
 * @returns {string} - Un ID unique.
 */
export function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback pour les environnements sans crypto.randomUUID (très rare de nos jours)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Ajoute ou met à jour un paramètre dans une URL.
 * @param {string} url - L'URL de base.
 * @param {string} key - La clé du paramètre.
 * @param {string} value - La valeur du paramètre.
 * @returns {string} L'URL mise à jour.
 */
export function updateQueryStringParameter(url, key, value) {
    const re = new RegExp("([?&])" + key + "=.*?(&|$)", "i");
    const separator = url.indexOf('?') !== -1 ? "&" : "?";
    if (url.match(re)) {
        return url.replace(re, '$1' + key + "=" + encodeURIComponent(value) + '$2');
    } else {
        return url + separator + key + "=" + encodeURIComponent(value);
    }
}

/**
 * Récupère la valeur d'un paramètre de l'URL.
 * @param {string} name - Le nom du paramètre.
 * @param {string} [url=window.location.href] - L'URL à analyser.
 * @returns {string|null} La valeur du paramètre ou null s'il n'est pas trouvé.
 */
export function getQueryParam(name, url = window.location.href) {
    name = name.replace(/[\[\]]/g, '\\$&');
    const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
    const results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

/**
 * Calcule la distance en kilomètres entre deux points GPS en utilisant la formule de Haversine.
 * @param {number} lat1 Latitude du point 1.
 * @param {number} lon1 Longitude du point 1.
 * @param {number} lat2 Latitude du point 2.
 * @param {number} lon2 Longitude du point 2.
 * @returns {number} La distance en kilomètres.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en kilomètres
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance en km
}


/**
 * Enrobe les appels fetch avec gestion d'erreur et loader global.
 * @param {string} url - L'URL de l'API.
 * @param {object} options - Les options de fetch (method, headers, body, etc.).
 * @param {boolean} [showGlobalLoader=true] - Indique si le loader global doit être affiché.
 * @returns {Promise<any>} - Une promesse résolue avec les données JSON ou rejetée avec une erreur.
 */
export async function secureFetch(url, options = {}, showGlobalLoader = true) {
    if (showGlobalLoader) {
        toggleGlobalLoader(true, 'Communication avec le serveur...');
    }

    // Récupérer le token JWT depuis localStorage
    const token = localStorage.getItem('mapmarket_auth_token'); // Clé unique pour le token

    // Préparer les headers
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    options.headers = { ...defaultHeaders, ...options.headers };

    // Si le corps est un objet, le stringifier (sauf si c'est un FormData)
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        options.body = JSON.stringify(options.body);
    }
    // Si c'est un FormData, supprimer le Content-Type pour que le navigateur le définisse correctement avec le boundary
    if (options.body instanceof FormData) {
        delete options.headers['Content-Type'];
    }


    try {
        const response = await fetch(url, options);

        if (!response.ok) {
            let errorData;
            try {
                // Essayer de parser le corps de la réponse d'erreur comme JSON
                errorData = await response.json();
            } catch (e) {
                // Si le corps n'est pas JSON ou est vide
                errorData = { message: response.statusText || `Erreur HTTP ${response.status}` };
            }
            // Enrichir l'objet d'erreur
            const error = new Error(errorData.message || `Erreur HTTP ${response.status}`);
            error.status = response.status;
            error.data = errorData; // Contient potentiellement plus de détails du backend
            throw error;
        }

        // Gérer les réponses sans contenu (ex: 204 No Content)
        if (response.status === 204 || response.headers.get("content-length") === "0") {
            return null; // Ou {} selon ce qui est le plus pratique pour l'appelant
        }

        // Si on attend du JSON (cas le plus courant)
        if (response.headers.get("content-type")?.includes("application/json")) {
            return await response.json();
        }
        // Si on attend du texte brut
        return await response.text();

    } catch (error) {
    console.error(`Erreur lors de l'appel à ${url}:`, error);
    
    // Message plus spécifique pour les erreurs de validation
    if (error.status === 400 && error.data?.errors) {
        const validationErrors = Object.values(error.data.errors).join(', ');
        showToast(`Erreur de validation : ${validationErrors}`, 'error');
    } else {
        showToast(error.message || 'Une erreur de communication est survenue. Veuillez réessayer.', 'error');
    }
    
    throw error;

    } finally {
        if (showGlobalLoader) {
            toggleGlobalLoader(false);
        }
    }
}

/**
 * Prépare les données d'un formulaire pour l'envoi (ex: FormData ou objet JSON).
 * @param {HTMLFormElement} formElement - L'élément formulaire.
 * @param {string} [outputType='json'] - 'json' ou 'formData'.
 * @returns {Object|FormData} - Les données du formulaire.
 */
export function serializeForm(formElement, outputType = 'json') {
    const formData = new FormData(formElement);
    if (outputType === 'formData') {
        return formData;
    }

    const jsonObject = {};
    formData.forEach((value, key) => {
        if (jsonObject.hasOwnProperty(key)) {
            if (!Array.isArray(jsonObject[key])) {
                jsonObject[key] = [jsonObject[key]];
            }
            jsonObject[key].push(value);
        } else {
            jsonObject[key] = value;
        }
    });
    return jsonObject;
}


// Initialisation des toasts au chargement du DOM (si les éléments sont déjà là)
// Ceci est déplacé dans le main.js ou le script inline de index.html pour s'assurer que le DOM est prêt.
// document.addEventListener('DOMContentLoaded', () => {
//     // Le code dans index.html appelle déjà setupToasts via window.showToast
// });

console.log('utils.js chargé');
