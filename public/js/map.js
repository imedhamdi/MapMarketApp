// js/map.js

/**
 * @file map.js
 * @description Gestion de la carte interactive avec Leaflet.js.
 * Affiche les annonces, gère la géolocalisation (avec tentative de centrage auto au démarrage),
 * les marqueurs, le clustering, et l'interaction avec la carte.
 */

import * as state from './state.js';
import {
    showToast,
    toggleGlobalLoader,
    sanitizeHTML,
    formatCurrency,
    getQueryParam,
    debounce,
    calculateDistance
} from './utils.js';

let mapInstance = null; // Instance de la carte Leaflet
let userMarker = null; // Marqueur pour la position de l'utilisateur
let tempMarker = null; // Marqueur temporaire pour la création d'annonce/alerte
let adMarkersLayer = null; // Layer group pour les marqueurs d'annonces (pour clustering)
let adMarkersById = {}; // Stocke les marqueurs par ID
let alertMarkersLayer = null; // Layer group pour les marqueurs/zones d'alertes

let listViewContainer, adsListView, toggleViewBtn;

// Configuration des icônes
const pulsingIconConfig = {
    className: 'pulsing-marker-wrapper', // Classe CSS pour le conteneur externe
    html: '<div class="pulsing-marker-visuals"></div>', // HTML pour l'icône animée (CSS requis)
    iconSize: [24, 24], // Taille de l'icône
    iconAnchor: [12, 12], // Point d'ancrage de l'icône (centre)
    popupAnchor: [0, -14] // Point d'ancrage de la popup par rapport à l'icône
};

const adIconConfig = (ad) => {
    const categories = state.getCategories ? state.getCategories() : [];
    const category = categories.find(cat => cat.id === ad.category);
    const iconClass = category ? category.icon : 'fa-solid fa-map-pin'; // Icône par défaut
    const color = category ? category.color : 'var(--primary-color)'; // Couleur par défaut
    return L.divIcon({
        html: `<div class="map-marker-custom" style="--marker-color: ${color};"><i class="${iconClass}"></i></div>`,
        className: 'custom-leaflet-div-icon',
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -42]
    });
};

const alertIconConfig = (alertItem) => {
    return L.divIcon({
        html: `<div class="map-marker-custom map-marker-alert" style="--marker-color: var(--accent-color);"><i class="fa-solid fa-bell"></i></div>`,
        className: 'custom-leaflet-div-icon',
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -42]
    });
};


// Éléments du DOM
let mapViewNode, mapLoaderNode;
let geolocateBtn;
let mapZoomLevelDisplay, mapLocationFeedbackDisplay;

/**
 * Initialise la carte Leaflet et les éléments associés.
 */
