/**
 * @description Base de données locale des pays avec leur code, devise et boîte englobante.
 * La boîte englobante (bbox) est un tableau [minLongitude, minLatitude, maxLongitude, maxLatitude].
 * C'est une approximation qui couvre la majorité du territoire d'un pays.
 * Vous pouvez enrichir ce tableau avec autant de pays que nécessaire.
 */
const countriesData = [
  {
    countryCode: 'TN',
    currency: 'TND', // Dinar Tunisien
    bbox: [7.5, 30.2, 11.6, 37.6]
  },
  {
    countryCode: 'FR',
    currency: 'EUR', // Euro
    bbox: [-5.15, 41.3, 9.6, 51.2] // France métropolitaine
  },
  {
    countryCode: 'MA',
    currency: 'MAD', // Dirham Marocain
    bbox: [-17.2, 21.0, -1.0, 35.9]
  },
  {
    countryCode: 'DZ',
    currency: 'DZD', // Dinar Algérien
    bbox: [-8.67, 18.96, 11.99, 37.09]
  },
  {
    countryCode: 'CH',
    currency: 'CHF', // Franc Suisse
    bbox: [5.96, 45.82, 10.49, 47.81]
  },
  // Ajoutez d'autres pays ici...
];

/**
 * @description Trouve la devise correspondant à des coordonnées géographiques.
 * Itère sur notre base de données locale et vérifie si les coordonnées
 * se trouvent dans la boîte englobante d'un des pays.
 * @param {number} lat Latitude
 * @param {number} lon Longitude
 * @returns {string|null} Le code de la devise (ex: 'TND') ou null si aucun pays n'est trouvé.
 */
function findCurrencyByCoords(lat, lon) {
  for (const country of countriesData) {
    const [minLon, minLat, maxLon, maxLat] = country.bbox;
    if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
      return country.currency;
    }
  }
  return null; // Aucune devise trouvée pour ces coordonnées
}

// Exporte la fonction pour qu'elle soit utilisable dans les contrôleurs
module.exports = { findCurrencyByCoords };
