// models/adModel.js
const mongoose = require('mongoose');
const User = require('./userModel'); // Pour la référence à l'utilisateur

const adSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Le titre de l\'annonce est requis.'],
        trim: true,
        minlength: [5, 'Le titre doit comporter au moins 5 caractères.'],
        maxlength: [100, 'Le titre ne doit pas dépasser 100 caractères.'],
    },
    description: {
        type: String,
        required: [true, 'La description de l\'annonce est requise.'],
        trim: true,
        minlength: [10, 'La description doit comporter au moins 10 caractères.'],
        maxlength: [2000, 'La description ne doit pas dépasser 2000 caractères.'], // Augmenté par rapport au frontend pour plus de flexibilité
    },
    price: {
        type: Number,
        required: [true, 'Le prix est requis.'],
        min: [0, 'Le prix ne peut pas être négatif.'],
    },
    currency: {
        type: String,
        required: [true, 'La devise est requise.'],
        default: 'EUR',
        uppercase: true,
        trim: true,
        maxlength: 3
    },
    category: {
        type: String, // Ou mongoose.Schema.ObjectId si vous avez un modèle Category
        required: [true, 'La catégorie est requise.'],
        // enum: ['immobilier', 'vehicules', 'electronique', ...], // Si vous avez une liste fixe et pas un modèle séparé
    },
    imageUrls: [{ // Tableau d'URLs pour les images de l'annonce
        type: String,
        trim: true,
        // validate: [validator.isURL, 'Veuillez fournir une URL d'image valide.'] // Si vous stockez des URL directes
    }],
    // Géolocalisation
    location: {
        type: {
            type: String,
            default: 'Point',
            enum: ['Point'], // 'location.type' must be 'Point'
        },
        coordinates: { // [longitude, latitude] - Important: longitude en premier pour GeoJSON
            type: [Number],
            required: [true, 'Les coordonnées de localisation sont requises.'],
        },
        address: { // Adresse textuelle pour affichage
            type: String,
            trim: true,
        },
    },
    userId: { // L'utilisateur qui a posté l'annonce
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Une annonce doit appartenir à un utilisateur.'],
    },
    status: {
        type: String,
        enum: ['online', 'pending_review', 'archived', 'deleted', 'sold', 'draft'],
        default: 'pending_review', // Ou 'draft' si vous voulez une étape de brouillon
    },
    // Champs pour la mise en avant (bonus)
    isHighlighted: {
        type: Boolean,
        default: false,
    },
    isPremium: { // Pourrait être un type plus complexe avec une date d'expiration
        type: Boolean,
        default: false,
    },
    premiumExpiresAt: {
        type: Date,
    },
    // Statistiques optionnelles (peuvent être calculées ou dénormalisées)
    viewCount: {
        type: Number,
        default: 0,
    },
    favoriteCount: { // Nombre de fois où cette annonce a été mise en favori
        type: Number,
        default: 0,
    }
}, {
    timestamps: true, // Ajoute createdAt et updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Index géospatial pour les requêtes de proximité
// Important: MongoDB nécessite un index 2dsphere pour les requêtes géo $near, $geoWithin, etc.
adSchema.index({ location: '2dsphere' });

// Index pour la recherche texte (exemple sur titre et description)
adSchema.index({ title: 'text', description: 'text' });

// Populate le champ `userId` avec les informations de l'utilisateur (nom, avatar)
// lors des requêtes find. Utile pour afficher les infos du vendeur avec l'annonce.
// Nécessite le plugin mongoose-autopopulate ou une population manuelle dans les contrôleurs.
// Pour l'instant, on le commente et on fera la population manuellement si besoin.
// adSchema.pre(/^find/, function(next) {
//   this.populate({
//     path: 'userId',
//     select: 'name avatarUrl' // Sélectionner uniquement les champs nécessaires
//   });
//   next();
// });

// Méthode pour vérifier si l'annonce est modifiable/supprimable par un utilisateur donné
adSchema.methods.isOwner = function(userId) {
    return this.userId.toString() === userId.toString();
};


const Ad = mongoose.model('Ad', adSchema);

module.exports = Ad;