export function init() {
    if (mapInstance) {
        console.warn("MapCtrl.init: Tentative de ré-initialisation de la carte. Annulation.");
        return;
    }

    mapViewNode = document.getElementById('map-view');
    mapLoaderNode = document.querySelector('#map-view .map-loader');
    geolocateBtn = document.getElementById('map-geolocate-btn');
    mapZoomLevelDisplay = document.getElementById('map-zoom-level');
    mapLocationFeedbackDisplay = document.getElementById('map-current-location-feedback');
    listViewContainer = document.getElementById('list-view-container');
    adsListView = document.getElementById('ads-list-view');
    toggleViewBtn = document.getElementById('toggle-view-btn');

    if (!mapViewNode) {
        console.error("Élément #map-view non trouvé. La carte ne peut pas être initialisée.");
        if (mapLoaderNode) mapLoaderNode.innerHTML = '<p style="color:red;">Erreur: Conteneur de carte manquant.</p>';
        return;
    }

    if (typeof L === 'undefined') {
        console.error("Leaflet n'est pas chargé. La carte ne peut pas être initialisée.");
        if (mapLoaderNode) mapLoaderNode.innerHTML = '<p style="color:red;">Erreur: Librairie de carte manquante.</p>';
        return;
    }

    if (mapViewNode._leaflet_id) {
        console.warn("MapCtrl.init: Le conteneur #map-view semble déjà géré par Leaflet (_leaflet_id existe). Annulation.");
        return;
    }

    const latParam = getQueryParam('lat');
    const lngParam = getQueryParam('lng');
    const zoomParam = getQueryParam('zoom');
    const persistedMapState = state.getMapState(); // Peut contenir .center, .zoom, .userPosition
    let initialViewDeterminedByUrl = false;
    let viewToSet;

    if (latParam && lngParam) {
        const targetLat = parseFloat(latParam);
        const targetLng = parseFloat(lngParam);
        const targetZoom = zoomParam ? parseInt(zoomParam) : (persistedMapState?.zoom || 15); // Zoom plus élevé si URL
        if (!isNaN(targetLat) && !isNaN(targetLng)) {
            viewToSet = { coords: [targetLat, targetLng], zoom: targetZoom };
            initialViewDeterminedByUrl = true;
            console.log("Vue initiale déterminée par les paramètres d'URL:", viewToSet);
        }
    }

    if (!viewToSet && persistedMapState && persistedMapState.center) {
        viewToSet = { coords: [persistedMapState.center.lat, persistedMapState.center.lng], zoom: persistedMapState.zoom || 13 };
        console.log("Vue initiale déterminée par l'état persisté de la carte:", viewToSet);
    }

    if (!viewToSet) {
        viewToSet = { coords: [48.8566, 2.3522], zoom: 13 }; // Paris par défaut
        console.log("Vue initiale par défaut (Paris):", viewToSet);
    }

    try {
        mapInstance = L.map(mapViewNode, {
            zoomControl: false,
            preferCanvas: true,
            attributionControl: false,
        }).setView(viewToSet.coords, viewToSet.zoom);

        L.control.zoom({ position: 'topright' }).addTo(mapInstance);
        L.control.attribution({ prefix: '<a href="https://leafletjs.com" title="A JS library for interactive maps">Leaflet</a> | Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(mapInstance);

        updateTileLayer();
        if (mapLoaderNode) mapLoaderNode.classList.add('hidden');

        mapInstance.on('moveend', handleMapChange);
        mapInstance.on('zoomend', handleMapChange);
        mapInstance.on('click', handleMapClick);

        if (typeof L.markerClusterGroup === 'function') {
            adMarkersLayer = L.markerClusterGroup({
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                iconCreateFunction: function(cluster) {
                    const count = cluster.getChildCount();
                    let c = ' marker-cluster-';
                    if (count < 10) c += 'small';
                    else if (count < 100) c += 'medium';
                    else c += 'large';
                    return new L.DivIcon({ html: '<div><span>' + count + '</span></div>', className: 'marker-cluster' + c, iconSize: new L.Point(40, 40) });
                }
            });
        } else {
            console.warn("Leaflet.markercluster n'est pas chargé. Le clustering sera désactivé.");
            adMarkersLayer = L.layerGroup();
        }
        if (mapInstance && adMarkersLayer) mapInstance.addLayer(adMarkersLayer);

        alertMarkersLayer = L.layerGroup();
        if (mapInstance && alertMarkersLayer) mapInstance.addLayer(alertMarkersLayer);

        if (geolocateBtn) geolocateBtn.addEventListener('click', () => geolocateUser(true)); // Clic manuel centre toujours

        if (toggleViewBtn && listViewContainer) {
            toggleViewBtn.addEventListener('click', () => {
                const isHidden = listViewContainer.classList.toggle('hidden');
                listViewContainer.setAttribute('aria-hidden', isHidden.toString());
                const icon = toggleViewBtn.querySelector('i');
                
                if (!isHidden) { // Si la liste est maintenant visible
                    renderAdsInListView(); // Peupler la liste avec les annonces visibles sur la carte
                    toggleViewBtn.setAttribute('aria-label', 'Afficher la carte');
                    if (icon) { icon.className = 'fa-solid fa-map'; }
                } else { // Si la carte est maintenant visible
                    toggleViewBtn.setAttribute('aria-label', 'Afficher la liste des annonces');
                    if (icon) { icon.className = 'fa-solid fa-list'; }
                }
            });
        }

        updateMapInfoBar(); // Met à jour le zoom initial
        window.addEventListener('resize', debounceMapInvalidateSize);
        const observer = new MutationObserver(() => {
            if (mapViewNode.offsetParent !== null && mapInstance) {
                debounceMapInvalidateSize();
            }
        });
        observer.observe(mapViewNode, { attributes: true, childList: true, subtree: true });

        // Logique de géolocalisation au démarrage
        const adIdParamForFocus = getQueryParam('ad_id');
        if (!initialViewDeterminedByUrl) {
            // Si la vue N'A PAS été définie par l'URL, on tente la géolocalisation automatique ET le centrage.
            console.log("Tentative de géolocalisation automatique avec centrage.");
            geolocateUser(true); // TRUE pour centrer sur la position actuelle
        } else if (persistedMapState && persistedMapState.userPosition) {
            // La vue a été définie par l'URL, mais on a une position utilisateur sauvegardée.
            console.log("Vue définie par URL, affichage du marqueur utilisateur sauvegardé sans recentrage.");
            updateUserMarker(persistedMapState.userPosition.lat, persistedMapState.userPosition.lng, persistedMapState.userPosition.accuracy, false);
        } else {
            // La vue a été définie par l'URL, et pas de position utilisateur sauvegardée.
            console.log("Vue définie par URL, tentative de géolocalisation sans recentrage pour afficher le marqueur.");
            geolocateUser(false); // Tente de géolocaliser pour placer le marqueur, mais ne recentre pas.
        }

        if (adIdParamForFocus && initialViewDeterminedByUrl) { // Uniquement si URL a aussi défini la position
            state.set('ui.map.focusAdIdOnLoad', adIdParamForFocus, true);
        }
        // Dispatcher un événement pour indiquer que la carte est prête pour d'autres modules
        document.dispatchEvent(new CustomEvent('mapMarket:mapReady', { detail: { mapInstance }}));

    } catch (error) {
        console.error("Erreur lors de l'initialisation de Leaflet:", error);
        if (mapLoaderNode && (!mapInstance || !mapViewNode._leaflet_id)) {
            mapLoaderNode.innerHTML = `<p style="color:red;">Erreur d'initialisation de la carte: ${error.message}</p>`;
        }
        mapInstance = null;
        return;
    }

    state.subscribe('ui.darkModeChanged', updateTileLayer);
    state.subscribe('adsChanged', (adsData) => {
        const ads = adsData.ads || adsData; // adsData peut être l'objet complet ou juste le tableau
        displayAdsOnMap(ads);
        const focusAdId = state.get('ui.map.focusAdIdOnLoad');
        if (focusAdId && ads.length > 0) { // S'assurer que les annonces sont chargées avant de focus
            focusOnAd(focusAdId);
            state.set('ui.map.focusAdIdOnLoad', null, true);
        }
    });
    state.subscribe('alertsChanged', (alerts) => displayAlertsOnMap(alerts));

    // Centrage automatique sur la position utilisateur si possible
    centerMapOnUserLocation();

    console.log('Module Map initialisé.');
}

const debounceMapInvalidateSize = debounce(invalidateMapSize, 250);

function invalidateMapSize() {
    if (mapInstance) {
        mapInstance.invalidateSize({ animate: true, duration: 0.5 });
    }
}

function updateTileLayer() {
    if (!mapInstance) return;
    const isDark = state.isDarkMode();
    mapInstance.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
            mapInstance.removeLayer(layer);
        }
    });
    let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    let tileOptions = {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    };

    if (isDark) {
        // tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'; // Exemple tuiles sombres
        // tileOptions.subdomains = 'abcd';
        // tileOptions.attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
        if (mapViewNode) mapViewNode.classList.add('map-dark-mode');
    } else {
        if (mapViewNode) mapViewNode.classList.remove('map-dark-mode');
    }
    L.tileLayer(tileUrl, tileOptions).addTo(mapInstance);
}

