// utils/mailer.js
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Transporteur SMTP (exemple avec Gmail, à adapter si autre service)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,      // e.g. "votre.email@gmail.com"
    pass: process.env.EMAIL_PASSWORD   // App password ou mot de passe SMTP
  }
});

/**
 * Envoie un email de réinitialisation de mot de passe
 * @param {string} to - Email du destinataire
 * @param {string} token - Jeton de réinitialisation (non hashé)
 */
const sendResetEmail = async (to, token) => {
  const resetUrl = `https://mapmarket.fr/reset-password/${token}`;
  const htmlTemplate = fs.readFileSync(path.join(__dirname, 'resetTemplate.html'), 'utf8');
  const emailHTML = htmlTemplate.replace('{{RESET_URL}}', resetUrl);

  const mailOptions = {
    from: '"MapMarket" <no-reply@mapmarket.fr>',
    to,
    subject: 'Réinitialisation de votre mot de passe',
    html: emailHTML
  };

  return transporter.sendMail(mailOptions);
};

module.exports = sendResetEmail;
