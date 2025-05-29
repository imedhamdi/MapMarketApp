// /utils/appError.js

/**
 * Classe d'erreur personnalisée pour gérer les erreurs opérationnelles attendues.
 * Permet de distinguer les erreurs opérationnelles (ex: entrée utilisateur invalide)
 * des erreurs de programmation ou système.
 */
class AppError extends Error {
  /**
   * Crée une instance de AppError.
   * @param {string} message - Le message d'erreur.
   * @param {number} statusCode - Le code de statut HTTP associé à l'erreur.
   */
  constructor(message, statusCode) {
    super(message); // Appelle le constructeur de la classe Error parente

    this.statusCode = statusCode;
    // Détermine le statut ('fail' pour 4xx, 'error' pour 5xx)
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    // Indique que c'est une erreur opérationnelle (prévisible)
    this.isOperational = true;

    // Capture la pile d'appels, en excluant le constructeur AppError lui-même
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
