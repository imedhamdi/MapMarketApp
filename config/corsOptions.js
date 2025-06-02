// config/corsOptions.js

// Lire les origines autorisées depuis les variables d'environnement
const allowedOriginsEnv = process.env.CORS_ORIGIN || `http://localhost:5500,http://127.0.0.1:5500`;
const allowedOrigins = allowedOriginsEnv.split(',').map(origin => origin.trim());

if (process.env.NODE_ENV !== 'production' && !allowedOrigins.includes(`http://localhost:${process.env.FRONTEND_PORT || 5500}`)) {
    // Ajouter le port de développement frontend typique si absent en mode dev
    // Ceci est un exemple, ajustez selon votre configuration de port frontend en dev.
    // Le port 5500 est souvent celui de Live Server.
}

const corsOptions = {
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origine (comme Postman, mobile apps, curl) en développement,
    // ou si l'origine est dans la liste blanche.
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Accès non autorisé par la politique CORS. Origine: ' + origin));
    }
  },
  credentials: true, // Important si vous gérez des cookies/sessions (pas le cas pour JWT dans les headers)
  optionsSuccessStatus: 200, // Pour certains navigateurs plus anciens
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};

module.exports = corsOptions;
