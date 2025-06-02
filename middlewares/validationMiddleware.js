// middlewares/validationMiddleware.js
const Joi = require('joi');
const { AppError } = require('./errorHandler'); // Pour formater les erreurs de validation

/**
 * Middleware générique pour valider les données d'une requête avec un schéma Joi.
 * @param {Joi.Schema} schema - Le schéma Joi à utiliser pour la validation.
 * @param {string} [property='body'] - La propriété de l'objet req à valider ('body', 'query', 'params').
 */
const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Rapporter toutes les erreurs, pas seulement la première
      stripUnknown: true, // Retirer les champs inconnus
      errors: {
        wrap: {
          label: '' // Ne pas entourer les clés de guillemets dans les messages d'erreur
        }
      }
    });

    if (error) {
      // L'erreur Joi (avec error.isJoi = true) sera gérée par le globalErrorHandler
      return next(error);
    }

    req[property] = value; // Remplacer par les données validées/nettoyées
    next();
  };
};

// Schémas de validation pour l'authentification
const signupSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50).required().messages({
    'string.base': 'Le nom doit être une chaîne de caractères.',
    'string.empty': 'Le nom ne peut pas être vide.',
    'string.min': 'Le nom doit comporter au moins {#limit} caractères.',
    'string.max': 'Le nom ne doit pas dépasser {#limit} caractères.',
    'any.required': 'Le nom est requis.',
  }),
  email: Joi.string().trim().email().required().messages({
    'string.base': 'L\'e-mail doit être une chaîne de caractères.',
    'string.empty': 'L\'e-mail ne peut pas être vide.',
    'string.email': 'L\'e-mail doit être une adresse e-mail valide.',
    'any.required': 'L\'e-mail est requis.',
  }),
  password: Joi.string().min(6).required().messages({
    'string.base': 'Le mot de passe doit être une chaîne de caractères.',
    'string.empty': 'Le mot de passe ne peut pas être vide.',
    'string.min': 'Le mot de passe doit comporter au moins {#limit} caractères.',
    'any.required': 'Le mot de passe est requis.',
  }),
  passwordConfirm: Joi.string().required().valid(Joi.ref('password')).messages({
    'any.only': 'La confirmation du mot de passe ne correspond pas au mot de passe.',
    'string.empty': 'La confirmation du mot de passe ne peut pas être vide.',
    'any.required': 'La confirmation du mot de passe est requise.',
  }),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    'string.email': 'L\'e-mail doit être une adresse e-mail valide.',
    'any.required': 'L\'e-mail est requis.',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Le mot de passe est requis.',
  }),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    'string.email': 'L\'e-mail doit être une adresse e-mail valide.',
    'any.required': 'L\'e-mail est requis pour la réinitialisation du mot de passe.',
  }),
});

const resetPasswordSchema = Joi.object({
  password: Joi.string().min(6).required().messages({
    'string.min': 'Le nouveau mot de passe doit comporter au moins {#limit} caractères.',
    'any.required': 'Le nouveau mot de passe est requis.',
  }),
  passwordConfirm: Joi.string().required().valid(Joi.ref('password')).messages({
    'any.only': 'La confirmation du mot de passe ne correspond pas.',
    'any.required': 'La confirmation du nouveau mot de passe est requise.',
  }),
});

// Schémas pour les annonces
const createAdSchema = Joi.object({
    title: Joi.string().trim().min(5).max(100).required(),
    description: Joi.string().trim().min(10).max(2000).required(),
    price: Joi.number().min(0).required(),
    category: Joi.string().required(),
    location: Joi.object({
        coordinates: Joi.array().ordered(
            Joi.number().min(-180).max(180).required(), // Longitude
            Joi.number().min(-90).max(90).required()    // Latitude
        ).length(2).required(),
        address: Joi.string().trim().optional().allow('')
    }).required(),
});

const updateAdSchema = Joi.object({
    title: Joi.string().trim().min(5).max(100).optional(),
    description: Joi.string().trim().min(10).max(2000).optional(),
    price: Joi.number().min(0).optional(),
    category: Joi.string().optional(),
    location: Joi.object({
        coordinates: Joi.array().ordered(
            Joi.number().min(-180).max(180).required(),
            Joi.number().min(-90).max(90).required()
        ).length(2).optional(), // Coordonnées optionnelles, mais si fournies, les deux sont requises
        address: Joi.string().trim().optional().allow('')
    }).optional(),
    status: Joi.string().valid('online', 'pending_review', 'archived', 'sold', 'draft').optional(),
    existingImageUrls: Joi.string().optional().allow(''), // Stringified array of URLs
}).min(1); // Au moins un champ doit être fourni pour une mise à jour

