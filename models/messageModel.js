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
        type: mongoose.Schema.Types.Mixed,
        validate: {
            validator: function(v) {
                if (this.type === 'offer') {
                    return v && typeof v.amount === 'number' && v.currency &&
                        ['pending','accepted','declined'].includes(v.status);
                }
                if (this.type === 'appointment') {
                    return v && v.date && v.location !== undefined &&
                        ['pending','confirmed','cancelled','canceled'].includes(v.status);
                }
                return true;
            },
            message: 'Métadonnées invalides pour ce type de message.'
        }
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
messageSchema.post('save', function(doc, next) {
    // Appel immédiat de next() pour ne pas bloquer le contrôleur
    next();

    // Lancement des opérations de mise à jour en arrière-plan sans attendre la fin
    (async () => {
        try {
            const Thread = mongoose.model('Thread'); // Éviter les problèmes d'import circulaire
            const User = mongoose.model('User');

            const thread = await Thread.findById(doc.threadId);
            if (thread) {
                // La logique de mise à jour du thread reste la même
                thread.lastMessage = {
                    text: doc.text,
                    sender: doc.senderId,
                    createdAt: doc.createdAt,
                    imageUrl: doc.imageUrl,
                };
                thread.updatedAt = doc.createdAt;

                thread.participants.forEach(participant => {
                    if (participant.user.toString() !== doc.senderId.toString()) {
                        participant.unreadCount = (participant.unreadCount || 0) + 1;
                    }
                    if (participant.locallyDeletedAt) {
                        participant.locallyDeletedAt = undefined;
                    }
                });

                await thread.save();
                // Note : L'émission Socket.IO sera maintenant gérée par le contrôleur.
            }
        } catch (error) {
            // Logguer l'erreur de la tâche de fond sans impacter la réponse à l'utilisateur
            console.error("Erreur dans le post-save hook (tâche de fond) de Message pour mettre à jour le Thread:", error);
        }
    })();
});


const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