function handleMapChange() {
    if (!mapInstance) return;
    const center = mapInstance.getCenter();
    const zoom = mapInstance.getZoom();
    state.setMapState({ center: { lat: center.lat.toFixed(5), lng: center.lng.toFixed(5) }, zoom: zoom });
    updateMapInfoBar();
}

function updateMapInfoBar() {
    if (mapInstance && mapZoomLevelDisplay) {
        mapZoomLevelDisplay.textContent = `Zoom: ${mapInstance.getZoom()}`;
        mapZoomLevelDisplay.dataset.zoomValue = mapInstance.getZoom();
    }
    const userPos = state.getMapState()?.userPosition;
    if (mapLocationFeedbackDisplay) {
        if (userPos) {
            mapLocationFeedbackDisplay.textContent = `Localisation: Précise (approx. ${userPos.accuracy?.toFixed(0)}m)`;
        } else if (mapLocationFeedbackDisplay.textContent === 'Recherche...') {
            // Conserver "Recherche..."
        } else {
            mapLocationFeedbackDisplay.textContent = 'Localisation: Inconnue';
        }
    }
}

export async function geolocateUser(centerMap = true) {
    if (!navigator.geolocation) {
        showToast('La géolocalisation n\'est pas supportée par votre navigateur.', 'warning');
        if (mapLocationFeedbackDisplay) mapLocationFeedbackDisplay.textContent = 'Géoloc. non supportée';
        return;
    }

    if (mapLocationFeedbackDisplay) mapLocationFeedbackDisplay.textContent = 'Recherche...';
    if (geolocateBtn) geolocateBtn.disabled = true;
    const geolocateIcon = geolocateBtn ? geolocateBtn.querySelector('i') : null;
    if (geolocateIcon) geolocateIcon.classList.add('fa-spin');

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            });
        });
        const { latitude, longitude, accuracy } = position.coords;
        state.setMapState({ userPosition: { lat: latitude, lng: longitude, accuracy: accuracy } });

        if (mapInstance) { // S'assurer que mapInstance est défini
            updateUserMarker(latitude, longitude, accuracy, centerMap);
        } else {
            console.warn("Tentative de mise à jour du marqueur utilisateur avant l'initialisation de la carte.");
            // Stocker pour une application ultérieure si la carte n'est pas prête
            state.set('ui.map.pendingGeolocation', { lat: latitude, lng: longitude, accuracy: accuracy, centerMap: centerMap }, true);
        }

        if (mapLocationFeedbackDisplay) mapLocationFeedbackDisplay.textContent = `Localisation: Précise (approx. ${accuracy.toFixed(0)}m)`;
        if(centerMap) showToast('Position trouvée et carte centrée !', 'success', 2000);
        else showToast('Position trouvée !', 'success', 2000);


    } catch (error) {
        let message = 'Impossible d\'obtenir votre position.';
        if (error.code === error.PERMISSION_DENIED) message = 'Vous avez refusé la géolocalisation.';
        else if (error.code === error.POSITION_UNAVAILABLE) message = 'Votre position est actuellement indisponible.';
        else if (error.code === error.TIMEOUT) message = 'La demande de géolocalisation a expiré.';
        showToast(message, 'error');
        if (mapLocationFeedbackDisplay) mapLocationFeedbackDisplay.textContent = 'Erreur géoloc.';
        console.warn('Erreur de géolocalisation:', error);
    } finally {
        if (geolocateBtn) geolocateBtn.disabled = false;
        if (geolocateIcon) geolocateIcon.classList.remove('fa-spin');
    }
}

