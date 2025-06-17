// MapMarketApp-1 (Copie)/server.js

const express = require('express');
const http = require('http'); // IMPORTANT: Importer http
const { Server } = require('socket.io'); // IMPORTANT: Importer la classe Server
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');
const logger = require('./config/winston');
const errorHandler = require('./middlewares/errorHandler');
const rateLimit = require('./config/rateLimit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');

dotenv.config();

const app = express();
const server = http.createServer(app); // CRUCIAL: Créer un serveur HTTP unifié

// Importer la configuration CORS
const corsOptions = require('./config/corsOptions');

// Initialiser Socket.IO sur le serveur unifié avec les options CORS
const io = new Server(server, {
  cors: corsOptions
});

const connectDB = require('./config/db');
const socketHandler = require('./socketHandler');

// Connexion à la base de données
connectDB();

// Middlewares
app.use(cors(corsOptions)); // Appliquer CORS aux requêtes HTTP
app.use(express.json());
app.use(cookieParser());
app.use(helmet());
app.use(xss());
app.use(mongoSanitize());
app.use(hpp());
app.use(rateLimit.generalRateLimiter);
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}
app.use(express.static(path.join(__dirname, 'public')));

// Routes API
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/ads', require('./routes/adRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/threads', require('./routes/threadRoutes'));
// ... autres routes

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
