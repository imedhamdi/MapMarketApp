

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');

// --- Imports des modules de sécurité ---
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
// MapMarketApp-1 (Copie)/server.js
const { logger } = require('./config/winston');
const connectDB = require('./config/db');
const corsOptions = require('./config/corsOptions');
const rateLimit = require('./config/rateLimit');
const socketHandler = require('./socketHandler');
const errorHandler = require('./middlewares/errorHandler');
const sanitizationMiddleware = require('./middlewares/sanitizationMiddleware');

// --- Imports des routeurs de l'API ---
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adRoutes = require('./routes/adRoutes');
const messageRoutes = require('./routes/messageRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const alertRoutes = require('./routes/alertRoutes');
const threadRoutes = require('./routes/threadRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const settingRoutes = require('./routes/settingRoutes');

dotenv.config();

const app = express();
const server = http.createServer(app); // CRUCIAL: Créer un serveur HTTP unifié
// Initialiser Socket.IO sur le serveur unifié avec les options CORS
const io = new Server(server, {
  cors: corsOptions
});



// Connexion à la base de données
connectDB();

// Middlewares
app.use(cors(corsOptions)); // Appliquer CORS aux requêtes HTTP
app.use(express.json());
app.use(cookieParser());
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
          "http://localhost:5000",
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
          "http://localhost:5000",
          "ws://localhost:5000",
          "wss://localhost:5000",
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

app.use(xss());
app.use(sanitizationMiddleware);
app.use(mongoSanitize());
app.use(hpp());
app.use(rateLimit.generalRateLimiter);
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}
app.use(express.static(path.join(__dirname, 'public')));

// ================= ROUTES DE L'API =================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingRoutes);

// Initialiser le gestionnaire de sockets
socketHandler(io);

// Gestionnaire d'erreurs
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Démarrer le serveur unifié
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  logger.info(`Server running on port ${PORT}`);
});