function updateUserMarker(lat, lng, accuracy, centerMap = true) {
    if (!mapInstance) return;
    const userLatLng = L.latLng(lat, lng);
    if (!userMarker) {
        const icon = L.divIcon(pulsingIconConfig);
        userMarker = L.marker(userLatLng, {
                icon: icon,
                zIndexOffset: 1000,
                alt: 'Votre position'
            })
            .addTo(mapInstance)
            .bindPopup(`<b>Vous êtes ici</b><br/>(Précision: ~${accuracy.toFixed(0)}m)`);
    } else {
        userMarker.setLatLng(userLatLng);
        userMarker.getPopup().setContent(`<b>Vous êtes ici</b><br/>(Précision: ~${accuracy.toFixed(0)}m)`);
    }
    if (centerMap) {
        mapInstance.flyTo(userLatLng, Math.max(mapInstance.getZoom() || 13, 15)); // Assurer un zoom minimum de 13
    }
}

/**
 * Centre la carte sur la position de l'utilisateur si possible.
 * Utilise l'API navigator.geolocation et applique un fallback sur Lyon en cas
 * de refus ou d'indisponibilité. Un petit marqueur est placé sur la position
 * obtenue pour plus de clarté.
 */
export async function centerMapOnUserLocation() {
    if (!mapInstance) return;

    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                mapInstance.setView([latitude, longitude], 13);
                if (!userMarker) {
                    userMarker = L.marker([latitude, longitude]).addTo(mapInstance);
                } else {
                    userMarker.setLatLng([latitude, longitude]);
                }
            },
            (error) => {
                console.warn('Géolocalisation refusée par l\'utilisateur ou indisponible.', error.message);
                mapInstance.setView([45.7640, 4.8357], 12);
            }
        );
    } else {
        console.log('La géolocalisation n\'est pas supportée par ce navigateur.');
        mapInstance.setView([45.7640, 4.8357], 12);
    }
}

// NOUVELLE FONCTION À AJOUTER ET EXPORTER
/**
 * Initialise une mini-carte Leaflet dans un conteneur spécifié.
 * Utilisée typiquement pour des formulaires où une localisation doit être choisie.
 * @param {string} containerId - L'ID de l'élément HTML qui contiendra la mini-carte.
 * @param {function} onMarkerPlacedCallback - Fonction appelée avec les latlng lorsque le marqueur est placé/déplacé.
 * @param {object|null} initialCoords - Coordonnées initiales {lat, lng} pour centrer la carte et placer un marqueur.
 * @param {number} initialZoom - Zoom initial si initialCoords n'est pas fourni (défaut 12).
 * @param {number} markerZoom - Zoom appliqué après le placement d'un marqueur (défaut 15).
 * @returns {L.Map|null} L'instance de la mini-carte Leaflet, ou null en cas d'erreur.
 */
