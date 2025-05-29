// /controllers/favoriteController.js
import Favorite from '../models/Favorite.js';
import Item from '../models/Item.js'; // Pour s'assurer que l'item existe
import AppError from '../utils/appError.js';
import { logger } from '../config/logger.js';

/**
 * Contrôleur pour récupérer les articles favoris de l'utilisateur connecté.
 */
export const getFavorites = async (req, res, next) => {
  try {
    // Récupérer les favoris de l'utilisateur et peupler les détails de l'item
    const favorites = await Favorite.find({ user: req.user.id }).populate({
      path: 'item',
      // Sélectionner les champs de l'item que vous voulez retourner
      // Si vous ne spécifiez rien, tous les champs de l'item seront retournés
      // select: 'title price images category type location etat userId createdAt', 
      populate: { // Optionnel: peupler le vendeur de l'item
        path: 'userId',
        select: 'username avatarUrl rating'
      }
    });

    // Extraire uniquement les items des objets favoris pour la réponse
    const favoriteItems = favorites.map(fav => fav.item).filter(item => item != null); // Filtrer les items null si un favori pointe vers un item supprimé

    logger.info(`Récupération de ${favoriteItems.length} favoris pour l'utilisateur ID: ${req.user.id}`);
    res.status(200).json({
      status: 'success',
      results: favoriteItems.length,
      // Le frontend s'attend à un tableau d'items directement, pas des objets Favorite
      favorites: favoriteItems
    });
  } catch (error) {
    logger.error(`Erreur lors de la récupération des favoris pour l'utilisateur ID: ${req.user.id}:`, error);
    next(error);
  }
};

/**
 * Contrôleur pour ajouter un article aux favoris.
 */
export const addFavorite = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.itemId;

    // 1. Vérifier si l'article existe
    const itemExists = await Item.findById(itemId);
    if (!itemExists) {
      logger.warn(`Tentative d'ajout en favori d'un article non existant ID: ${itemId} par l'utilisateur ID: ${userId}`);
      return next(new AppError('L\'article que vous essayez d\'ajouter aux favoris n\'existe pas.', 404));
    }

    // 2. Vérifier si l'article est déjà en favori par cet utilisateur
    const existingFavorite = await Favorite.findOne({ user: userId, item: itemId });
    if (existingFavorite) {
      logger.info(`L'article ID: ${itemId} est déjà dans les favoris de l'utilisateur ID: ${userId}`);
      // Renvoyer une réponse de succès même s'il est déjà en favori, ou un 409 Conflict
      return res.status(200).json({
        status: 'success',
        message: 'Article déjà dans les favoris.',
        favorite: existingFavorite // Ou juste l'ID de l'item
      });
    }

    // 3. Créer le nouveau favori
    const newFavorite = await Favorite.create({
      user: userId,
      item: itemId
    });

    logger.info(`Article ID: ${itemId} ajouté aux favoris pour l'utilisateur ID: ${userId}`);
    res.status(201).json({
      status: 'success',
      message: 'Article ajouté aux favoris.',
      favorite: newFavorite // Renvoyer l'objet favori créé
    });
  } catch (error) {
    logger.error(`Erreur lors de l'ajout de l'article ID: ${req.params.itemId} aux favoris pour l'utilisateur ID: ${req.user?.id}:`, error);
    if (error.name === 'CastError') return next(new AppError('ID d\'article invalide.', 400));
    next(error);
  }
};

/**
 * Contrôleur pour retirer un article des favoris.
 */
export const removeFavorite = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.itemId;

    const favorite = await Favorite.findOneAndDelete({ user: userId, item: itemId });

    if (!favorite) {
      logger.warn(`Tentative de suppression d'un favori non existant (Item ID: ${itemId}) pour l'utilisateur ID: ${userId}`);
      // Il est acceptable de renvoyer un succès même si le favori n'existait pas,
      // car l'état final (l'item n'est pas en favori) est atteint.
      // Ou renvoyer un 404 si on veut être strict.
      return res.status(200).json({ // Ou 404
        status: 'success', // Ou 'fail'
        message: 'Article non trouvé dans les favoris ou déjà retiré.'
      });
    }

    logger.info(`Article ID: ${itemId} retiré des favoris pour l'utilisateur ID: ${userId}`);
    res.status(204).json({ // 204 No Content
      status: 'success',
      data: null
    });
  } catch (error) {
    logger.error(`Erreur lors de la suppression de l'article ID: ${req.params.itemId} des favoris pour l'utilisateur ID: ${req.user?.id}:`, error);
    if (error.name === 'CastError') return next(new AppError('ID d\'article invalide.', 400));
    next(error);
  }
};
