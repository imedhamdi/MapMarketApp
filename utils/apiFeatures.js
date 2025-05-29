// /utils/email.js
import sgMail from '@sendgrid/mail';
import { logger } from '../config/logger.js';

// Configurer SendGrid avec votre clé API (depuis les variables d'environnement)
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  logger.warn('SENDGRID_API_KEY non définie. L\'envoi d\'e-mails sera désactivé.');
}

/**
 * Envoie un e-mail en utilisant SendGrid.
 * @param {object} options - Options pour l'e-mail.
 * @param {string} options.to - Adresse e-mail du destinataire.
 * @param {string} options.subject - Sujet de l'e-mail.
 * @param {string} options.text - Contenu de l'e-mail en texte brut.
 * @param {string} [options.html] - Contenu de l'e-mail en HTML (optionnel).
 * @returns {Promise<void>} Une promesse qui se résout si l'e-mail est envoyé avec succès.
 */
const sendEmail = async (options) => {
  if (!process.env.SENDGRID_API_KEY) {
    logger.error('Tentative d\'envoi d\'e-mail alors que SENDGRID_API_KEY n\'est pas configurée.');
    // En mode développement, on pourrait logger l'email au lieu de l'envoyer
    if (process.env.NODE_ENV === 'development') {
        logger.info(`Email (non envoyé - Pas de clé API SendGrid): 
        À: ${options.to}
        De: ${process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com'}
        Sujet: ${options.subject}
        Texte: ${options.text}
        HTML: ${options.html || 'Non fourni'}
      `);
      return Promise.resolve(); // Simuler un envoi réussi en développement si pas de clé
    }
    return Promise.reject(new Error('Configuration d\'e-mail manquante pour envoyer l\'e-mail.'));
  }

  const mailOptions = {
    to: options.to,
    from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com',
        name: process.env.SENDGRID_FROM_NAME || 'MapMarket'
    },
    subject: options.subject,
    text: options.text,
    html: options.html // Optionnel, SendGrid utilisera `text` si `html` n'est pas fourni
  };

  try {
    await sgMail.send(mailOptions);
    logger.info(`E-mail envoyé avec succès à ${options.to} avec le sujet "${options.subject}"`);
  } catch (error) {
    logger.error(`Erreur lors de l'envoi de l'e-mail à ${options.to}: ${error.message}`);
    if (error.response) {
      logger.error('Détails de l\'erreur SendGrid:', JSON.stringify(error.response.body, null, 2));
    }
    // Ne pas rejeter l'erreur ici pour ne pas bloquer le flux principal si l'envoi d'email échoue,
    // sauf si c'est critique pour l'opération (ex: vérification d'email).
    // La gestion de l'échec de l'envoi d'email doit être faite par la fonction appelante.
    throw new Error(`L'envoi de l'e-mail a échoué. ${error.message}`);
  }
};

export default sendEmail;
