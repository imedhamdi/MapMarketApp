require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const mongoSanitize = require('express-mongo-sanitize');
const sanitizationMiddleware = require('./middlewares/sanitizationMiddleware'); // NOUVEL IMPORT
const jwt = require('jsonwebtoken');
const User = require('./models/userModel');
const Message = require('./models/messageModel');
const Thread = require('./models/threadModel');
const SOCKET_NAMESPACE = '/chat';


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
const adminRoutes = require('./routes/adminRoutes');
const messageCtrl = require('./controllers/messageController');

const app = express();
// Render.com est un proxy de confiance.
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
// Statics : public et uploads
app.use(express.static(path.join(__dirname, 'public')));
// CETTE LIGNE UNIQUE GÈRE TOUS LES UPLOADS CORRECTEMENT
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/avatars', express.static(path.join(__dirname, 'uploads/avatars')));
app.use('/ads', express.static(path.join(__dirname, 'uploads/ads')));
app.use('/messages', express.static(path.join(__dirname, 'uploads/messages')));

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
app.use(sanitizationMiddleware); // Remplace xss()
app.use(mongoSanitize());


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
app.use('/api/admin', adminRoutes);

// Favicon (évite une erreur inutile dans les logs)
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});
// Catch-all SPA (doit être après toutes les routes API et fichiers statiques)
app.get('*', (req, res, next) => {
  // Simplification de la condition
  if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/uploads')) {
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
const { Server } = require('socket.io');
const io = new Server(server, { cors: corsOptions });
let connectedUsers = {};

io.use(async (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
        logger.warn(`Socket.IO: Tentative de connexion sans token pour ${socket.id}.`);
        return next(new Error('Authentication error: Token manquant.'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await User.findById(decoded.id).select('+isActive');
        if (!currentUser) {
            return next(new Error('Authentication error: L\'utilisateur n\'existe plus.'));
        }
        if (currentUser.changedPasswordAfter(decoded.iat)) {
            return next(new Error('Authentication error: Mot de passe récemment changé.'));
        }
        if (!currentUser.isActive) {
            return next(new Error('Authentication error: Compte désactivé.'));
        }
        socket.user = currentUser;
        connectedUsers[currentUser.id] = socket.id;
        next();
    } catch (err) {
        logger.warn(`Socket.IO: Échec de l'authentification du token pour ${socket.id}: ${err.message}`);
        return next(new Error('Authentication error: Token invalide ou expiré.'));
    }
});

io.on('connection', (socket) => {
    logger.info(`Socket.IO: Connexion root établie: ${socket.id}, UserID: ${socket.user.id}`);
    socket.on('joinThread', (threadId) => {
        if (threadId) socket.join(threadId);
    });

    socket.on('leaveThread', (threadId) => {
        if (threadId) socket.leave(threadId);
    });

    socket.on('sendMessage', async ({ threadId, content }) => {
        if (!threadId || !content) return;
        const message = await Message.create({
            threadId,
            senderId: socket.user.id,
            text: content,
            type: 'text',
        });

        await Thread.findByIdAndUpdate(threadId, {
            lastMessage: { text: content, sender: socket.user.id, createdAt: message.createdAt },
            updatedAt: message.createdAt,
            $inc: { 'participants.$[elem].unreadCount': 1 },
            $set: { 'participants.$[me].unreadCount': 0 }
        }, { arrayFilters: [{ 'elem.user': { $ne: socket.user.id } }, { 'me.user': socket.user.id }] });

        const populated = await message.populate('senderId', 'name avatarUrl');
        io.to(threadId).emit('newMessage', populated);

        const thread = await Thread.findById(threadId);
        for (const p of thread.participants) {
            const id = p.user.toString();
            if (connectedUsers[id] && !io.sockets.sockets.get(connectedUsers[id]).rooms.has(threadId)) {
                const count = await Thread.countDocuments({ 'participants.user': id, 'participants.unreadCount': { $gt: 0 } });
                io.to(connectedUsers[id]).emit('unreadCountUpdated', count);
            }
        }
    });

    socket.on('markThreadAsRead', async (threadId) => {
        const thread = await Thread.findById(threadId);
        if (!thread) return;
        const participant = thread.participants.find(p => p.user.toString() === socket.user.id);
        if (participant && participant.unreadCount > 0) {
            participant.unreadCount = 0;
            await thread.save({ validateBeforeSave: false });
        }
        await Message.updateMany({ threadId, senderId: { $ne: socket.user.id }, status: { $ne: 'read' } }, { status: 'read' });
        const totalUnread = await Thread.countDocuments({ 'participants.user': socket.user.id, 'participants.unreadCount': { $gt: 0 } });
        io.to(socket.id).emit('unreadCountUpdated', totalUnread);
    });

    socket.on('disconnect', () => {
        delete connectedUsers[socket.user.id];
        logger.info(`Socket.IO: Déconnexion root: ${socket.id}`);
    });
});

// Utiliser un middleware d'authentification pour le namespace /chat
io.of(SOCKET_NAMESPACE).use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        logger.warn(`Socket.IO: Tentative de connexion sans token pour ${socket.id}.`);
        return next(new Error('Authentication error: Token manquant.'));
    }
    try {
        // 1. Vérification du token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 2. Vérifier si l'utilisateur existe toujours
        const currentUser = await User.findById(decoded.id).select('+isActive');
        if (!currentUser) {
            return next(new Error('Authentication error: L\'utilisateur n\'existe plus.'));
        }

        // 3. Vérifier si le mot de passe a changé après l'émission du token
        if (currentUser.changedPasswordAfter(decoded.iat)) {
            return next(new Error('Authentication error: Mot de passe récemment changé.'));
        }

        // 4. Vérifier si le compte est actif
        if (!currentUser.isActive) {
            return next(new Error('Authentication error: Compte désactivé.'));
        }

        // Si tout est bon, on attache l'utilisateur au socket pour un usage ultérieur
        socket.user = currentUser;
        next();

    } catch (err) {
        logger.warn(`Socket.IO: Échec de l'authentification du token pour ${socket.id}: ${err.message}`);
        return next(new Error('Authentication error: Token invalide ou expiré.'));
    }
});


