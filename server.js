// /server.js
import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// Middlewares
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
// import xssClean from 'xss-clean'; // Évalué comme potentiellement problématique, désactivé pour l'instant
import hpp from 'hpp';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

// Utilitaires et configuration
import connectDB from './config/db.js';
import { logger, morganMiddleware } from './config/logger.js';
import globalErrorHandler from './middlewares/errorHandler.js';
import AppError from './utils/appError.js';
import initializeSocketIO from './socket/socketManager.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import favoriteRoutes from './routes/favoriteRoutes.js';
import messageRoutes from './routes/messageRoutes.js';

// Configuration pour __dirname avec ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger les variables d'environnement
dotenv.config(); // Assurez-vous d'avoir un fichier .env à la racine

// Connexion à MongoDB
connectDB();

const app = express();
const httpServer = http.createServer(app);

// Configuration CORS pour Express
const corsOptions = {
  origin: process.env.CORS_ORIGIN || process.env.CLIENT_URL || 'http://localhost:8000',
  credentials: true,
};
app.use(cors(corsOptions));

// Middlewares de sécurité globaux
// Il est généralement recommandé de configurer Helmet avec des options spécifiques
// pour mieux contrôler les en-têtes, par exemple pour Content-Security-Policy.
// Pour l'instant, la configuration par défaut est utilisée.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "https://unpkg.com", "https://cdn.socket.io", "https://cdn.tailwindcss.com"], // Autoriser les scripts des CDN
      "style-src": ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"], // Autoriser les styles inline et des CDN
      "img-src": ["'self'", "data:", "https://placehold.co", "https://*.tile.openstreetmap.org", "https://*.basemaps.cartocdn.com", "https://ui-avatars.com"], // Autoriser les images de ces sources
      "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"], // Autoriser les polices de ces sources
      "connect-src": ["'self'", process.env.CORS_ORIGIN || "http://localhost:8000", "ws://localhost:3000", "wss://localhost:3000", "https://*.tile.openstreetmap.org", "https://*.basemaps.cartocdn.com"], // Autoriser les connexions WebSocket et API
    },
  }
}));
app.use(express.json({ limit: '20kb' })); // Parser JSON, limite la taille
app.use(express.urlencoded({ extended: true, limit: '20kb' })); // Parser URL-encoded
app.use(cookieParser()); // Parser les cookies

// Sanitize data (contre NoSQL query injection et XSS basique)
app.use(mongoSanitize()); // Contre NoSQL query injection
// app.use(xssClean()); // Contre XSS - à utiliser avec prudence, peut interférer

// Prévenir la pollution des paramètres HTTP
app.use(hpp({
  whitelist: [
    'priceMin', 'priceMax', 'category', 'etat', 'distance', 'sort', 'fields', 'page', 'limit'
    // Ajoutez d'autres paramètres que vous souhaitez autoriser en doublon
  ]
}));

// Compression des réponses
app.use(compression());

// Logging HTTP
if (process.env.NODE_ENV === 'development') {
  app.use(morganMiddleware);
}

// Rate Limiting pour les routes API
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit dépassé pour IP ${req.ip}: ${options.message}`);
    res.status(options.statusCode).json({ status: 'error', message: options.message });
  }
});
// Appliquer le rate limiting spécifiquement aux routes API
app.use('/api', apiLimiter);


// Servir les fichiers statiques pour les images uploadées
const uploadsDir = process.env.UPLOADS_FOLDER || 'uploads';
app.use(`/${uploadsDir}`, express.static(path.join(__dirname, uploadsDir)));
logger.info(`Service des fichiers statiques depuis le dossier: ${path.join(__dirname, uploadsDir)} sur la route /${uploadsDir}`);

// Servir les fichiers statiques du dossier 'public' (pour le frontend index.html, etc.)
app.use(express.static(path.join(__dirname, 'public')));
logger.info(`Service des fichiers statiques du frontend depuis le dossier: ${path.join(__dirname, 'public')}`);


// Initialisation de Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN || process.env.CLIENT_URL || "http://localhost:8000",
    methods: ["GET", "POST"],
    credentials: true
  }
});
initializeSocketIO(io); // Passer l'instance io au gestionnaire de sockets

// Middleware pour rendre 'io' accessible dans les requêtes (pour les contrôleurs)
app.use((req, res, next) => {
  req.io = io;
  next();
});


// --- Routes de l'API ---
app.get('/api', (req, res) => { // Route de test pour l'API
  res.json({ message: 'API MapMarket en fonctionnement !' });
});
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/messages', messageRoutes);

// --- Route Catch-all pour servir l'application SPA (frontend) ---
// Cette route doit être APRES toutes les routes API
// Elle renvoie index.html pour toute requête non API, permettant au routage côté client de fonctionner
app.get('*', (req, res, next) => {
  // Vérifier si la requête n'est pas pour une route API pour éviter les conflits
  if (req.originalUrl.startsWith('/api')) {
    return next(); // Passer au gestionnaire 404 pour les routes API non trouvées
  }
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});


// Gestion des routes API non trouvées (404)
// Ce middleware ne sera atteint que si la requête commence par /api et ne correspond à aucune route API définie
app.all('/api/*', (req, res, next) => {
  next(new AppError(`Impossible de trouver la ressource API ${req.originalUrl} sur ce serveur !`, 404));
});

// Gestionnaire d'erreurs global
app.use(globalErrorHandler);

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
const serverInstance = httpServer.listen(PORT, () => {
  logger.info(`Serveur démarré en mode ${process.env.NODE_ENV || 'development'} sur le port ${PORT}`);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (err) => {
  logger.error('ERREUR NON CAPTURÉE (UNHANDLED REJECTION) ! 💥 Arrêt du serveur...');
  logger.error(`${err.name}: ${err.message}`);
  logger.error(err.stack);
  serverInstance.close(() => {
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  logger.error('EXCEPTION NON CAPTURÉE (UNCAUGHT EXCEPTION) ! 💥 Arrêt du serveur...');
  logger.error(`${err.name}: ${err.message}`);
  logger.error(err.stack);
  serverInstance.close(() => {
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  logger.info('👋 Signal SIGTERM reçu. Fermeture propre du serveur...');
  serverInstance.close(() => {
    logger.info('💥 Processus terminé.');
  });
});
