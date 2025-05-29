// /routes/favoriteRoutes.js
import express from 'express';
import {
  getFavorites,
  addFavorite,
  removeFavorite
} from '../controllers/favoriteController.js';
import { protect } from '../middlewares/authMiddleware.js';
// Importer un validateur si nécessaire pour addFavorite (ex: vérifier que itemId est un ObjectId valide)
// import { validateRequest, mongoIdParamSchema } from '../middlewares/validationMiddleware.js';

const router = express.Router();

// Toutes les routes de favoris nécessitent que l'utilisateur soit authentifié
router.use(protect);

/**
 * @route GET /api/favorites
 * @description Récupérer tous les articles favoris de l'utilisateur connecté.
 * @access Privé
 */
router.get('/', getFavorites);

/**
 * @route POST /api/favorites/:itemId
 * @description Ajouter un article aux favoris de l'utilisateur.
 * :itemId est l'ID de l'article (Item) à ajouter.
 * @access Privé
 */
// router.post('/:itemId', validateRequest(mongoIdParamSchema, 'params'), addFavorite);
router.post('/:itemId', addFavorite);


/**
 * @route DELETE /api/favorites/:itemId
 * @description Retirer un article des favoris de l'utilisateur.
 * :itemId est l'ID de l'article (Item) à retirer.
 * @access Privé
 */
// router.delete('/:itemId', validateRequest(mongoIdParamSchema, 'params'), removeFavorite);
router.delete('/:itemId', removeFavorite);

export default router;
