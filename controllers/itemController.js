// /controllers/itemController.js
import Item from '../models/Item.js';
import User from '../models/User.js'; // Importer User pour peupler les infos vendeur
import AppError from '../utils/appError.js';
import { logger } from '../config/logger.js';
import APIFeatures from '../utils/apiFeatures.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Contrôleur pour récupérer toutes les annonces et alertes.
 * Gère le filtrage, le tri, la pagination et la sélection de champs via APIFeatures.
 */
export const getAllItems = async (req, res, next) => {
  try {
    // Pour le filtrage par distance, si les coordonnées sont fournies
    let query = Item.find(); // Initial query

    if (req.query.lat && req.query.lng && req.query.distance) {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const distance = parseFloat(req.query.distance) || 10; // distance en km, défaut 10km
      const radius = distance / 6378.1; // Rayon de la Terre en km

      query = query.where('location').within({
        center: [lng, lat], // MongoDB attend [longitude, latitude]
        radius: radius,
        unique: true,
        spherical: true
      });
    }
    
    // Exclure les champs de requête spécifiques à la géolocalisation avant de passer à APIFeatures
    const excludedGeoFields = ['lat', 'lng', 'distance'];
    const filteredQueryString = { ...req.query };
    excludedGeoFields.forEach(el => delete filteredQueryString[el]);


    // Utiliser APIFeatures pour le filtrage, tri, etc. sur les champs non géospatiaux
    const features = new APIFeatures(query, filteredQueryString)
      .filter() // Filtre sur les autres champs (category, type, price, etc.)
      .sort()
      .limitFields()
      .paginate();

    const items = await features.query.populate({
        path: 'userId', // Nom du champ dans le modèle Item qui référence User
        select: 'username avatarUrl rating' // Champs de l'utilisateur à retourner
    });

    logger.info(`Récupération de ${items.length} articles avec les filtres: ${JSON.stringify(req.query)}`);
    res.status(200).json({
      status: 'success',
      results: items.length,
      items // Le frontend s'attend à 'items'
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des articles:', error);
    next(error);
  }
};

/**
 * Contrôleur pour créer une nouvelle annonce ou alerte.
 */
export const createItem = async (req, res, next) => {
  try {
    const itemData = { ...req.body };
    itemData.userId = req.user.id; // ID de l'utilisateur connecté (depuis middleware protect)

    // Gérer les coordonnées de localisation
    if (req.body.latitude && req.body.longitude) {
      itemData.location = {
        type: 'Point',
        coordinates: [parseFloat(req.body.longitude), parseFloat(req.body.latitude)]
      };
    } else {
        return next(new AppError('Les coordonnées de localisation (latitude, longitude) sont requises.', 400));
    }
    // Supprimer les champs lat/lng du body principal car ils sont dans itemData.location
    delete itemData.latitude;
    delete itemData.longitude;


    // Gérer les images si c'est une annonce et si des fichiers ont été uploadés
    if (itemData.type === 'annonce' && req.files && req.files.length > 0) {
      itemData.images = req.files.map(file => `${process.env.UPLOADS_FOLDER || 'uploads'}/${file.filename}`);
    } else if (itemData.type === 'annonce') {
      itemData.images = []; // Pas d'images si aucune n'est fournie
    }

    // Assurer que les champs spécifiques au type sont bien gérés
    if (itemData.type === 'annonce') {
      if (itemData.price === undefined || itemData.price === null) {
        return next(new AppError('Le prix est requis pour une annonce.', 400));
      }
      if (!itemData.etat) {
        return next(new AppError('L\'état de l\'article est requis pour une annonce.', 400));
      }
      itemData.minPrice = undefined;
      itemData.maxPrice = undefined;
    } else if (itemData.type === 'alerte') {
      itemData.price = undefined;
      itemData.etat = undefined;
      itemData.images = []; // Les alertes n'ont pas d'images
      // minPrice et maxPrice sont optionnels pour une alerte selon le frontend
    }


    const newItem = await Item.create(itemData);
    logger.info(`Nouvel article (type: ${newItem.type}) créé avec ID: ${newItem._id} par l'utilisateur ID: ${req.user.id}`);
    res.status(201).json({
      status: 'success',
      item: newItem // Le frontend s'attend à 'item'
    });
  } catch (error) {
    // Si erreur après upload, supprimer les fichiers uploadés
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const filePath = path.join(path.dirname(__dirname), '..', process.env.UPLOADS_FOLDER || 'uploads', file.filename);
        fs.unlink(filePath, err => {
          if (err) logger.error(`Erreur suppression fichier ${file.filename} après échec création item:`, err);
        });
      });
    }
    logger.error(`Erreur lors de la création de l'article par l'utilisateur ID: ${req.user?.id}:`, error);
    if (error.name === 'ValidationError') {
        return next(new AppError(error.message, 400));
    }
    next(error);
  }
};

