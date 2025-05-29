// /controllers/alertController.js
import Item from '../models/Item.js'; // Utilise le même modèle que les annonces
import AppError from '../utils/appError.js';
import { logger } from '../config/logger.js';
import APIFeatures from '../utils/apiFeatures.js';

/**
 * Contrôleur pour récupérer toutes les alertes.
 * Par défaut, récupère les alertes de l'utilisateur connecté.
 * Pourrait être étendu pour les admins pour voir toutes les alertes.
 */
export const getAllAlerts = async (req, res, next) => {
  try {
    // Filtrer pour ne récupérer que les items de type 'alerte' et appartenant à l'utilisateur connecté
    const filter = { type: 'alerte', userId: req.user.id };
    
    // On peut aussi utiliser APIFeatures si on veut du tri, pagination pour les alertes de l'utilisateur
    const features = new APIFeatures(Item.find(filter), req.query)
      .sort() // Trier par date de création par défaut
      .limitFields()
      .paginate();

    const alerts = await features.query;

    logger.info(`Récupération de ${alerts.length} alertes pour l'utilisateur ID: ${req.user.id}`);
    res.status(200).json({
      status: 'success',
      results: alerts.length,
      alerts // Le frontend s'attend à 'alerts'
    });
  } catch (error) {
    logger.error(`Erreur lors de la récupération des alertes pour l'utilisateur ID: ${req.user.id}:`, error);
    next(error);
  }
};

/**
 * Contrôleur pour créer une nouvelle alerte.
 */
export const createAlert = async (req, res, next) => {
  try {
    const alertData = { ...req.body };
    alertData.userId = req.user.id;
    alertData.type = 'alerte'; // Forcer le type à 'alerte'

    // Gérer la localisation
    if (req.body.latitude && req.body.longitude) {
      alertData.location = {
        type: 'Point',
        coordinates: [parseFloat(req.body.longitude), parseFloat(req.body.latitude)]
      };
    } else {
      return next(new AppError('Les coordonnées de localisation (latitude, longitude) sont requises pour une alerte.', 400));
    }
    delete alertData.latitude;
    delete alertData.longitude;

    // S'assurer que les champs spécifiques aux annonces ne sont pas présents
    alertData.price = undefined;
    alertData.etat = undefined;
    alertData.images = [];

    // Valider minPrice et maxPrice si fournis
    if (alertData.minPrice !== undefined && alertData.maxPrice !== undefined && parseFloat(alertData.maxPrice) < parseFloat(alertData.minPrice)) {
        return next(new AppError('Le prix maximum ne peut pas être inférieur au prix minimum.', 400));
    }

    const newAlert = await Item.create(alertData);
    logger.info(`Nouvelle alerte créée avec ID: ${newAlert._id} par l'utilisateur ID: ${req.user.id}`);
    res.status(201).json({
      status: 'success',
      alert: newAlert // Le frontend s'attend à 'alert'
    });
  } catch (error) {
    logger.error(`Erreur lors de la création de l'alerte par l'utilisateur ID: ${req.user?.id}:`, error);
    if (error.name === 'ValidationError') {
        return next(new AppError(error.message, 400));
    }
    next(error);
  }
};

/**
 * Contrôleur pour supprimer une alerte.
 */
export const deleteAlert = async (req, res, next) => {
  try {
    const alert = await Item.findOne({ _id: req.params.id, type: 'alerte' });

    if (!alert) {
      logger.warn(`Tentative de suppression d'une alerte non trouvée avec ID: ${req.params.id}`);
      return next(new AppError('Aucune alerte trouvée avec cet ID.', 404));
    }

    // Vérifier si l'utilisateur connecté est le propriétaire de l'alerte
    if (alert.userId.toString() !== req.user.id.toString()) {
      logger.warn(`Tentative de suppression non autorisée de l'alerte ID: ${alert._id} par l'utilisateur ID: ${req.user.id}.`);
      return next(new AppError('Vous n\'êtes pas autorisé à supprimer cette alerte.', 403));
    }

    await Item.findByIdAndDelete(req.params.id);

    logger.info(`Alerte ID: ${req.params.id} supprimée par l'utilisateur ID: ${req.user.id}`);
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    logger.error(`Erreur lors de la suppression de l'alerte ID: ${req.params.id} par l'utilisateur ID: ${req.user?.id}:`, error);
    if (error.name === 'CastError') return next(new AppError('ID d\'alerte invalide.', 400));
    next(error);
  }
};

// Implémenter getAlert et updateAlert si nécessaire, en suivant une logique similaire
// et en s'assurant toujours que item.type === 'alerte'.
