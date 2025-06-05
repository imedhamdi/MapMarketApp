import { getAds } from './ads.js';

export async function initMap() {
  const map = L.map('map-view').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const ads = await getAds();
  ads.forEach(ad => {
    if (ad.location && ad.location.geopoint) {
      const { latitude, longitude } = ad.location.geopoint;
      L.marker([latitude, longitude]).addTo(map).bindPopup(ad.title);
    }
  });
}
