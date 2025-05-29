// /middlewares/validationMiddleware.js
import Joi from 'joi';
import AppError from '../utils/appError.js';
import { logger } from '../config/logger.js';
import mongoose from 'mongoose'; // Pour valider les ObjectIds

/**
 * Middleware de validation générique utilisant Joi.
 * @param {Joi.Schema} schema - Le schéma Joi à valider.
 * @param {'body' | 'query' | 'params'} property - La propriété de l'objet req à valider.
 */
export const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, 
      allowUnknown: true, 
      stripUnknown: true 
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message.replace(/['"]/g, '')).join('. ');
      logger.warn(`Erreur de validation (${property}): ${errorMessage} pour la route ${req.originalUrl}`);
      return next(new AppError(`Données d'entrée invalides: ${errorMessage}`, 400));
    }

    req[property] = value; 
    next();
  };
};

// --- Schémas de Validation Joi ---

// Helper pour valider les ObjectIds de MongoDB
const mongoIdSchema = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}, 'MongoDB ObjectId Validation').messages({
  'any.invalid': 'L\'ID fourni n\'est pas un ObjectId MongoDB valide.'
});

// Auth Schemas
export const signupSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required().messages({
    'string.base': "Le nom d'utilisateur doit être une chaîne de caractères.",
    'string.alphanum': "Le nom d'utilisateur ne peut contenir que des caractères alphanumériques.",
    'string.min': "Le nom d'utilisateur doit contenir au moins {#limit} caractères.",
    'string.max': "Le nom d'utilisateur ne peut pas dépasser {#limit} caractères.",
    'any.required': "Le nom d'utilisateur est requis."
  }),
  email: Joi.string().email().required().messages({
    'string.email': "L'adresse e-mail doit être une adresse e-mail valide.",
    'any.required': "L'adresse e-mail est requise."
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': "Le mot de passe doit contenir au moins {#limit} caractères.",
    'any.required': "Le mot de passe est requis."
  })
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': "L'adresse e-mail doit être une adresse e-mail valide.",
    'any.required': "L'adresse e-mail est requise."
  }),
  password: Joi.string().required().messages({
    'any.required': "Le mot de passe est requis."
  })
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': "L'adresse e-mail doit être une adresse e-mail valide.",
    'any.required': "L'adresse e-mail est requise pour la réinitialisation du mot de passe."
  })
});

export const resetPasswordSchema = Joi.object({
  password: Joi.string().min(6).required().messages({
    'string.min': "Le nouveau mot de passe doit contenir au moins {#limit} caractères.",
    'any.required': "Le nouveau mot de passe est requis."
  }),
  // passwordConfirm: Joi.string().required().valid(Joi.ref('password')), // Si vous avez une confirmation
});


// User Schemas
export const updateUserSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).optional(),
  email: Joi.string().email().optional()
  // Ne pas inclure le mot de passe ici, utiliser une route dédiée
}).min(1); // Au moins un champ doit être fourni pour la mise à jour

// Item (Annonce/Alerte) Schemas
const categoriesValides = ['immobilier', 'vehicules', 'emploi', 'mode', 'enfants', 'multimedia', 'maison', 'loisirs', 'videgrenier'];
const etatsValides = ['neuf', 'tres_bon_etat', 'bon_etat', 'satisfaisant', 'pour_pieces'];

export const createItemSchema = Joi.object({
  title: Joi.string().min(3).max(100).required(),
  description: Joi.string().min(10).max(1000).required(),
  type: Joi.string().valid('annonce', 'alerte').required(),
  category: Joi.string().valid(...categoriesValides).required(),
  price: Joi.number().min(0).precision(2).when('type', { is: 'annonce', then: Joi.required(), otherwise: Joi.optional().allow(null) }),
  minPrice: Joi.number().min(0).precision(2).when('type', { is: 'alerte', then: Joi.optional().allow(null), otherwise: Joi.forbidden() }),
  maxPrice: Joi.number().min(0).precision(2)
    .when('minPrice', { 
      is: Joi.number().required(), 
      then: Joi.number().min(Joi.ref('minPrice')).messages({'number.min': 'Le prix maximum doit être supérieur ou égal au prix minimum.'}), 
      otherwise: Joi.optional().allow(null) 
    })
    .when('type', { is: 'alerte', then: Joi.optional().allow(null), otherwise: Joi.forbidden() }),
  etat: Joi.string().valid(...etatsValides).when('type', { is: 'annonce', then: Joi.required(), otherwise: Joi.optional().allow(null) }),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  // 'images' est géré par Multer, pas besoin de valider ici comme un champ de body,
  // mais on pourrait valider req.files dans le contrôleur ou un middleware Multer.
});

export const updateItemSchema = Joi.object({
  title: Joi.string().min(3).max(100).optional(),
  description: Joi.string().min(10).max(1000).optional(),
  // type: Joi.string().valid('annonce', 'alerte').optional(), // Le type ne devrait généralement pas être modifié
  category: Joi.string().valid(...categoriesValides).optional(),
  price: Joi.number().min(0).precision(2).optional().allow(null),
  minPrice: Joi.number().min(0).precision(2).optional().allow(null),
  maxPrice: Joi.number().min(0).precision(2)
    .when('minPrice', { 
      is: Joi.number().required(), 
      then: Joi.number().min(Joi.ref('minPrice')).messages({'number.min': 'Le prix maximum doit être supérieur ou égal au prix minimum.'}), 
      otherwise: Joi.optional().allow(null) 
    }).optional().allow(null),
  etat: Joi.string().valid(...etatsValides).optional().allow(null),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  images: Joi.array().items(Joi.string()).optional() // Si le frontend envoie les URLs des images à conserver
}).min(1); // Au moins un champ doit être fourni pour la mise à jour


// Favorite Schemas
export const itemIdParamSchema = Joi.object({
  itemId: mongoIdSchema.required()
});

// Message Schemas
export const sendMessageSchema = Joi.object({
  text: Joi.string().min(1).max(2000).required(),
  receiverId: mongoIdSchema.when('threadId', { not: Joi.exist(), then: Joi.required(), otherwise: Joi.optional() }),
  threadId: mongoIdSchema.optional(),
  itemContextId: mongoIdSchema.optional()
});

export const threadIdParamSchema = Joi.object({
  threadId: mongoIdSchema.required()
});

export const messageIdParamSchema = Joi.object({
  messageId: mongoIdSchema.required()
});

// Alert Schemas (si différent d'Item, sinon réutiliser/adapter itemSchema)
// Pour l'instant, on utilise itemSchema avec le type 'alerte'
export const createAlertSchema = createItemSchema; // Ou un schéma spécifique si les champs diffèrent beaucoup
export const alertIdParamSchema = Joi.object({
    id: mongoIdSchema.required()
});
