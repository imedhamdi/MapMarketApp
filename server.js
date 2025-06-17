// server.js

// --- IMPORTS ---
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan'); // Corrigé
const path = require('path');
const mongoSanitize = require('express-mongo-sanitize');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

// --- IMPORTS LOCAUX ---
// Configuration
const connectDB = require('./config/db'); //
const { morganStream, logger } = require('./config/winston'); //
const { generalRateLimiter } = require('./config/rateLimit'); //

// Middlewares
const globalErrorHandler = require('./middlewares/errorHandler'); //
const sanitizationMiddleware = require('./middlewares/sanitizationMiddleware'); //

// Modèles
const User = require('./models/userModel'); //

// Routes
const authRoutes = require('./routes/authRoutes'); //
const userRoutes = require('./routes/userRoutes'); //
const adRoutes = require('./routes/adRoutes'); //
const messageRoutes = require('./routes/messageRoutes'); //
const threadRoutes = require('./routes/threadRoutes'); //
const alertRoutes = require('./routes/alertRoutes'); //
const favoriteRoutes = require('./routes/favoriteRoutes'); //
const notificationRoutes = require('./routes/notificationRoutes'); //
const settingRoutes = require('./routes/settingRoutes'); //

// --- INITIALISATION DE L'APPLICATION ---
const app = express();
const server = http.createServer(app); // Création explicite du serveur HTTP pour Socket.IO

// --- CONFIGURATION DE SÉCURITÉ (HELMET & CORS) ---
app.set('trust proxy', 1);
// Helmet CSP EN PREMIER !
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false, // Désactive les valeurs par défaut pour un contrôle total
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "http://localhost:5001",
          "https://unpkg.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://cdn.lordicon.com",
          "https://cdn.socket.io"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com", // Ajouté pour Google Fonts
          "https://unpkg.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://placehold.co",
          "https://cdn.lordicon.com",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com",
          "https://*.tile.openstreetmap.org", // Ajouté pour les tuiles OSM
          "https://a.tile.openstreetmap.org",
          "https://b.tile.openstreetmap.org",
          "https://c.tile.openstreetmap.org"
        ],
        fontSrc: [
          "'self'",
          "data:",
          "https://fonts.gstatic.com", // Ajouté pour Google Fonts
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net"
        ],
        connectSrc: [
          "'self'",
          "http://localhost:5001",
          "ws://localhost:5001",
          "wss://localhost:5001",
          "https://*.tile.openstreetmap.org",
          "https://unpkg.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://cdn.socket.io",
          "https://nominatim.openstreetmap.org" 
        ],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Ajout des directives pour les nouvelles fonctionnalités CSP
        scriptSrcElem: [
          "'self'",
          "https://unpkg.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://cdn.lordicon.com",
          "https://cdn.socket.io"
        ],
        styleSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://unpkg.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com"
        ]
      }
    }
  })
);

const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// --- MIDDLEWARES ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizationMiddleware);
app.use(mongoSanitize());

// --- GESTION DES FICHIERS STATIQUES ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- LOGGING HTTP ---
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev', { stream: morganStream }));
} else {
  app.use(morgan('combined', { stream: morganStream }));
}

// --- RATE LIMITING ---
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', generalRateLimiter);
}

// --- CONNEXION À LA BASE DE DONNÉES ---
connectDB();

// --- ROUTES API ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingRoutes);

// --- GESTION DE LA SINGLE PAGE APP (SPA) & 404 ---
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/uploads')) {
    return next();
  }
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

app.use(globalErrorHandler);

// =================================================================
// --- CONFIGURATION DE SOCKET.IO ---
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

// Middleware d'authentification pour Socket.IO
io.use(async (socket, next) => {
  try {
    const { userId, token } = socket.handshake.query;
    if (!userId) {
      return next(new Error('Authentication error'));
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.id !== userId) {
        return next(new Error('Authentication error'));
      }
      const currentUser = await User.findById(userId).select('-password');
      if (!currentUser) {
        return next(new Error('Authentication error'));
      }
      socket.user = currentUser;
    } else {
      socket.user = { id: userId };
    }
    next();
  } catch (error) {
    console.error('Socket Authentication Error:', error.message);
    next(new Error('Authentication error'));
  }
});

require('./socketHandler')(io);

// --- DÉMARRAGE DU SERVEUR ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`🚀  Serveur démarré en mode ${process.env.NODE_ENV} sur le port ${PORT}`);
});

// --- GESTION DES ERREURS GLOBALES NON INTERCEPTÉES ---
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! 💥 Arrêt du serveur...');
  logger.error(`${err.name}: ${err.message}\n${err.stack}`);
  server.close(() => process.exit(1));
});
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Arrêt du serveur...');
  logger.error(`${err.name}: ${err.message}\n${err.stack}`);
  server.close(() => process.exit(1));
});

module.exports = { app, server, io };