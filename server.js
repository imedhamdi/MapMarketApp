require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const path = require('path');

const connectDB = require('./config/db');
// const corsOptions = require('./config/corsOptions');
const { morganStream, logger } = require('./config/winston');
const globalErrorHandler = require('./middlewares/errorHandler');
const { generalRateLimiter } = require('./config/rateLimit');

// Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adRoutes = require('./routes/adRoutes');
const messageRoutes = require('./routes/messageRoutes');
const alertRoutes = require('./routes/alertRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const settingRoutes = require('./routes/settingRoutes');
const messageCtrl = require('./controllers/messageController');

const app = express();

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
          "https://cdn.socket.io"
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
// Statics : public et uploads
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middlewares de base
const corsOptions = {
  origin: [
    'http://localhost:5001',
    'https://votredomaine.com' // Ajoutez votre domaine de production ici
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Ajoutez ce middleware pour gérer les pré-vols OPTIONS
app.options('*', cors(corsOptions));;
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());
app.use(xss());

// Logging HTTP
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev', { stream: morganStream }));
} else {
  app.use(morgan('combined', { stream: morganStream }));
}

// Rate Limiter
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', generalRateLimiter);
}

// --- Connexion MongoDB ---
connectDB();

// --- Routes API ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingRoutes);

// Favicon (évite une erreur inutile dans les logs)
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});
app.use('/avatars', express.static(path.join(__dirname, 'uploads', 'avatars')));
// Catch-all SPA (doit être après toutes les routes API et fichiers statiques)


// Sert le dossier 'uploads' (qui contient 'avatars') sous la route '/uploads'
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('*', (req, res, next) => {
  if (
    req.originalUrl.startsWith('/api') ||
    req.originalUrl.startsWith('/uploads') ||
    req.originalUrl.startsWith('/favicon.ico') ||
    req.originalUrl.startsWith('/avatars') ||
    req.originalUrl.match(/\.(js|css|png|jpg|jpeg|svg|ico|json|webmanifest|webp|mp3|mp4)$/)
  ) {
    return next();
  }
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

// 404 pour les routes API (après le SPA catch-all)
app.all('/api/*', (req, res, next) => {
  const err = new Error(`Impossible de trouver ${req.originalUrl} sur ce serveur.`);
  err.status = 'fail';
  err.statusCode = 404;
  next(err);
});

// Gestion des erreurs
app.use(globalErrorHandler);

// --- SOCKET.IO ---
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: corsOptions });

io.of('/chat').on('connection', (socket) => {
  logger.info(`Socket.IO: Nouvel utilisateur connecté au namespace /chat: ${socket.id}`);
  const token = socket.handshake.auth.token;
  if (token) {
    try {
      logger.info(`Socket.IO: Utilisateur ${socket.id} a fourni un token.`);
    } catch (err) {
      logger.warn(`Socket.IO: Échec de l'authentification du token pour ${socket.id}: ${err.message}`);
      socket.disconnect(true);
      return;
    }
  } else {
    logger.warn(`Socket.IO: Connexion sans token pour ${socket.id}. Déconnexion.`);
    socket.disconnect(true);
    return;
  }
  socket.on('joinUserRoom', ({ userId }) => {
    if (userId) {
      socket.join(`user_${userId}`);
      logger.info(`Socket.IO: Socket ${socket.id} a rejoint la room user_${userId}`);
    }
  });
  socket.on('joinThreadRoom', ({ threadId }) => {
    if (threadId) {
      socket.join(`thread_${threadId}`);
      logger.info(`Socket.IO: Socket ${socket.id} a rejoint la room thread_${threadId}`);
    }
  });
  socket.on('leaveThreadRoom', ({ threadId }) => {
    if (threadId) {
      socket.leave(`thread_${threadId}`);
      logger.info(`Socket.IO: Socket ${socket.id} a quitté la room thread_${threadId}`);
    }
  });
  socket.on('disconnect', (reason) => {
    logger.info(`Socket.IO: Utilisateur déconnecté du namespace /chat: ${socket.id}. Raison: ${reason}`);
  });
});

messageCtrl.initializeSocketIO(io);

// --- Démarrage du serveur
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  logger.info(`Serveur démarré en mode ${process.env.NODE_ENV} sur le port ${PORT}`);
});

// --- Erreurs globales
process.on('unhandledRejection', (err) => {
  logger.error('ERREUR NON INTERCEPTÉE (Unhandled Rejection)! 💥 Arrêt du serveur...');
  logger.error(`${err.name}: ${err.message}\n${err.stack}`);
  server.close(() => process.exit(1));
});
process.on('uncaughtException', (err) => {
  logger.error('ERREUR NON INTERCEPTÉE (Uncaught Exception)! 💥 Arrêt du serveur...');
  logger.error(`${err.name}: ${err.message}\n${err.stack}`);
  server.close(() => process.exit(1));
});

module.exports = { io };