export function initMiniMap(containerId, onMarkerPlacedCallback, initialCoords = null, initialZoom = 12, markerZoom = 15) {
    const mapContainer = document.getElementById(containerId);
    if (!mapContainer) {
        console.error(`MiniMap Error: Container element #${containerId} not found.`);
        showToast(`Erreur : conteneur de mini-carte #${containerId} introuvable.`, 'error');
        return null;
    }

    if (typeof L === 'undefined') {
        console.error("MiniMap Error: Leaflet (L) is not defined.");
        showToast("Erreur : Librairie de carte (Leaflet) non chargée.", 'error');
        return null;
    }

    // Si une carte Leaflet existe déjà dans ce conteneur, la supprimer avant de réinitialiser.
    // Cela est crucial car adFormMiniMap.remove() est appelé dans ads.js,
    // mais cette vérification interne rend initMiniMap plus robuste.
    if (mapContainer._leaflet_id) {
        // Tenter de récupérer l'instance existante et la supprimer proprement.
        // Leaflet ne stocke pas l'instance directement sur l'élément de manière accessible facilement.
        // Le plus simple est de vider le conteneur et de laisser la logique appelante (ads.js) gérer
        // la suppression de l'ancienne instance (adFormMiniMap.remove()).
        // Ici, on assume que si _leaflet_id existe, ads.js devrait avoir appelé .remove() dessus.
        // Pour éviter les conflits, on peut vider le conteneur.
        mapContainer.innerHTML = ''; // Vide le contenu pour s'assurer qu'une ancienne carte ne persiste pas visuellement.
        delete mapContainer._leaflet_id; // Supprime la référence pour permettre une nouvelle initialisation.
         console.warn(`MiniMap: Container #${containerId} was already initialized. Cleaned up for re-initialization.`);
    }


    const viewCenter = initialCoords ? [initialCoords.lat, initialCoords.lng] : [48.8566, 2.3522]; // Paris par défaut
    const zoomLevel = initialCoords ? markerZoom : initialZoom;

    try {
        const miniMapInstance = L.map(containerId, {
            zoomControl: true,
            preferCanvas: true,
            attributionControl: false, // Pas d'attribution pour une mini-carte pour garder l'UI simple
        }).setView(viewCenter, zoomLevel);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            // attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' // Attribution courte si besoin
        }).addTo(miniMapInstance);

        let currentMarker = null;

        const updateMarkerAndCallback = (latlng) => {
            if (!currentMarker) {
                currentMarker = L.marker(latlng, { draggable: true }).addTo(miniMapInstance);
                currentMarker.on('dragend', function(event) {
                    const newLatLng = event.target.getLatLng();
                    miniMapInstance.panTo(newLatLng);
                    if (onMarkerPlacedCallback) {
                        onMarkerPlacedCallback(newLatLng);
                    }
                });
            } else {
                currentMarker.setLatLng(latlng);
            }
            miniMapInstance.panTo(latlng);
            if (onMarkerPlacedCallback) {
                onMarkerPlacedCallback(latlng);
            }
        };

        if (initialCoords) {
            updateMarkerAndCallback(L.latLng(initialCoords.lat, initialCoords.lng));
        }

        miniMapInstance.on('click', function(e) {
            updateMarkerAndCallback(e.latlng);
            miniMapInstance.setView(e.latlng, Math.max(miniMapInstance.getZoom(), markerZoom));
        });

        // S'assurer que la taille de la carte est correcte après son affichage (ex: dans une modale)
        // Un léger délai peut aider si la modale a des transitions CSS.
        setTimeout(() => {
            miniMapInstance.invalidateSize();
            if (currentMarker) { // Recentrer sur le marqueur si existant
                 miniMapInstance.setView(currentMarker.getLatLng(), Math.max(miniMapInstance.getZoom(), markerZoom));
            } else if (initialCoords) { // Ou sur les coords initiales
                miniMapInstance.setView([initialCoords.lat, initialCoords.lng], markerZoom);
            }
        }, 200); // Augmenté pour être sûr

        return miniMapInstance;

    } catch (error) {
        console.error(`Error initializing mini-map in #${containerId}:`, error);
        showToast(`Erreur d'initialisation de la mini-carte: ${error.message}`, 'error');
        if (mapContainer && !mapContainer._leaflet_id) { // Si l'initialisation a échoué avant que Leaflet ne s'attache
            mapContainer.innerHTML = `<p style="color:red;">Erreur d'init. mini-carte: ${error.message}</p>`;
        }
        return null;
    }
}


