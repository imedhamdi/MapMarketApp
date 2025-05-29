// /routes/messageRoutes.js
import express from 'express';
import {
  getThreads,
  getMessagesForThread,
  sendMessage,
  deleteMessage, // Optionnel: suppression soft d'un message par son auteur
  deleteThread,  // Optionnel: suppression d'un thread par un participant (suppression soft ou masquage)
  markThreadAsRead // Pour marquer les messages d'un thread comme lus
} from '../controllers/messageController.js';
import { protect } from '../middlewares/authMiddleware.js';
// Importer les validateurs Joi si nécessaire
// import { validateRequest, sendMessageSchema, mongoIdParamSchema } from '../middlewares/validationMiddleware.js';

const router = express.Router();

// Toutes les routes de messagerie nécessitent une authentification
router.use(protect);

/**
 * @route GET /api/messages/threads
 * @description Récupérer tous les fils de discussion de l'utilisateur connecté.
 * @access Privé
 */
router.get('/threads', getThreads);

/**
 * @route GET /api/messages/thread/:threadId
 * @description Récupérer tous les messages d'un fil de discussion spécifique.
 * L'utilisateur doit être un participant du thread.
 * @access Privé
 */
// router.get('/thread/:threadId', validateRequest(mongoIdParamSchema, 'params'), getMessagesForThread);
router.get('/thread/:threadId', getMessagesForThread);


/**
 * @route POST /api/messages/send
 * @description Envoyer un nouveau message.
 * Si threadId est fourni, ajoute à un thread existant.
 * Si receiverId est fourni (et pas de threadId), tente de créer un nouveau thread.
 * @access Privé
 */
// router.post('/send', validateRequest(sendMessageSchema), sendMessage);
router.post('/send', sendMessage);

/**
 * @route POST /api/messages/thread/:threadId/read
 * @description Marquer tous les messages d'un thread comme lus pour l'utilisateur connecté.
 * @access Privé
 */
router.post('/thread/:threadId/read', markThreadAsRead);


/**
 * @route DELETE /api/messages/:messageId
 * @description Supprimer (soft delete) un message spécifique.
 * L'utilisateur doit être l'expéditeur du message.
 * @access Privé (expéditeur)
 */
// router.delete('/:messageId', validateRequest(mongoIdParamSchema, 'params'), deleteMessage);
// Note: La suppression "soft" de message n'est pas explicitement demandée par le frontend fourni.
// Cette route est optionnelle.

/**
 * @route DELETE /api/messages/thread/:threadId
 * @description Supprimer (soft delete ou masquer) un fil de discussion pour l'utilisateur connecté.
 * @access Privé (participant)
 */
// router.delete('/thread/:threadId', validateRequest(mongoIdParamSchema, 'params'), deleteThread);
// Note: La suppression de thread n'est pas explicitement demandée par le frontend fourni.
// Cette route est optionnelle.

export default router;
