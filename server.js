const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const userRoutes = require('./routes/userRoutes');
const cors = require('cors');

// Configuration des variables d’environnement
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Connexion MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mapmarket', {
}).then(() => {
  console.log('✅ Connecté à MongoDB');
}).catch((err) => {
  console.error('❌ Erreur de connexion MongoDB:', err.message);
});

// Middlewares globaux
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 📁 Routes API
app.use('/api/users', userRoutes);

// 🔒 Middleware optionnel : protéger certaines routes
// app.use('/api/items', require('./routes/itemRoutes')); // exemple futur

// 📁 Dossier public pour le frontend
app.use(express.static(path.join(__dirname, 'public')));

// 🌐 Fallback pour les routes SPA (ex: /profil redirige vers index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🚀 Démarrer le serveur
app.listen(port, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${port}`);
});
