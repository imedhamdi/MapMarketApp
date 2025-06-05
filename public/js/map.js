// ===== public/js/map.js =====
/**
 * map.js – Gestion de la carte Leaflet et affichage des marqueurs d'annonces/alertes.
 */

import * as State from './state.js';
import * as Utils from './utils.js';

let mapInstance = null;
let adMarkersLayer = null;
let alertLayerGroup = null;
let userMarker = null;
let tempMarker = null;
const adMarkerMap = new Map();

let mapViewNode = null;
let geolocateBtn = null;
let zoomLevelDisplay = null;
let locationStatusDisplay = null;
let mapLoaderElement = null;

let placementMode = null; // 'ad' | 'alert' | null

/**
 * Initialise la carte dans le conteneur spécifié.
 * @param {string} containerId - ID de la balise <div> où monter la carte.
 * @param {{ lat: number, lng: number }} initialCoords - Coordonnées initiales.
 * @param {number} initialZoom - Niveau de zoom initial.
 */
export function initMap(containerId = 'map-view', initialCoords = { lat: 48.8566, lng: 2.3522 }, initialZoom = 13) {
  if (mapInstance) return;

  try {
    mapViewNode = document.getElementById(containerId);
    if (!mapViewNode || typeof L === 'undefined') {
      throw new Error('Leaflet non chargé ou conteneur manquant');
    }

    mapLoaderElement = mapViewNode.querySelector('.map-loader');

    zoomLevelDisplay = document.getElementById('map-zoom-level');
    locationStatusDisplay = document.getElementById('map-current-location-feedback');
    geolocateBtn = document.getElementById('map-geolocate-btn');

    mapInstance = L.map(mapViewNode, { zoomControl: false, attributionControl: false });
    mapInstance.setView([initialCoords.lat, initialCoords.lng], initialZoom);

    L.control.zoom({ position: 'topright', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(mapInstance);
    updateTileLayer();

    adMarkersLayer = L.layerGroup().addTo(mapInstance);
    alertLayerGroup = L.layerGroup().addTo(mapInstance);

    mapInstance.on('moveend zoomend', handleMapMoveEnd);
    mapInstance.on('click', handleMapClick);

    if (geolocateBtn) {
      geolocateBtn.addEventListener('click', () => geolocateUser(true));
    }

    geolocateUser(false);

    State.subscribe('adsChanged', () => {
      try {
        displayAdsOnMap(State.get('ads') || []);
      } catch (e) {
        console.warn('Erreur affichage annonces:', e);
      }
    });
    State.subscribe('alertsChanged', () => {
      try {
        displayAlertsOnMap(State.get('alerts') || []);
      } catch (e) {
        console.warn('Erreur affichage alertes:', e);
      }
    });
    State.subscribe('ui.darkModeChanged', updateTileLayer);

    document.addEventListener('mapMarket:enableAdPlacement', () => { placementMode = 'ad'; });
    document.addEventListener('mapMarket:enableAlertPlacement', () => { placementMode = 'alert'; });
    document.addEventListener('mapMarket:disablePlacement', () => { placementMode = null; removeTempMarker(); });

    updateMapInfoBar();
    if (mapLoaderElement) mapLoaderElement.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('mapMarket:mapReady'));
  } catch (err) {
    console.error('Erreur initMap :', err);
    Utils.showToast("Impossible d'initialiser la carte", 'error');
  }
}

/**
 * Met à jour la couche de tuiles en fonction du mode sombre.
 */
function updateTileLayer() {
  if (!mapInstance) return;

  mapInstance.eachLayer(layer => {
    if (layer instanceof L.TileLayer) mapInstance.removeLayer(layer);
  });

  const isDark = State.get('ui.darkMode');
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + (isDark ? ' &copy; <a href="https://carto.com/attributions">CARTO</a>' : '');

  const tileLayer = L.tileLayer(tileUrl, { maxZoom: 19, subdomains: isDark ? 'abcd' : 'abc', attribution });
  tileLayer.on('tileerror', () => {
    Utils.showToast('Problème de chargement des tuiles cartographiques', 'error');
  });
  tileLayer.addTo(mapInstance);
}

function handleMapMoveEnd() {
  if (!mapInstance) return;
  const center = mapInstance.getCenter();
  const zoom = mapInstance.getZoom();
  State.setMapState({ center: { lat: Number(center.lat.toFixed(6)), lng: Number(center.lng.toFixed(6)) }, zoom });
  updateMapInfoBar();
}

function handleMapClick(e) {
  if (!mapInstance || !placementMode) return;
  const { lat, lng } = e.latlng;
  updateTempMarker(lat, lng, placementMode);
  const eventName = placementMode === 'ad' ? 'mapMarket:adMarkerPlaced' : 'mapMarket:alertMarkerPlaced';
  document.dispatchEvent(new CustomEvent(eventName, { detail: { latlng: e.latlng } }));
}

/**
 * Affiche les informations de zoom et de localisation.
 */
function updateMapInfoBar() {
  if (mapInstance && zoomLevelDisplay) {
    const z = mapInstance.getZoom();
    zoomLevelDisplay.textContent = `Zoom: ${z}`;
    zoomLevelDisplay.dataset.zoomValue = String(z);
  }
  const userPos = State.get('ui.map.userPosition');
  if (locationStatusDisplay) {
    if (userPos) {
      locationStatusDisplay.textContent = `Localisation: Précise (±${Math.round(userPos.accuracy)}m)`;
    } else {
      locationStatusDisplay.textContent = 'Localisation: Inconnue';
    }
  }
}

/**
 * Tente de géolocaliser l'utilisateur.
 * @param {boolean} centerMap - Centre la carte sur la position si true.
 */
export async function geolocateUser(centerMap = false) {
  if (!navigator.geolocation) {
    Utils.showToast("Impossible d'accéder à la géolocalisation", 'error');
    return null;
  }
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
    });
    const { latitude, longitude, accuracy } = position.coords;
    State.setMapState({ userPosition: { lat: latitude, lng: longitude, accuracy } });
    updateUserMarker(latitude, longitude, accuracy, centerMap);
    return { lat: latitude, lng: longitude };
  } catch (err) {
    Utils.showToast("Impossible d'accéder à la géolocalisation", 'error');
    return null;
  }
}

