// models/messageModel.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    threadId: {
        type: mongoose.Schema.ObjectId,
        ref: 'Thread',
        required: [true, 'Un message doit appartenir à un thread.'],
        index: true, // Index pour récupérer rapidement les messages d'un thread
    },
    senderId: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Un message doit avoir un expéditeur.'],
    },
    // recipientId est implicitement l'autre/les autres participant(s) du thread.
    // On pourrait l'ajouter pour des requêtes directes si nécessaire, mais ce n'est pas standard pour les threads.
    // recipientId: {
    //     type: mongoose.Schema.ObjectId,
    //     ref: 'User',
    //     required: true,
    // },
    type: {
        type: String,
        enum: ['text', 'image', 'offer', 'appointment', 'location', 'system'],
        default: 'text'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    text: {
        type: String,
        trim: true,
        validate: {
            validator: function(v) {
                if (this.type && this.type !== 'text') return true;
                return v || this.imageUrl;
            },
            message: 'Un message doit contenir du texte ou une image.'
        }
    },
    imageUrl: {
        type: String,
        trim: true,
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'failed_to_send'], // Statuts possibles
        default: 'sent',
    },
    // Pour la suppression "pour moi"
    // Stocke les IDs des utilisateurs pour qui ce message est "supprimé"
    // Si un message est supprimé "pour tous", on pourrait le marquer différemment (ex: texte remplacé, statut 'deleted_for_all')
    deletedFor: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User',
    }],
    isDeletedGlobally: { // Si le message a été supprimé "pour tous" par l'expéditeur
        type: Boolean,
        default: false,
    },
    // Pour le signalement
    isReported: {
        type: Boolean,
        default: false,
    },
    // reportDetails: { // Si vous voulez stocker plus d'infos sur le signalement
    //     reportedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    //     reason: String,
    //     reportedAt: Date,
    // }
}, {
    timestamps: true, // Ajoute createdAt (quand le message a été envoyé) et updatedAt
});

// Index pour trier les messages par date de création dans un thread
messageSchema.index({ threadId: 1, createdAt: -1 });

// Après qu'un message est sauvegardé, mettre à jour le champ `lastMessage` et `updatedAt` du Thread parent.
// Et potentiellement incrémenter le `unreadCount` pour le(s) destinataire(s).
messageSchema.post('save', async function(doc, next) {
    try {
        const Thread = mongoose.model('Thread'); // Éviter les problèmes d'import circulaire
        const User = mongoose.model('User'); // Pour les infos de l'expéditeur

        const thread = await Thread.findById(doc.threadId);
        if (thread) {
            const sender = await User.findById(doc.senderId).select('name avatarUrl'); // Pour lastMessage

            thread.lastMessage = {
                text: doc.text,
                sender: doc.senderId, // ou sender si vous voulez l'objet complet
                createdAt: doc.createdAt,
                imageUrl: doc.imageUrl,
            };
            thread.updatedAt = doc.createdAt; // Mettre à jour pour le tri des threads

            // Incrémenter le compteur de messages non lus pour les autres participants
            thread.participants.forEach(participant => {
                if (participant.user.toString() !== doc.senderId.toString()) {
                    participant.unreadCount = (participant.unreadCount || 0) + 1;
                }
                // Réinitialiser locallyDeletedAt si un nouveau message arrive dans un thread "supprimé" localement
                if (participant.locallyDeletedAt) {
                    participant.locallyDeletedAt = undefined;
                }
            });

            await thread.save();
        }
    } catch (error) {
        console.error("Erreur dans le post-save hook de Message pour mettre à jour le Thread:", error);
        // Ne pas bloquer le flux principal si ce hook échoue, mais logger l'erreur.
    }
    next();
});


const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
