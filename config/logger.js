// /config/logger.js
import winston from 'winston';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Configuration initiale pour __dirname avec ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Déterminer le répertoire des logs à partir de la racine du projet
const logDirectory = path.join(path.dirname(__dirname), process.env.LOG_DIR || 'logs');

// S'assurer que le répertoire des logs existe
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

// Définir les niveaux de log (standard de Winston)
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Définir les couleurs pour chaque niveau de log (pour la console)
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};
winston.addColors(colors);

// Format de log personnalisé pour Winston
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message} ${info.stack ? '\n' + info.stack : ''}`)
);

// Créer les transports pour Winston (où les logs seront écrits)
const transports = [
  // Transport pour la console
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info', // Niveau de log pour la console
    format: winston.format.combine(
      winston.format.colorize(), // Colorer la sortie console
      logFormat
    )
  }),
  // Transport pour écrire les logs d'application dans un fichier
  new winston.transports.File({
    filename: path.join(logDirectory, 'app.log'),
    level: 'info', // Loguer les infos et plus critiques dans app.log
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5, // Garder jusqu'à 5 fichiers de log
    tailable: true,
  }),
  // Transport pour écrire uniquement les erreurs dans un fichier séparé
  new winston.transports.File({
    filename: path.join(logDirectory, 'error.log'),
    level: 'error', // Ne loguer que les erreurs
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    tailable: true,
  })
];

// Créer l'instance du logger Winston
const logger = winston.createLogger({
  levels,
  format: logFormat, // Format par défaut pour tous les transports (peut être surchargé par transport)
  transports,
  exitOnError: false // Ne pas quitter sur les erreurs gérées par Winston
});

// Configuration de Morgan (logger de requêtes HTTP) pour utiliser Winston
// Morgan va intercepter les logs de requêtes HTTP et les passer à Winston
const morganMiddleware = morgan(
  // Format de log personnalisé pour Morgan
  // :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"
  // Ou un format plus simple :
  ':method :url :status :res[content-length] - :response-time ms',
  {
    // Utiliser le stream de Winston pour écrire les logs HTTP
    // On choisit le niveau 'http' pour ces logs
    stream: {
      write: (message) => logger.http(message.trim())
    }
  }
);

export { logger, morganMiddleware };
