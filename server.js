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
// --- SOCKET.IO SETUP ---
// Create the HTTP server for Socket.IO to hook into
const server = http.createServer(app);
const { Server } = require('socket.io');
// Allow connections from the front-end origin
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3001"
  }
});

// ADDED: store connected users for real-time messaging
const connectedUsers = new Map();

// Expose the Socket.IO instance so controllers can emit events
app.set('socketio', io);

// ADDED: expose io and connectedUsers on each request
app.use((req, res, next) => {
  req.io = io;
  req.connectedUsers = connectedUsers;
  next();
});

const onlineUsers = new Map();

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error: Token not provided.'));
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) {
            return next(new Error('Authentication error: User not found.'));
        }
        socket.request.user = user;
        next();
    } catch (err) {
        next(new Error('Authentication error: Invalid token.'));
    }
});


io.on('connection', (socket) => {
    // Log connection of a new socket
    console.log('A user connected with socket id:', socket.id);

    // ADDED: register userId to socket map
    socket.on('register', (userId) => {
        if (userId) {
            connectedUsers.set(userId, socket.id);
            console.log(`User ${userId} registered with socket ${socket.id}`);
        }
    });

    // Allow the client to join a room identified by its user ID
    socket.on('join-room', (userId) => {
        socket.join(userId);
        console.log(`User with ID ${userId} joined their room.`);
    });

    socket.on('goOnline', ({ userId }) => {
        const uid = userId || socket.request.user.id;
        onlineUsers.set(uid, socket.id);
        socket.join(uid);
        socket.emit('onlineUsers', Array.from(onlineUsers.keys()));
        socket.broadcast.emit('userStatusUpdate', { userId: uid, isOnline: true });
    });

    socket.on('startTyping', ({ threadId }) => {
        socket.to(threadId).emit('userTyping', { isTyping: true });
    });

    // ADDED: simple typing relay using connected user registry
    socket.on('typing', ({ recipientId }) => {
        if (!recipientId) return;
        const recipientSocketId = connectedUsers.get(recipientId);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('userIsTyping', { senderId: socket.request.user.id });
        }
    });

    socket.on('stopTyping', ({ threadId }) => {
        socket.to(threadId).emit('userTyping', { isTyping: false });
    });

    socket.on('joinThread', (threadId) => {
        if (threadId) {
            socket.join(threadId);
            // console.log(`User ${socket.id} joined thread ${threadId}`);
        }
    });

    socket.on('sendMessage', async (data) => {
        const { threadId, text, content } = data;
        const messageText = text || content;

        if (!threadId || !messageText || messageText.trim() === '') {
            return socket.emit('messageError', { message: 'Contenu du message ou ID de conversation manquant.' });
        }

        try {
            const userId = socket.request.user.id;
            const thread = await Thread.findById(threadId);
            const isParticipant = thread && thread.participants.some(p => p.user.toString() === userId);
            if (!thread || !isParticipant) {
                return console.error('Unauthorized message attempt.');
            }

            let newMessage = new Message({
                threadId,
                senderId: userId,
                text: messageText.trim()
            });
            await newMessage.save();

            thread.lastMessage = {
                text: newMessage.text,
                sender: newMessage.senderId,
                createdAt: newMessage.createdAt
            };
            await thread.save();

            newMessage = await newMessage.populate({
                path: 'senderId',
                select: 'name avatarUrl'
            });

            const populatedThread = await Thread.findById(threadId)
                .populate('participants.user', 'name avatarUrl isOnline lastSeen');

            io.to(threadId).emit('newMessage', {
                message: newMessage.toObject(),
                thread: populatedThread.toObject()
            });

        } catch (error) {
            console.error('Socket sendMessage error:', error);
            socket.emit('messageError', { message: 'Erreur serveur lors de l\'envoi du message.' });
        }
    });

    // ADDED: mark messages in a thread as read
    socket.on('markAsRead', async ({ threadId }) => {
        if (!threadId) return;
        try {
            await Message.updateMany(
                { threadId, senderId: { $ne: socket.request.user.id }, isRead: false },
                { $set: { isRead: true } }
            );
            const thread = await Thread.findById(threadId);
            if (thread) {
                const other = thread.participants.find(p => p.user.toString() !== socket.request.user.id);
                if (other) {
                    const recipientSocketId = connectedUsers.get(other.user.toString());
                    if (recipientSocketId) {
                        io.to(recipientSocketId).emit('messagesRead', { threadId });
                    }
                }
            }
        } catch (err) {
            console.error('markAsRead error:', err);
        }
    });

    socket.on('disconnect', () => {
        const entry = [...onlineUsers.entries()].find(([uid, sid]) => sid === socket.id);
        if (entry) {
            onlineUsers.delete(entry[0]);
            socket.broadcast.emit('userStatusUpdate', { userId: entry[0], isOnline: false });
        }
        // ADDED: remove from connected users registry
        for (const [uid, sid] of connectedUsers.entries()) {
            if (sid === socket.id) {
                connectedUsers.delete(uid);
                break;
            }
        }
        console.log(`User disconnected: ${socket.request.user?.name} (${socket.id})`);
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