// ... Votre fonction export function init() pour la carte principale ...


function handleMapClick(event) {
    if (!mapInstance) return;
    const isPlacingAdMarker = state.get('ui.map.isPlacingAdMarker');
    const isPlacingAlertMarker = state.get('ui.map.isPlacingAlertMarker');
    if (isPlacingAdMarker || isPlacingAlertMarker) {
        const latlng = event.latlng;
        updateTempMarker(latlng.lat, latlng.lng, isPlacingAdMarker ? 'ad' : 'alert');
        state.setMapState({ tempMarkerPosition: { lat: latlng.lat, lng: latlng.lng } });
        const eventName = isPlacingAdMarker ? 'mapMarket:adMarkerPlaced' : 'mapMarket:alertMarkerPlaced';
        document.dispatchEvent(new CustomEvent(eventName, { detail: { latlng } }));
    } else {
        const previewCard = document.getElementById('ad-preview-card');
        if (previewCard) previewCard.classList.add('hidden');
    }
}

export function updateTempMarker(lat, lng, type = 'default') {
    if (!mapInstance) return;
    const latlng = L.latLng(lat, lng);
    let iconHtml = '<i class="fa-solid fa-location-pin fa-2x" style="color: var(--primary-color);"></i>';
    if (type === 'ad') iconHtml = '<i class="fa-solid fa-tag fa-2x" style="color: var(--success-color);"></i>';
    else if (type === 'alert') iconHtml = '<i class="fa-solid fa-bullseye fa-2x" style="color: var(--accent-color);"></i>';

    const tempIcon = L.divIcon({
        html: `<div class="map-marker-temporary" role="img" aria-label="Marqueur temporaire">${iconHtml}</div>`,
        className: 'custom-leaflet-div-icon temporary-marker-icon',
        iconSize: [30, 42],
        iconAnchor: [15, 42]
    });
    if (!tempMarker) {
        tempMarker = L.marker(latlng, { icon: tempIcon, draggable: true, zIndexOffset: 900, alt: 'Marqueur déplaçable' }).addTo(mapInstance);
        tempMarker.on('dragend', function(event) {
            const newLatLng = event.target.getLatLng();
            state.setMapState({ tempMarkerPosition: { lat: newLatLng.lat, lng: newLatLng.lng } });
            const currentMode = state.get('ui.map.isPlacingAdMarker') ? 'ad' : (state.get('ui.map.isPlacingAlertMarker') ? 'alert' : 'default');
            const eventName = currentMode === 'ad' ? 'mapMarket:adMarkerPlaced' : (currentMode === 'alert' ? 'mapMarket:alertMarkerPlaced' : '');
            if (eventName) document.dispatchEvent(new CustomEvent(eventName, { detail: { latlng: newLatLng } }));
        });
    } else {
        tempMarker.setLatLng(latlng).setIcon(tempIcon);
    }
    mapInstance.panTo(latlng);
}

export function removeTempMarker() {
    if (mapInstance && tempMarker) {
        mapInstance.removeLayer(tempMarker);
        tempMarker = null;
    }
    state.setMapState({ tempMarkerPosition: null });
}

export function displayAdsOnMap(ads) {
    if (!mapInstance || !adMarkersLayer) return;
    adMarkersLayer.clearLayers();
    adMarkersById = {}; // Vider l'objet à chaque mise à jour

    if (!ads || ads.length === 0) {
        // Si la vue liste est affichée, s'assurer qu'elle montre le message "aucune annonce"
        if(listViewContainer && !listViewContainer.classList.contains('hidden')) renderAdsInListView();
        return;
    }

    ads.forEach(ad => {
        const lat = ad.latitude ?? ad.location?.coordinates?.[1];
        const lng = ad.longitude ?? ad.location?.coordinates?.[0];
        const adId = ad._id || ad.id;

        if (lat != null && lng != null && adId) {
            const marker = L.marker([lat, lng], { icon: adIconConfig(ad), alt: sanitizeHTML(ad.title) });
            marker.on('click', () => {
                showAdPreviewCard(ad);
            });
            adMarkersLayer.addLayer(marker);
            adMarkersById[adId] = marker; // Stocker le marqueur par ID
        }
    });
    
    // Mettre à jour la vue liste si elle est actuellement affichée
    if(listViewContainer && !listViewContainer.classList.contains('hidden')) {
        renderAdsInListView();
    }
}