// Schéma pour l'envoi de message texte
const createMessageSchema = Joi.object({
    threadId: Joi.string().hex().length(24).optional(),
    recipientId: Joi.string().hex().length(24).optional(),
    text: Joi.string().trim().max(2000).when('image', {
        is: Joi.exist(),
        then: Joi.optional().allow(''),
        otherwise: Joi.required()
    }),
}).xor('threadId', 'recipientId');

// Schémas pour les alertes
const createAlertSchema = Joi.object({
    keywords: Joi.string().trim().min(3).max(100).required(),
    category: Joi.string().trim().allow(null, '').optional(),
    priceMin: Joi.number().min(0).allow(null).optional(),
    priceMax: Joi.number().min(0).allow(null).optional().when('priceMin', {
        is: Joi.number().required(),
        then: Joi.number().min(Joi.ref('priceMin')),
        otherwise: Joi.optional()
    }),
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    radius: Joi.number().min(1).max(200).required(),
    isActive: Joi.boolean().optional()
});

const updateAlertSchema = Joi.object({
    keywords: Joi.string().trim().min(3).max(100).optional(),
    category: Joi.string().trim().allow(null, '').optional(),
    priceMin: Joi.number().min(0).allow(null).optional(),
    priceMax: Joi.number().min(0).allow(null).optional().when('priceMin', {
        is: Joi.number().exist(), // Doit exister si priceMax est là et priceMin aussi
        then: Joi.number().min(Joi.ref('priceMin')),
        otherwise: Joi.optional()
    }),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    radius: Joi.number().min(1).max(200).optional(),
    isActive: Joi.boolean().optional()
})
.with('latitude', 'longitude') // Si latitude est fournie, longitude doit l'être aussi
.with('longitude', 'latitude') // Et vice-versa
.min(1); // Au moins un champ doit être fourni pour la mise à jour


// Schéma pour l'ajout aux favoris
const addFavoriteSchema = Joi.object({
    adId: Joi.string().hex().length(24).required().messages({
        'string.hex': 'L\'ID de l\'annonce doit être un ObjectId hexadécimal valide.',
        'string.length': 'L\'ID de l\'annonce doit comporter 24 caractères hexadécimaux.',
        'any.required': 'L\'ID de l\'annonce est requis.',
    }),
});


// Dans middlewares/validationMiddleware.js
const initiateThreadSchema = Joi.object({
    recipientId: Joi.string().hex().length(24).required(),
    adId: Joi.string().hex().length(24).optional().allow(null, '')
});
exports.validateInitiateThread = validateRequest(initiateThreadSchema);




// Dans middlewares/validationMiddleware.js
const updateSettingsSchema = Joi.object({
    settings: Joi.object({ // L'objet principal 'settings'
        darkMode: Joi.boolean().optional(),
        language: Joi.string().valid('fr', 'en').optional(),
        notifications: Joi.object({
            pushEnabled: Joi.boolean().optional(),
            emailEnabled: Joi.boolean().optional()
        }).optional(),
        pushSubscription: Joi.alternatives().try(
            Joi.object().allow(null), // Permet null pour la désinscription
            Joi.object({ // Structure typique d'un PushSubscription
                endpoint: Joi.string().uri().required(),
                expirationTime: Joi.any().allow(null), // Peut être null
                keys: Joi.object({
                    p256dh: Joi.string().required(),
                    auth: Joi.string().required()
                }).required()
            })
        ).optional()
    }).required().min(1) // Au moins une clé dans l'objet settings
});
exports.validateUpdateSettings = validateRequest(updateSettingsSchema);



// Exporter les middlewares de validation spécifiques
exports.validateSignup = validateRequest(signupSchema);
exports.validateLogin = validateRequest(loginSchema);
exports.validateForgotPassword = validateRequest(forgotPasswordSchema);
exports.validateResetPassword = validateRequest(resetPasswordSchema);

exports.validateCreateAd = validateRequest(createAdSchema);
exports.validateUpdateAd = validateRequest(updateAdSchema);

exports.validateCreateMessage = validateRequest(createMessageSchema);

exports.validateCreateAlert = validateRequest(createAlertSchema);
exports.validateUpdateAlert = validateRequest(updateAlertSchema); // Export du nouveau validateur

exports.validateAddFavorite = validateRequest(addFavoriteSchema);