/**
 * Contrôleur pour récupérer une annonce ou une alerte spécifique.
 */
export const getItem = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id).populate({
        path: 'userId',
        select: 'username avatarUrl rating'
    });

    if (!item) {
      logger.warn(`Article non trouvé avec ID: ${req.params.id}`);
      return next(new AppError('Aucun article trouvé avec cet ID.', 404));
    }

    logger.info(`Article ID: ${item._id} récupéré.`);
    res.status(200).json({
      status: 'success',
      item // Le frontend s'attend à 'item'
    });
  } catch (error) {
    logger.error(`Erreur lors de la récupération de l'article ID: ${req.params.id}:`, error);
    if (error.name === 'CastError') return next(new AppError('ID d\'article invalide.', 400));
    next(error);
  }
};

/**
 * Contrôleur pour mettre à jour une annonce ou une alerte.
 */
export const updateItem = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      logger.warn(`Tentative de mise à jour d'un article non trouvé avec ID: ${req.params.id}`);
      return next(new AppError('Aucun article trouvé avec cet ID.', 404));
    }

    // Vérifier si l'utilisateur connecté est le propriétaire de l'item
    if (item.userId.toString() !== req.user.id.toString()) {
      logger.warn(`Tentative de mise à jour non autorisée de l'article ID: ${item._id} par l'utilisateur ID: ${req.user.id}. Propriétaire réel ID: ${item.userId}`);
      return next(new AppError('Vous n\'êtes pas autorisé à modifier cet article.', 403)); // Forbidden
    }

    const updateData = { ...req.body };

    // Gérer la mise à jour de la localisation
    if (req.body.latitude && req.body.longitude) {
      updateData.location = {
        type: 'Point',
        coordinates: [parseFloat(req.body.longitude), parseFloat(req.body.latitude)]
      };
    }
    delete updateData.latitude;
    delete updateData.longitude;

    // Gérer la mise à jour des images
    // Si de nouvelles images sont fournies, elles remplacent les anciennes.
    // Le frontend devrait envoyer toutes les images souhaitées (anciennes conservées + nouvelles).
    // Une logique plus complexe pourrait permettre d'ajouter/supprimer des images spécifiques.
    if (item.type === 'annonce' && req.files && req.files.length > 0) {
      // Optionnel: supprimer les anciennes images du serveur avant d'ajouter les nouvelles
      if (item.images && item.images.length > 0) {
        item.images.forEach(imgPath => {
          if (!imgPath.startsWith('http')) { // Ne pas supprimer les URLs externes
            const oldImagePath = path.join(path.dirname(__dirname), '..', imgPath);
            fs.unlink(oldImagePath, err => {
              if (err && err.code !== 'ENOENT') logger.warn(`Impossible de supprimer l'ancienne image ${oldImagePath} lors de la mise à jour:`, err);
            });
          }
        });
      }
      updateData.images = req.files.map(file => `${process.env.UPLOADS_FOLDER || 'uploads'}/${file.filename}`);
    } else if (item.type === 'annonce' && req.body.images && Array.isArray(req.body.images)) {
      // Si le frontend renvoie un tableau d'URLs d'images existantes à conserver (et pas de nouveaux fichiers)
      updateData.images = req.body.images;
    } else if (item.type === 'annonce' && !req.files) {
      // Si aucune nouvelle image n'est uploadée et que req.body.images n'est pas là, on ne touche pas aux images existantes
      delete updateData.images; 
    }


    // S'assurer que les champs spécifiques au type sont correctement gérés
    if (updateData.type === 'annonce' || (!updateData.type && item.type === 'annonce')) {
      updateData.minPrice = undefined;
      updateData.maxPrice = undefined;
    } else if (updateData.type === 'alerte' || (!updateData.type && item.type === 'alerte')) {
      updateData.price = undefined;
      updateData.etat = undefined;
      updateData.images = [];
    }


    const updatedItem = await Item.findByIdAndUpdate(req.params.id, updateData, {
      new: true, // Retourner le document mis à jour
      runValidators: true // Exécuter les validateurs Mongoose
    });

    logger.info(`Article ID: ${updatedItem._id} mis à jour par l'utilisateur ID: ${req.user.id}`);
    res.status(200).json({
      status: 'success',
      item: updatedItem
    });
  } catch (error) {
    logger.error(`Erreur lors de la mise à jour de l'article ID: ${req.params.id} par l'utilisateur ID: ${req.user?.id}:`, error);
    if (error.name === 'ValidationError') return next(new AppError(error.message, 400));
    if (error.name === 'CastError') return next(new AppError('ID d\'article invalide.', 400));
    next(error);
  }
};

