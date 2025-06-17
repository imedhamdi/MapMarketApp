// Fichier: config/rateLimit.js

const rateLimit = require('express-rate-limit');

/**
 * Logique pour déterminer le nombre maximum de requêtes.
 * En mode 'development', nous utilisons une valeur par défaut très élevée pour ne pas gêner les tests.
 * En production, nous nous fions à la variable d'environnement ou à une valeur par défaut plus basse.
 * @param {number} devMax - Le nombre de requêtes autorisées en développement.
 * @param {number} prodMax - Le nombre de requêtes autorisées en production si la variable d'env n'est pas définie.
 * @param {string | undefined} envVar - La variable d'environnement à lire.
 * @returns {number}
 */
const getMaxRequests = (devMax, prodMax, envVar) => {
  if (process.env.NODE_ENV === 'development') {
    return devMax;
  }
  return parseInt(envVar, 10) || prodMax;
};

// --- Limiteur pour les Routes Générales de l'API ---
// Idéal pour les routes de consultation de données (annonces, messages, etc.)
const generalRateLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60 * 1000, // Fenêtre de 15 minutes par défaut
  
  // Logique améliorée pour le max de requêtes
  max: getMaxRequests(2000, 200, process.env.RATE_LIMIT_MAX_REQUESTS),

  standardHeaders: true, // Retourne les informations de limite dans les en-têtes `RateLimit-*`
  legacyHeaders: false, // Désactive les en-têtes `X-RateLimit-*`
  message: {
    status: 'fail',
    message: 'Trop de requêtes envoyées depuis cette IP, veuillez réessayer après un certain temps.'
  },
});


// --- Limiteur Strict pour l'Authentification ---
// Essentiel pour prévenir les attaques par force brute sur les formulaires de connexion/inscription.
const authRateLimiter = rateLimit({
  windowMs: (parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60 * 1000, // Fenêtre de 15 minutes par défaut

  // Logique améliorée pour le max de requêtes (plus strict)
  max: getMaxRequests(100, 20, process.env.AUTH_RATE_LIMIT_MAX_REQUESTS),

  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    message: 'Trop de tentatives d\'authentification depuis cette IP, veuillez réessayer plus tard.'
  },
});

// Affiche la configuration au démarrage pour un débogage facile
if (process.env.NODE_ENV === 'development') {
    console.log('--- Configuration du Limiteur de Débit (Développement) ---');
    console.log(`Routes Générales: ${getMaxRequests(2000, 200, process.env.RATE_LIMIT_MAX_REQUESTS)} requêtes / 15 min`);
    console.log(`Routes d'Authentification: ${getMaxRequests(100, 20, process.env.AUTH_RATE_LIMIT_MAX_REQUESTS)} requêtes / 15 min`);
    console.log('----------------------------------------------------');
}


// Exporter les limiteurs pour les utiliser dans server.js ou les fichiers de routes.
module.exports = {
  generalRateLimiter,
  authRateLimiter,
};