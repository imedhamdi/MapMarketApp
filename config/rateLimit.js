// config/rateLimit.js
const rateLimit = require('express-rate-limit');

const generalRateLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60 * 1000, // Fenêtre en millisecondes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100, // Limite chaque IP à X requêtes par windowMs
  standardHeaders: true, // Retourne les informations de limite dans les en-têtes `RateLimit-*`
  legacyHeaders: false, // Désactive les en-têtes `X-RateLimit-*` (plus anciens)
  message: {
    status: 'fail',
    message: 'Trop de requêtes envoyées depuis cette IP, veuillez réessayer après un certain temps.'
  },
  // Optionnel: skipSuccessfulRequests: true, // Ne compte que les requêtes échouées (ex: 4xx, 5xx)
});

const authRateLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10) || 10, // Plus strict pour l'authentification
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    message: 'Trop de tentatives d\'authentification depuis cette IP, veuillez réessayer plus tard.'
  },
});

// Vous pouvez créer d'autres limiteurs spécifiques ici (ex: pour l'envoi de messages)

module.exports = {
  generalRateLimiter,
  authRateLimiter,
};
