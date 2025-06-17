// Fichier: config/corsOptions.js

/**
 * Configuration de la politique CORS (Cross-Origin Resource Sharing) pour l'application.
 * Ce fichier définit quelles "origines" (sites web externes) sont autorisées à faire des requêtes à notre API.
 * C'est une mesure de sécurité cruciale.
 */

// 1. Définir une liste blanche (whitelist) d'origines autorisées en développement.
//    C'est la source principale de vérité pour votre environnement local.
const developmentWhitelist = [
  'http://localhost:5001', // Front-end principal de MapMarket (cause de l'erreur)
  'http://127.0.0.1:5001', // Autre manière d'accéder à localhost
  'http://localhost:5500', // Port souvent utilisé par Live Server de VSCode
  'http://127.0.0.1:5500'
];

// 2. Lire les origines de production depuis les variables d'environnement.
//    Exemple: process.env.CORS_ORIGIN="https://www.mapmarket.com,https://admin.mapmarket.com"
const productionOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];

// 3. Combiner les listes en fonction de l'environnement.
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? productionOrigins 
  : [...developmentWhitelist, ...productionOrigins];

// Log pour débogage au démarrage du serveur (très utile !)
console.log('Origines CORS autorisées :', allowedOrigins);

const corsOptions = {
  /**
   * La fonction `origin` est le cœur de la logique.
   * Elle est appelée à chaque requête provenant d'une origine différente.
   * @param {string} origin - L'origine de la requête (ex: 'http://localhost:5001').
   * @param {function} callback - La fonction à appeler une fois la vérification terminée.
   */
  origin: (origin, callback) => {
    // La condition `!origin` autorise les requêtes qui n'ont pas d'origine.
    // C'est le cas des applications serveur-à-serveur ou des outils comme Postman.
    if (!origin || allowedOrigins.includes(origin)) {
      // Si l'origine est absente ou dans notre liste blanche, on l'autorise.
      // Le premier argument `null` signifie qu'il n'y a pas d'erreur.
      // Le second argument `true` signifie que la requête est autorisée.
      callback(null, true);
    } else {
      // Si l'origine n'est pas dans la liste, on la rejette avec une erreur.
      // Le navigateur bloquera alors la requête.
      callback(new Error(`Accès non autorisé par la politique CORS. L'origine '${origin}' n'est pas autorisée.`));
    }
  },

  // Permet au navigateur d'envoyer les informations d'authentification (comme les cookies ou les jetons JWT).
  credentials: true,

  // Spécifie les méthodes HTTP autorisées.
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  // Spécifie les en-têtes HTTP que le client peut utiliser dans sa requête.
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],

  // Code de statut à renvoyer pour les requêtes "pre-flight" (OPTIONS). 200 est plus compatible.
  optionsSuccessStatus: 200,
};

module.exports = corsOptions;