// config/winston.js
const winston = require('winston');
const path = require('path');

// Définir les niveaux de log (npm logging levels)
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Définir les couleurs pour chaque niveau (optionnel, pour la console)
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};
winston.addColors(colors);

// Déterminer l'environnement
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn'; // Log plus en dev, moins en prod
};

// Format des logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }), // Colorise la sortie console
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

const fileLogFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`
    )
  );

// Transports (où envoyer les logs)
const transports = [
  // Log en console
  new winston.transports.Console({
    format: logFormat,
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info', // Log plus en dev
  }),
  // Log des erreurs dans un fichier error.log
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/error.log'), // Créez le dossier logs à la racine
    level: 'error',
    format: fileLogFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  // Log de toutes les informations (niveau info et plus bas) dans un fichier all.log
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/all.log'),
    level: 'info', // Ou 'http' si vous voulez aussi les logs d'accès API de Morgan ici
    format: fileLogFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Créer l'instance du logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format: logFormat, // Format par défaut pour les transports qui n'ont pas de format spécifique
  transports,
  exitOnError: false, // Ne pas quitter sur une erreur de log gérée
});

// Stream pour Morgan (afin que les logs HTTP de Morgan passent par Winston)
const morganStream = {
  write: (message) => {
    // Utiliser le niveau 'http' pour les logs de Morgan, ou 'info' si vous préférez
    logger.http(message.trim());
  },
};

module.exports = { logger, morganStream };