/**
 * Contrôleur pour supprimer une annonce ou une alerte.
 */
export const deleteItem = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      logger.warn(`Tentative de suppression d'un article non trouvé avec ID: ${req.params.id}`);
      return next(new AppError('Aucun article trouvé avec cet ID.', 404));
    }

    // Vérifier si l'utilisateur connecté est le propriétaire de l'item
    if (item.userId.toString() !== req.user.id.toString()) {
      // Ou si l'utilisateur est un admin
      // if (req.user.role !== 'admin') { ... }
      logger.warn(`Tentative de suppression non autorisée de l'article ID: ${item._id} par l'utilisateur ID: ${req.user.id}. Propriétaire réel ID: ${item.userId}`);
      return next(new AppError('Vous n\'êtes pas autorisé à supprimer cet article.', 403));
    }

    // Supprimer les images associées du système de fichiers si elles existent
    if (item.images && item.images.length > 0) {
      item.images.forEach(imgPath => {
        if (!imgPath.startsWith('http')) {
          const imagePath = path.join(path.dirname(__dirname), '..', imgPath);
           fs.unlink(imagePath, err => {
            if (err && err.code !== 'ENOENT') logger.warn(`Impossible de supprimer l'image ${imagePath} lors de la suppression de l'article:`, err);
          });
        }
      });
    }
    
    await Item.findByIdAndDelete(req.params.id);

    // Supprimer aussi des favoris de tous les utilisateurs (plus complexe, nécessite de parcourir la collection Favorites)
    // Pour l'instant, on ne le fait pas ici pour garder le contrôleur simple.
    // Cela pourrait être géré par un hook Mongoose sur le modèle Item ou une tâche de nettoyage.

    logger.info(`Article ID: ${req.params.id} supprimé par l'utilisateur ID: ${req.user.id}`);
    res.status(204).json({ // 204 No Content
      status: 'success',
      data: null
    });
  } catch (error) {
    logger.error(`Erreur lors de la suppression de l'article ID: ${req.params.id} par l'utilisateur ID: ${req.user?.id}:`, error);
    if (error.name === 'CastError') return next(new AppError('ID d\'article invalide.', 400));
    next(error);
  }
};
