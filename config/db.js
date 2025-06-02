// config/db.js
const mongoose = require('mongoose');
const { logger } = require('./winston'); // Assurez-vous que winston.js est au même niveau ou ajustez le chemin

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // Options Mongoose 6+ (plus besoin de la plupart des anciennes options comme useNewUrlParser)
            // autoIndex: true, // Mettre à false en production pour de meilleures performances si les index sont gérés manuellement
        });
        logger.info(`MongoDB Connecté: ${conn.connection.host}`);
    } catch (error) {
        logger.error(`Erreur de connexion MongoDB: ${error.message}`);
        process.exit(1); // Quitter le processus en cas d'échec de connexion à la DB
    }
};

module.exports = connectDB;
