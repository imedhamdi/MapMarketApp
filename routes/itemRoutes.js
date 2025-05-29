// /routes/itemRoutes.js
import express from 'express';
import {
  getAllItems,
  createItem,
  getItem,
  updateItem,
  deleteItem,
  // getItemsByUser // Optionnel, si besoin d'une route spécifique
} from '../controllers/itemController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { uploadItemImages } from '../middlewares/uploadMiddleware.js';
// Importer les schémas de validation Joi pour les items
// import { validateRequest, itemSchema as createItemSchema, updateItemSchema } from '../middlewares/validationMiddleware.js';

const router = express.Router();

/**
 * @route GET /api/items
 * @description Récupérer toutes les annonces et alertes (avec filtres possibles via query string).
 * @access Public
 */
router.get('/', getAllItems);

/**
 * @route POST /api/items
 * @description Créer une nouvelle annonce ou alerte.
 * Si c'est une annonce, peut inclure des images (champ 'images').
 * @access Privé (utilisateur connecté)
 */
router.post(
  '/',
  protect, // L'utilisateur doit être connecté pour créer un item
  uploadItemImages, // Gère l'upload de max 3 images pour le champ 'images'
  // validateRequest(createItemSchema), // Activer la validation avec un schéma Joi approprié
  createItem
);

/**
 * @route GET /api/items/:id
 * @description Récupérer une annonce ou une alerte spécifique par son ID.
 * @access Public
 */
router.get('/:id', getItem);

/**
 * @route PUT /api/items/:id
 * @description Mettre à jour une annonce ou une alerte spécifique.
 * L'utilisateur doit être le propriétaire de l'item.
 * Peut inclure la mise à jour d'images.
 * @access Privé (propriétaire de l'item)
 */
router.put(
  '/:id',
  protect,
  uploadItemImages, // Permettre la mise à jour des images
  // validateRequest(updateItemSchema), // Activer la validation
  updateItem
);

/**
 * @route DELETE /api/items/:id
 * @description Supprimer une annonce ou une alerte spécifique.
 * L'utilisateur doit être le propriétaire de l'item.
 * @access Privé (propriétaire de l'item)
 */
router.delete('/:id', protect, deleteItem);


// Optionnel: Route pour récupérer les items d'un utilisateur spécifique
// router.get('/user/:userId', getItemsByUser);

export default router;