io.of(SOCKET_NAMESPACE).on('connection', (socket) => {
    // À ce stade, le socket est déjà authentifié grâce au middleware .use() ci-dessus.
    // L'objet `socket.user` est disponible.
    logger.info(`Socket.IO: Utilisateur authentifié connecté au namespace /chat: ${socket.id}, UserID: ${socket.user.id}`);
    
    socket.join(`user_${socket.user.id}`);
    logger.info(`Socket.IO: Socket ${socket.id} a rejoint la room user_${socket.user.id}`);
    User.findByIdAndUpdate(socket.user.id, { isOnline: true }, { new: false }).exec();
    io.of(SOCKET_NAMESPACE).to(`user_${socket.user.id}`).emit('userStatusUpdate', { userId: socket.user.id, statusText: 'en ligne' });

    // Gérer les autres événements Socket.IO
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

    socket.on('typing', ({ threadId, isTyping }) => {
        if (threadId) {
            const room = `thread_${threadId}`;
            socket.to(room).emit('typing', { threadId, userName: socket.user.name, isTyping });
        }
    });

    socket.on('disconnect', async (reason) => {
        logger.info(`Socket.IO: Utilisateur déconnecté du namespace /chat: ${socket.id}. Raison: ${reason}`);
        await User.findByIdAndUpdate(socket.user.id, { isOnline: false, lastSeen: new Date() });
        io.of(SOCKET_NAMESPACE).to(`user_${socket.user.id}`).emit('userStatusUpdate', { userId: socket.user.id, statusText: '' });
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

module.exports = { io, connectedUsers };
