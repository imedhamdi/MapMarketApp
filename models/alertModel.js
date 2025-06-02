// models/alertModel.js
const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Une alerte doit appartenir à un utilisateur.'],
        index: true,
    },
    keywords: {
        type: String,
        required: [true, 'Les mots-clés sont requis pour une alerte.'],
        trim: true,
        minlength: [3, 'Les mots-clés doivent comporter au moins 3 caractères.'],
        maxlength: [100, 'Les mots-clés ne doivent pas dépasser 100 caractères.'],
    },
    category: { // ID de la catégorie
        type: String, // Ou mongoose.Schema.ObjectId si vous avez un modèle Category séparé
        trim: true,
        default: null, // null ou vide signifie "toutes les catégories"
    },
    priceMin: {
        type: Number,
        min: [0, 'Le prix minimum ne peut pas être négatif.'],
        default: null,
    },
    priceMax: {
        type: Number,
        min: [0, 'Le prix maximum ne peut pas être négatif.'],
        default: null,
        validate: {
            validator: function(value) {
                // priceMax doit être >= priceMin si les deux sont définis
                if (this.priceMin !== null && value !== null) {
                    return value >= this.priceMin;
                }
                return true;
            },
            message: 'Le prix maximum doit être supérieur ou égal au prix minimum.'
        }
    },
    // Localisation de référence pour l'alerte (centre de la zone de recherche)
    location: {
        type: {
            type: String,
            default: 'Point',
            enum: ['Point'],
        },
        coordinates: { // [longitude, latitude]
            type: [Number],
            required: [true, 'Les coordonnées du centre de l\'alerte sont requises.'],
        },
        // address: String, // Adresse textuelle optionnelle du centre de l'alerte
    },
    radius: { // Rayon de recherche en kilomètres
        type: Number,
        required: [true, 'Le rayon de recherche est requis.'],
        min: [1, 'Le rayon minimum est de 1 km.'],
        max: [200, 'Le rayon maximum est de 200 km.'], // Limite configurable
    },
    isActive: { // L'utilisateur peut désactiver une alerte sans la supprimer
        type: Boolean,
        default: true,
    },
    lastNotificationSentAt: { // Pour éviter de spammer l'utilisateur
        type: Date,
    },
    // Fréquence de notification préférée par l'utilisateur pour cette alerte (ex: 'immediate', 'daily_digest')
    // notificationFrequency: {
    //     type: String,
    //     enum: ['immediate', 'daily', 'weekly'],
    //     default: 'immediate',
    // }
}, {
    timestamps: true, // Ajoute createdAt et updatedAt
});

// Index pour récupérer rapidement les alertes actives d'un utilisateur
alertSchema.index({ userId: 1, isActive: 1, updatedAt: -1 });

// Index géospatial pour trouver les alertes dont la zone contient une nouvelle annonce
// Utile si on veut notifier les créateurs d'alertes quand une annonce est postée dans leur zone.
// Cependant, la logique la plus courante est de vérifier les annonces par rapport aux critères de l'alerte.
// Un index sur `location` est utile pour les alertes elles-mêmes si on veut les afficher sur une carte.
alertSchema.index({ location: '2dsphere' });


// Validation pour s'assurer que priceMax >= priceMin est redondante si déjà dans le champ,
// mais peut être ajoutée ici en pre-save si nécessaire pour des logiques plus complexes.
// alertSchema.pre('save', function(next) {
//     if (this.priceMin != null && this.priceMax != null && this.priceMax < this.priceMin) {
//         return next(new Error('Le prix maximum ne peut pas être inférieur au prix minimum.'));
//     }
//     next();
// });

const Alert = mongoose.model('Alert', alertSchema);

module.exports = Alert;