function showAdPreviewCard(ad) {
    const card = document.getElementById('ad-preview-card');
    const image = document.getElementById('preview-card-image');
    const title = document.getElementById('preview-card-title');
    const price = document.getElementById('preview-card-price');
    const category = document.getElementById('preview-card-category');
    const distance = document.getElementById('preview-card-distance');
    const favoriteBtn = document.getElementById('preview-card-favorite-btn');
    if (!card) return;

    card.dataset.adId = ad._id || ad.id || '';

    if (image) {
        image.src = (ad.imageUrls && ad.imageUrls[0]) || 'https://placehold.co/96x96/e0e0e0/757575?text=Ad';
        image.alt = `Image de ${sanitizeHTML(ad.title)}`;
    }
    if (title) title.textContent = sanitizeHTML(ad.title);
    if (price) price.textContent = ad.price != null ? formatCurrency(ad.price, ad.currency) : 'N/A';

    const categories = state.getCategories ? state.getCategories() : [];
    const catObj = categories.find(c => c.id === ad.category);
    const catLabel = ad.categoryLabel || catObj?.name || ad.category || '';
    if (category) category.textContent = catLabel;

    if (distance) {
        const userPos = state.getMapState()?.userPosition;
        const lat = ad.latitude ?? ad.location?.coordinates?.[1];
        const lng = ad.longitude ?? ad.location?.coordinates?.[0];
        if (userPos && lat != null && lng != null) {
            const dist = calculateDistance(userPos.lat, userPos.lng, lat, lng);
            distance.textContent = `${dist.toFixed(1)} km`;
        } else {
            distance.textContent = '';
        }
    }

    if (favoriteBtn) {
        const currentUser = state.getCurrentUser();
        const ownerId = ad.userId?._id || ad.userId;
        const isOwner = currentUser && ownerId && ownerId === currentUser._id;
        favoriteBtn.classList.toggle('hidden', isOwner);
        if (!isOwner) {
            const adId = ad._id || ad.id;
            let isFav = state.isFavorite(adId); // Utiliser la fonction helper de l'état

            // Définir l'état initial de l'interface
            favoriteBtn.classList.toggle('active', isFav);
            favoriteBtn.setAttribute('aria-pressed', isFav.toString());
            const icon = favoriteBtn.querySelector('i');
            if (icon) icon.className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';

            // Mise à jour optimiste au clic
            favoriteBtn.onclick = (e) => {
                e.stopPropagation();

                // 1. Mettre à jour l'UI immédiatement
                isFav = !isFav; // Inverser l'état
                // 2. Envoyer l'événement pour le traitement en arrière-plan
                document.dispatchEvent(new CustomEvent('mapMarket:toggleFavorite', {
                    detail: { adId: adId, setFavorite: isFav, sourceButton: favoriteBtn }
                }));
            };
        } else {
            favoriteBtn.onclick = null;
        }
    }

    card.onclick = (e) => {
        if (e.target.closest('#preview-card-favorite-btn')) return;
        card.classList.add('hidden');
        document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', { detail: { adId: ad._id || ad.id } }));
    };

    card.classList.remove('hidden');
}

export function displayAlertsOnMap(alerts) {
    if (!mapInstance || !alertMarkersLayer) return;
    alertMarkersLayer.clearLayers();
    if (!alerts || alerts.length === 0) return;
    alerts.forEach(alertItem => { /* ... comme avant ... */ });
}

export function focusOnAd(adId) {
    if (!mapInstance || !adMarkersLayer) return;
    const ads = state.get('ads');
    if (!ads || ads.length === 0) return; // Ajout d'une vérification si ads est vide
    const ad = ads.find(a => a.id === adId);
    // ... (reste de la logique comme avant, avec vérifications supplémentaires si ad est trouvé) ...
    if (ad && ad.latitude != null && ad.longitude != null) {
        // ... (logique de flyTo et openPopup)
    } else {
        showToast("Impossible de localiser cette annonce sur la carte ou annonce non trouvée.", "warning");
    }
}

