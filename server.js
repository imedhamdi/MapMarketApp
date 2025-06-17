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
const Message = require('./models/messageModel'); //
const Thread = require('./models/threadModel'); //

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

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.socket.io", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://cdn.lordicon.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://res.cloudinary.com"], // Adaptez pour Cloudinary si vous l'utilisez
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", `ws://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`, `wss://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`, "https://nominatim.openstreetmap.org", "https://cdn.socket.io"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      },
    },
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
// =================================================================
const SOCKET_NAMESPACE = '/chat';

const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

// Middleware d'authentification pour le namespace /chat
io.of(SOCKET_NAMESPACE).use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            logger.warn(`Socket.IO Auth: Connexion refusée (token manquant) pour socket ${socket.id}`);
            return next(new Error('Authentication error: Token manquant.'));
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await User.findById(decoded.id).select('+isActive');

        if (!currentUser || !currentUser.isActive) {
            return next(new Error('Authentication error: Utilisateur invalide ou inactif.'));
        }
        if (currentUser.changedPasswordAfter(decoded.iat)) {
            return next(new Error('Authentication error: Mot de passe récemment changé.'));
        }

        socket.user = currentUser;
        next();

    } catch (err) {
        logger.error(`Socket.IO Auth Error: ${err.message}`);
        next(new Error('Authentication error: Token invalide ou expiré.'));
    }
});

// Gestion des connexions sur le namespace /chat
io.of(SOCKET_NAMESPACE).on('connection', (socket) => {
    logger.info(`✅  Socket.IO: Utilisateur connecté: ${socket.user.username} (${socket.id})`);

    socket.join(`user_${socket.user.id}`);
    User.findByIdAndUpdate(socket.user.id, { isOnline: true }, { new: true }).exec();
    
    socket.on('joinThread', ({ threadId }) => {
        socket.join(`thread_${threadId}`);
        logger.info(`Socket ${socket.id} a rejoint la room thread_${threadId}`);
    });
    socket.on('leaveThread', ({ threadId }) => {
        socket.leave(`thread_${threadId}`);
        logger.info(`Socket ${socket.id} a quitté la room thread_${threadId}`);
    });

    socket.on('sendMessage', async (data, callback) => {
        const { threadId, content } = data;
        
        try {
            if (!content || !threadId) throw new Error("Contenu ou threadId manquant.");

            const thread = await Thread.findById(threadId);
            // Vérification de la participation de l'utilisateur (méthode robuste) - Corrigé
            if (!thread || !thread.participants.some(p => p.equals(socket.user.id))) {
                 throw new Error("Accès au thread non autorisé.");
            }
            
            const message = await Message.create({
                thread: threadId,
                sender: socket.user.id,
                content,
            });

            // Mise à jour du thread, incluant messageCount - Corrigé
            await Thread.findByIdAndUpdate(threadId, {
                lastMessage: message._id,
                updatedAt: Date.now(),
                $inc: { messageCount: 1 } // Ajout de l'incrémentation
            });

            const populatedMessage = await message.populate({
                path: 'sender',
                select: 'username profilePicture'
            });

            io.of(SOCKET_NAMESPACE).to(`thread_${threadId}`).emit('newMessage', populatedMessage);
            if (callback) callback({ status: 'ok', message: populatedMessage });

        } catch (error) {
            logger.error(`Socket sendMessage Error: ${error.message} pour user ${socket.user.id}`);
            if (callback) callback({ status: 'error', message: error.message });
        }
    });

    socket.on('typing', ({ threadId, isTyping }) => {
        socket.to(`thread_${threadId}`).emit('userTyping', { 
            threadId, 
            userId: socket.user.id,
            username: socket.user.username,
            isTyping 
        });
    });

    socket.on('disconnect', () => {
        logger.info(`❌  Socket.IO: Utilisateur déconnecté: ${socket.user.username} (${socket.id})`);
        User.findByIdAndUpdate(socket.user.id, { isOnline: false, lastSeen: new Date() }).exec();
    });
});


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