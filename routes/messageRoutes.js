// routes/messageRoutes.js
const express = require('express');
const messageController = require('../controllers/messageController');
const { protect } = require('../middlewares/authMiddleware');
const { handleMulterUpload, uploadMessageImage } = require('../middlewares/uploadMiddleware');
// Importer les validateurs spécifiques (à créer dans validationMiddleware.js)
const { validateCreateMessage, validateInitiateThread } = require('../middlewares/validationMiddleware');

const router = express.Router();

// Toutes les routes pour la messagerie nécessitent une authentification
router.use(protect);

// Routes pour les Threads
router.post('/threads/initiate', validateInitiateThread, messageController.initiateOrGetThread);
router.get('/threads', messageController.getMyThreads);
router.get('/threads/:threadId/messages', messageController.getMessagesForThread);
router.post('/threads/:threadId/read', messageController.markThreadAsRead);
router.delete('/threads/:threadId/local', messageController.deleteThreadLocally); // Suppression locale

// Routes pour les Messages
router.post('/messages', validateCreateMessage, messageController.sendMessage); // Pour les messages texte
router.post(
    '/messages/image',
    handleMulterUpload(uploadMessageImage), // Gère l'upload avant le contrôleur
    // Pas besoin de validateCreateMessage ici si le texte est optionnel avec une image
    // ou si les champs threadId/recipientId sont envoyés en multipart/form-data
    messageController.sendMessage // Le même contrôleur peut gérer les deux si req.file est vérifié
);

// Route pour signaler un message
router.post('/messages/:messageId/report', messageController.reportMessage);


module.exports = router;