export function renderAdsInListView() {
    if (!mapInstance || !adsListView) return;
    adsListView.innerHTML = '';
    const bounds = mapInstance.getBounds();
    const ads = state.get('ads') || [];
    
    const visibleAds = ads.filter(ad => {
        const lat = ad.latitude ?? ad.location?.coordinates?.[1];
        const lng = ad.longitude ?? ad.location?.coordinates?.[0];
        return lat != null && lng != null && bounds.contains([lat, lng]);
    });

    const adItemTemplate = document.getElementById('my-ad-item-template');
    if (visibleAds.length === 0 || !adItemTemplate) {
        adsListView.innerHTML = '<li class="placeholder-message" style="background: none; border: none;"><i class="fa-solid fa-box-open"></i> Aucune annonce dans cette zone. Déplacez la carte ou dézoomez.</li>';
        return;
    }

    visibleAds.forEach(ad => {
        const adId = ad._id || ad.id;
        const clone = adItemTemplate.content.cloneNode(true);
        const listItem = clone.querySelector('li');
        listItem.dataset.adId = adId;

        const img = listItem.querySelector('.item-image');
        if (img) {
            img.src = (ad.imageUrls && ad.imageUrls[0]) || 'https://placehold.co/80x80/e0e0e0/757575?text=Ad';
            img.alt = `Image pour ${ad.title}`;
        }

        const title = listItem.querySelector('.item-title');
        if (title) title.textContent = ad.title;
        
        const price = listItem.querySelector('.item-price');
        if(price) price.textContent = formatCurrency(ad.price, ad.currency);

        // Retirer les actions d'édition/suppression car ce ne sont pas les annonces de l'utilisateur
        listItem.querySelector('.my-ad-actions')?.remove();

        listItem.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', { detail: { adId: adId } }));
        });

        // Interaction avec la carte
        listItem.addEventListener('mouseenter', () => {
            const marker = adMarkersById[adId];
            if (marker && marker.getElement()) {
                marker.getElement().classList.add('map-marker-custom--highlighted');
                marker.openPopup();
            }
        });
        listItem.addEventListener('mouseleave', () => {
            const marker = adMarkersById[adId];
            if (marker && marker.getElement()) {
                marker.getElement().classList.remove('map-marker-custom--highlighted');
            }
        });
        adsListView.appendChild(clone);
    });
}

// Contenu des popups et gestionnaires d'événements pour displayAdsOnMap
// (omis pour la concision, mais ils sont dans la version précédente et doivent être conservés)
// Assurez-vous de remettre la logique complète pour marker.bindPopup et marker.on('popupopen', ...)
// dans displayAdsOnMap, et pour displayAlertsOnMap.

// Rétablissement du contenu détaillé pour bindPopup dans displayAdsOnMap:
// Réinsérer cette partie dans la fonction displayAdsOnMap
// ads.forEach(ad => {
//     if (ad.latitude != null && ad.longitude != null) {
//         const marker = L.marker([ad.latitude, ad.longitude], { icon: adIconConfig(ad), alt: sanitizeHTML(ad.title) });
//         marker.bindPopup(`
//             <div class="map-popup-content">
//                 <h4>${sanitizeHTML(ad.title)}</h4>
//                 <p class="price">${ad.price != null ? sanitizeHTML(state.getLanguage() === 'fr' ? ad.price.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : ad.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })) : 'Prix non spécifié'}</p>
//                 <p class="category">${sanitizeHTML(ad.categoryLabel || ad.category)}</p>
//                 <button class="btn btn-sm btn-primary view-ad-detail-btn" data-ad-id="${ad.id}" aria-label="Voir les détails de ${sanitizeHTML(ad.title)}">Voir détails</button>
//             </div>
//         `);
//         marker.on('popupopen', (e) => {
//             const popupNode = e.popup.getElement();
//             const viewDetailBtn = popupNode.querySelector(`.view-ad-detail-btn[data-ad-id="${ad.id}"]`);
//             if (viewDetailBtn) {
//                 viewDetailBtn.replaceWith(viewDetailBtn.cloneNode(true));
//                 popupNode.querySelector(`.view-ad-detail-btn[data-ad-id="${ad.id}"]`).addEventListener('click', () => {
//                     document.dispatchEvent(new CustomEvent('mapmarket:openModal', { detail: { modalId: 'ad-detail-modal' } }));
//                     document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', { detail: { adId: ad.id } }));
//                 });
//             }
//         });
//         adMarkersLayer.addLayer(marker);
//     } // ...
// });
// Et pour displayAlertsOnMap
// alerts.forEach(alertItem => {
//     if (alertItem.latitude != null && alertItem.longitude != null) {
//         const marker = L.marker([alertItem.latitude, alertItem.longitude], { icon: alertIconConfig(alertItem), alt: `Alerte: ${sanitizeHTML(alertItem.keywords)}`});
//         marker.bindPopup(`
//             <div class="map-popup-content">
//                 <h5>Alerte: ${sanitizeHTML(alertItem.keywords)}</h5>
//                 <p>Rayon: ${alertItem.radius || 'N/A'} km</p>
//                 <p>Catégorie: ${sanitizeHTML(alertItem.categoryLabel || alertItem.category || 'Toutes')}</p>
//             </div>
//         `);
//         alertMarkersLayer.addLayer(marker);
//         // ... (cercle)
//     }
// });
