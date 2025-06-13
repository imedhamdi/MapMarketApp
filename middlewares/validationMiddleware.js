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
// Schémas pour les annonces
const createAdSchema = Joi.object({
    title: Joi.string().trim().min(5).max(100).required().messages({
        'string.base': 'Le titre doit être une chaîne de caractères.',
        'string.empty': 'Le titre ne peut pas être vide.',
        'string.min': 'Le titre doit comporter au moins {#limit} caractères.',
        'string.max': 'Le titre ne doit pas dépasser {#limit} caractères.',
        'any.required': 'Le titre est requis.',
    }),
    description: Joi.string().trim().min(10).max(2000).required().messages({
        'string.base': 'La description doit être une chaîne de caractères.',
        'string.empty': 'La description ne peut pas être vide.',
        'string.min': 'La description doit comporter au moins {#limit} caractères.',
        'string.max': 'La description ne doit pas dépasser {#limit} caractères.',
        'any.required': 'La description est requise.',
    }),
    price: Joi.number().min(0).required().messages({
        'number.base': 'Le prix doit être un nombre.',
        'number.min': 'Le prix doit être positif ou nul.',
        'any.required': 'Le prix est requis.',
    }),
    category: Joi.string().required().messages({ // Assurez-vous que la valeur envoyée est l'ID de la catégorie
        'string.base': 'La catégorie doit être une chaîne de caractères.',
        'string.empty': 'La catégorie ne peut pas être vide.',
        'any.required': 'La catégorie est requise.',
    }),
    // Champs de localisation plats attendus par le contrôleur
    latitude: Joi.number().min(-90).max(90).required().messages({
        'number.base': 'La latitude doit être un nombre.',
        'number.min': 'La latitude doit être d\'au moins -90.',
        'number.max': 'La latitude ne doit pas dépasser 90.',
        'any.required': 'La latitude est requise pour la localisation.',
    }),
    longitude: Joi.number().min(-180).max(180).required().messages({
        'number.base': 'La longitude doit être un nombre.',
        'number.min': 'La longitude doit être d\'au moins -180.',
        'number.max': 'La longitude ne doit pas dépasser 180.',
        'any.required': 'La longitude est requise pour la localisation.',
    }),
    locationAddress: Joi.string().trim().optional().allow('').max(255).messages({ // L'adresse est optionnelle, mais si fournie, elle a une limite
        'string.max': 'L\'adresse ne doit pas dépasser {#limit} caractères.',
    }),
    // `imageUrls` n'est pas directement dans req.body pour Joi lors de l'upload initial avec Multer.
    // Multer place les fichiers dans `req.files`. La validation du nombre/type/taille des images
    // est déjà gérée par `uploadMiddleware.js`.
});

const updateAdSchema = Joi.object({
    title: Joi.string().trim().min(5).max(100).optional(),
    description: Joi.string().trim().min(10).max(2000).optional(),
    price: Joi.number().min(0).optional(),
    category: Joi.string().optional(),
    // Champs de localisation plats optionnels pour la mise à jour
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    locationAddress: Joi.string().trim().optional().allow('').max(255),
    status: Joi.string().valid('online', 'pending_review', 'archived', 'sold', 'draft').optional(),
    existingImageUrls: Joi.string().optional().allow(''), // Pour gérer les images existantes à conserver
}).min(1).messages({ // Au moins un champ doit être fourni pour une mise à jour
    'object.min': 'Au moins un champ doit être fourni pour la mise à jour.',
})
.when(Joi.object({ latitude: Joi.exist(), longitude: Joi.exist() }).unknown(), { // Si latitude ET longitude sont fournies
    then: Joi.object({
        latitude: Joi.required(), // Les rendre requises ensemble
        longitude: Joi.required()
    })
})
.when(Joi.object({ latitude: Joi.exist() }).unknown(), { // Si latitude est fournie mais pas longitude
    then: Joi.object({ longitude: Joi.required().messages({ 'any.required': 'La longitude est requise si la latitude est fournie.' }) })
})
.when(Joi.object({ longitude: Joi.exist() }).unknown(), { // Si longitude est fournie mais pas latitude
    then: Joi.object({ latitude: Joi.required().messages({ 'any.required': 'La latitude est requise si la longitude est fournie.' }) })
});


// Schéma pour l'envoi de message texte
const createMessageSchema = Joi.object({
    threadId: Joi.string().hex().length(24).optional(),
    recipientId: Joi.string().hex().length(24).optional(),
    adId: Joi.string().hex().length(24).when('threadId', {
        is: Joi.exist(),
        then: Joi.optional(),
        otherwise: Joi.required()
    }),
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