function updateUserMarker(lat, lng, accuracy, centerMap) {
  if (!mapInstance) return;
  const latlng = [lat, lng];
  const icon = L.divIcon({
    className: 'pulsing-marker-wrapper',
    html: '<div class="pulsing-marker-visuals"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
  if (!userMarker) {
    userMarker = L.marker(latlng, { icon, alt: 'Votre position' }).addTo(mapInstance);
  } else {
    userMarker.setLatLng(latlng);
  }
  userMarker.bindPopup(`<p>Vous êtes ici<br>(±${Math.round(accuracy)}m)</p>`);
  if (centerMap) {
    mapInstance.flyTo(latlng, Math.max(mapInstance.getZoom(), 15));
  }
  updateMapInfoBar();
}

/**
 * Met à jour ou crée un marqueur temporaire.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {string} type - 'ad' ou 'alert'.
 */
export function updateTempMarker(lat, lng, type = 'default') {
  if (!mapInstance) return;
  const latlng = [lat, lng];
  let iconHtml = '<i class="fa-solid fa-location-pin"></i>';
  if (type === 'ad') iconHtml = '<i class="fa-solid fa-tag"></i>';
  else if (type === 'alert') iconHtml = '<i class="fa-solid fa-bell"></i>';

  const tempIcon = L.divIcon({
    html: `<div class="map-marker-temporary">${iconHtml}</div>`,
    className: 'custom-leaflet-div-icon',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42]
  });

  if (!tempMarker) {
    tempMarker = L.marker(latlng, { draggable: true, icon: tempIcon, zIndexOffset: 900 }).addTo(mapInstance);
    tempMarker.on('dragend', ev => {
      const newLatLng = ev.target.getLatLng();
      State.setMapState({ tempMarkerPosition: { lat: newLatLng.lat, lng: newLatLng.lng } });
      const eventName = placementMode === 'ad' ? 'mapMarket:adMarkerPlaced' : 'mapMarket:alertMarkerPlaced';
      document.dispatchEvent(new CustomEvent(eventName, { detail: { latlng: newLatLng } }));
    });
  } else {
    tempMarker.setLatLng(latlng).setIcon(tempIcon);
  }
  State.setMapState({ tempMarkerPosition: { lat, lng } });
  mapInstance.panTo(latlng);
}

/**
 * Supprime le marqueur temporaire actuel.
 */
export function removeTempMarker() {
  if (mapInstance && tempMarker) {
    mapInstance.removeLayer(tempMarker);
    tempMarker = null;
  }
  State.setMapState({ tempMarkerPosition: null });
}

/**
 * Affiche les annonces sur la carte.
 * @param {Array<object>} adsArray - Tableau d'annonces.
 */
export function displayAdsOnMap(adsArray) {
  if (!mapInstance || !adMarkersLayer) return;
  adMarkersLayer.clearLayers();
  adMarkerMap.clear();
  if (!Array.isArray(adsArray)) return;

  const categories = State.getCategories ? State.getCategories() : [];

  adsArray.forEach(ad => {
    try {
      const { location } = ad;
      if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return;
      const catLabel = categories.find(c => c.id === ad.category)?.name || ad.category;
      const marker = L.marker([location.lat, location.lng], { icon: createIcon('ad', ad), alt: Utils.sanitizeHTML(ad.title) });
      const popupContent = `\n        <div class="ad-popup">\n          <strong>${Utils.sanitizeHTML(ad.title)}</strong><br>\n          <p>${Utils.sanitizeHTML(catLabel)}</p>\n          <p>${Utils.formatPrice(ad.price)}</p>\n          <button class="btn-view-details" data-ad-id="${ad._id}">Voir détails</button>\n        </div>`;
      marker.bindPopup(popupContent);
      marker.on('popupopen', ev => {
        const btn = ev.popup.getElement().querySelector('.btn-view-details');
        if (btn) {
          btn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('mapMarket:viewAdDetails', { detail: { adId: ad._id } }));
          }, { once: true });
        }
      });
      adMarkersLayer.addLayer(marker);
      adMarkerMap.set(ad._id, marker);
    } catch (err) {
      console.warn('Erreur création marqueur annonce:', err);
    }
  });
}

