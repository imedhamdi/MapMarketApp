// /config/db.js
import mongoose from 'mongoose';
import { logger } from './logger.js'; // Importer le logger

/**
 * Connecte l'application à la base de données MongoDB.
 * Utilise l'URI de connexion spécifiée dans les variables d'environnement.
 * En cas d'échec de la connexion, logue l'erreur et termine le processus.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Options de Mongoose pour éviter les avertissements de dépréciation et assurer une connexion stable.
      // Ces options sont généralement gérées par défaut dans les versions récentes de Mongoose (6.x+),
      // mais il est bon de les connaître.
      // useNewUrlParser: true, // Géré par défaut
      // useUnifiedTopology: true, // Géré par défaut
      // useCreateIndex: true, // N'est plus supporté, Mongoose gère les index automatiquement
      // useFindAndModify: false, // N'est plus supporté, utiliser findOneAndUpdate() etc.
    });

    logger.info(`MongoDB Connecté: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`Erreur de connexion MongoDB: ${error.message}`);
    logger.error(error.stack); // Loguer la pile d'appels pour un débogage plus facile
    process.exit(1); // Quitter le processus avec un code d'échec
  }
};

export default connectDB;
