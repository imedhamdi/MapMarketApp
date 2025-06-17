const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');

// On configure DOMPurify avec une fenêtre JSDOM pour l'utiliser dans Node.js
const window = new JSDOM('').window;
const dompurify = DOMPurify(window);

const sanitizeRequest = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === 'string') {
        // Sanitize la chaîne pour enlever tout HTML potentiellement dangereux
        obj[key] = dompurify.sanitize(value);
      } else if (typeof value === 'object') {
        // Appel récursif pour les objets imbriqués ou les tableaux
        sanitizeRequest(value);
      }
    }
  }
};

const sanitizationMiddleware = (req, res, next) => {
  // Sanitize les données entrantes dans req.body, req.query, et req.params
  if (req.body) {
    sanitizeRequest(req.body);
  }
  if (req.query) {
    sanitizeRequest(req.query);
  }
  if (req.params) {
    sanitizeRequest(req.params);
  }
  next();
};

module.exports = sanitizationMiddleware;
