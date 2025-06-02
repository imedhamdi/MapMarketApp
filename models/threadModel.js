// models/threadModel.js
const mongoose = require('mongoose');

const threadSchema = new mongoose.Schema({
    participants: [{
        user: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true,
        },
        unreadCount: { // Nombre de messages non lus pour cet utilisateur dans ce thread
            type: Number,
            default: 0,
        },
        hasArchived: { // Si cet utilisateur a archivé ce thread
            type: Boolean,
            default: false,
        },
        locallyDeletedAt: { // Date à laquelle cet utilisateur a "supprimé" localement le thread
            type: Date,
        },
        // On pourrait ajouter ici un 'joinedAt' si les participants peuvent être ajoutés/retirés dynamiquement
    }],
    ad: { // L'annonce à laquelle ce thread est potentiellement lié
        type: mongoose.Schema.ObjectId,
        ref: 'Ad',
        required: false, // Un thread peut exister sans être lié à une annonce (discussion directe)
    },
    lastMessage: {
        text: String,
        sender: { type: mongoose.Schema.ObjectId, ref: 'User' },
        createdAt: Date,
        imageUrl: String, // Si le dernier message est une image
    },
    // createdBy: { // Optionnel: qui a initié le thread, si pertinent
    //     type: mongoose.Schema.ObjectId,
    //     ref: 'User',
    // },
}, {
    timestamps: true, // Ajoute createdAt (date de création du thread) et updatedAt (date du dernier message)
});

// Index pour retrouver rapidement les threads d'un utilisateur
threadSchema.index({ 'participants.user': 1, updatedAt: -1 });
// Index pour les threads liés à une annonce
threadSchema.index({ ad: 1, 'participants.user': 1 });


// Middleware pour mettre à jour `updatedAt` lors de la sauvegarde (déjà géré par timestamps:true)
// Mais on pourrait vouloir mettre à jour `updatedAt` spécifiquement quand un nouveau message est ajouté
// via une méthode sur le modèle ou dans le contrôleur.

// Méthode pour trouver ou créer un thread entre deux utilisateurs (et potentiellement une annonce)
threadSchema.statics.findOrCreateThread = async function(userId1, userId2, adId = null) {
    // Normaliser l'ordre des IDs pour éviter les doublons de threads (ex: userA-userB vs userB-userA)
    const participantsIds = [userId1, userId2].sort();

    let query = {
        'participants.user': { $all: participantsIds },
        'participants': { $size: 2 } // S'assurer qu'il n'y a que ces deux participants
    };

    if (adId) {
        query.ad = adId;
    } else {
        query.ad = null; // Pour les discussions directes non liées à une annonce
    }

    let thread = await this.findOne(query);

    if (!thread) {
        thread = await this.create({
            participants: [
                { user: participantsIds[0], unreadCount: 0 },
                { user: participantsIds[1], unreadCount: 0 }
            ],
            ad: adId || null,
        });
    }
    return thread;
};


const Thread = mongoose.model('Thread', threadSchema);

module.exports = Thread;
