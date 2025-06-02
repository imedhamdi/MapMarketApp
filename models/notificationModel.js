// models/notificationModel.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { // L'utilisateur qui reçoit la notification
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Une notification doit être destinée à un utilisateur.'],
        index: true,
    },
    title: {
        type: String,
        required: [true, 'Le titre de la notification est requis.'],
        trim: true,
        maxlength: [150, 'Le titre ne doit pas dépasser 150 caractères.'],
    },
    body: { // Le message principal de la notification
        type: String,
        required: [true, 'Le corps de la notification est requis.'],
        trim: true,
        maxlength: [500, 'Le corps ne doit pas dépasser 500 caractères.'],
    },
    type: { // Type de notification pour un traitement/affichage différent côté client
        type: String,
        enum: [
            'new_message',
            'ad_alert_match', // Une annonce correspond à une alerte de l'utilisateur
            'favorite_price_drop', // Le prix d'un favori a baissé (exemple)
            'offer_received', // Offre reçue pour une annonce de l'utilisateur
            'ad_approved',
            'ad_rejected',
            'system_update',
            'welcome',
            'password_reset_success',
            'email_verified_success',
            // Ajoutez d'autres types selon les besoins
        ],
        required: [true, 'Le type de notification est requis.'],
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    readAt: {
        type: Date,
    },
    icon: { // URL d'une icône spécifique pour la notification (optionnel)
        type: String,
        trim: true,
    },
    data: { // Données supplémentaires, par exemple pour la redirection
        url: String, // URL vers laquelle rediriger l'utilisateur au clic
        adId: { type: mongoose.Schema.ObjectId, ref: 'Ad' },
        threadId: { type: mongoose.Schema.ObjectId, ref: 'Thread' },
        // ... autres IDs ou données pertinentes
    },
    // Pour les notifications push, on pourrait stocker des infos sur l'envoi
    // sentVia: {
    //     type: String,
    //     enum: ['in_app', 'push', 'email'],
    //     default: 'in_app'
    // }
}, {
    timestamps: true, // Ajoute createdAt et updatedAt
});

// Index pour récupérer et trier rapidement les notifications d'un utilisateur
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });


// Méthode d'instance pour marquer comme lue
notificationSchema.methods.markAsRead = async function() {
    if (!this.isRead) {
        this.isRead = true;
        this.readAt = Date.now();
        await this.save({ validateBeforeSave: false }); // Sauvegarder sans relancer les validateurs
    }
    return this;
};

// Méthode statique pour marquer plusieurs notifications comme lues
notificationSchema.statics.markMultipleAsRead = async function(userId, notificationIds) {
    return this.updateMany(
        { _id: { $in: notificationIds }, userId: userId, isRead: false },
        { $set: { isRead: true, readAt: Date.now() } }
    );
};

// Méthode statique pour marquer toutes les notifications d'un utilisateur comme lues
notificationSchema.statics.markAllAsReadForUser = async function(userId) {
    return this.updateMany(
        { userId: userId, isRead: false },
        { $set: { isRead: true, readAt: Date.now() } }
    );
};


const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
