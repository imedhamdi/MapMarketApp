// /routes/alertRoutes.js
import express from 'express';
import {
  getAllAlerts,
  createAlert,
  deleteAlert
  // getAlert, // Si besoin de récupérer une alerte par ID
  // updateAlert // Si besoin de mettre à jour une alerte
} from '../controllers/alertController.js';
import { protect } from '../middlewares/authMiddleware.js';
// Importer les schémas de validation Joi pour les alertes si nécessaire
// import { validateRequest, alertSchema } from '../middlewares/validationMiddleware.js';

const router = express.Router();

// Toutes les routes pour les alertes nécessitent une authentification
router.use(protect);

/**
 * @route GET /api/alerts
 * @description Récupérer toutes les alertes de l'utilisateur connecté (ou toutes si admin).
 * @access Privé
 */
router.get('/', getAllAlerts);

/**
 * @route POST /api/alerts
 * @description Créer une nouvelle alerte de recherche.
 * @access Privé
 */
router.post(
  '/',
  // validateRequest(alertSchema), // Activer la validation
  createAlert
);

/**
 * @route DELETE /api/alerts/:id
 * @description Supprimer une alerte spécifique.
 * L'utilisateur doit être le propriétaire de l'alerte.
 * @access Privé (propriétaire)
 */
router.delete('/:id', deleteAlert);

// Si vous avez besoin de routes GET by ID ou PUT pour les alertes, ajoutez-les ici
// router.get('/:id', getAlert);
// router.put('/:id', updateAlert);

export default router;