/**
 * Affiche les zones d'alerte sur la carte.
 * @param {Array<object>} alertsArray - Tableau d'alertes.
 */
export function displayAlertsOnMap(alertsArray) {
  if (!mapInstance || !alertLayerGroup) return;
  alertLayerGroup.clearLayers();
  if (!Array.isArray(alertsArray)) return;

  alertsArray.forEach(alertItem => {
    try {
      if (typeof alertItem.latitude !== 'number' || typeof alertItem.longitude !== 'number') return;
      const center = [alertItem.latitude, alertItem.longitude];
      const circle = L.circle(center, { radius: (alertItem.radius || 1) * 1000, color: 'var(--accent-color)', fillOpacity: 0.1 });
      const popup = `<p><strong>${Utils.sanitizeHTML(alertItem.keywords || 'Alerte')}</strong></p><p>Rayon: ${alertItem.radius || 1} km</p>`;
      circle.bindPopup(popup);
      alertLayerGroup.addLayer(circle);
    } catch (err) {
      console.warn('Erreur création zone alerte:', err);
    }
  });
}

/**
 * Centre la carte sur l'annonce et ouvre sa popup.
 * @param {string} adId - ID de l'annonce.
 */
export function focusOnAdMarker(adId) {
  if (!mapInstance || !adMarkersLayer) return;
  const marker = adMarkerMap.get(adId);
  if (marker) {
    const latlng = marker.getLatLng();
    mapInstance.flyTo(latlng, Math.max(mapInstance.getZoom(), 15));
    marker.openPopup();
  }
}

/**
 * Initialise une mini carte pour le formulaire d'annonce.
 * @param {string} containerId - ID du conteneur.
 * @param {Function} callbackOnClick - Callback appelé avec latlng lors du clic.
 * @param {{lat:number, lng:number}} [initialCoords] - Coordonnées initiales.
 * @returns {L.Map|null} Instance de la mini carte.
 */
export function initMiniMap(containerId, callbackOnClick, initialCoords) {
  const container = document.getElementById(containerId);
  if (!container || typeof L === 'undefined') return null;
  const map = L.map(container, { zoomControl: true, attributionControl: false });
  const center = initialCoords ? [initialCoords.lat, initialCoords.lng] : [48.8566, 2.3522];
  map.setView(center, initialCoords ? 15 : 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  let marker = null;
  const placeMarker = (latlng) => {
    if (!marker) {
      marker = L.marker(latlng, { draggable: true }).addTo(map);
      marker.on('dragend', e => {
        callbackOnClick?.(e.target.getLatLng());
      });
    } else {
      marker.setLatLng(latlng);
    }
    callbackOnClick?.(latlng);
  };
  map.on('click', e => placeMarker(e.latlng));

  setTimeout(() => { container.focus(); }, 200);

  return map;
}

function createIcon(type, ad) {
  if (type === 'ad') {
    const categories = State.getCategories ? State.getCategories() : [];
    const cat = categories.find(c => c.id === ad.category);
    const color = cat?.color || 'var(--primary-color)';
    const iconClass = cat?.icon || 'fa-solid fa-tag';
    return L.divIcon({
      html: `<div class="map-marker-custom" style="--marker-color:${color}"><i class="${iconClass}"></i></div>`,
      className: 'custom-leaflet-div-icon',
      iconSize: [30, 42],
      iconAnchor: [15, 42],
      popupAnchor: [0, -42]
    });
  }
  return L.divIcon({ html: '<i class="fa-solid fa-map-pin"></i>', className: 'custom-leaflet-div-icon', iconSize: [30, 42], iconAnchor: [15, 42] });
}

function debounceMapInvalidateSize() {
  if (!mapInstance) return;
  mapInstance.invalidateSize();
}

/**
 * Retourne l'instance de la carte principale.
 * @returns {L.Map|null} La carte Leaflet ou null si non initialisée.
 */
export function getMapInstance() {
  return mapInstance;
}

/**
 * Efface tous les marqueurs d'annonces actuellement affichés.
 */
export function clearAdsOnMap() {
  if (adMarkersLayer) adMarkersLayer.clearLayers();
  adMarkerMap.clear();
}

// Alias pour compatibilité avec l'ancien appel MapCtrl.init()
export const init = initMap;
