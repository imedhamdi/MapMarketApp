// models/threadModel.js
const mongoose = require('mongoose');

const threadSchema = new mongoose.Schema({
    participants: [{
        user: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true,
        },
        unreadCount: {
            type: Number,
            default: 0,
        },
        hasArchived: {
            type: Boolean,
            default: false,
        },
        locallyDeletedAt: {
            type: Date,
        },
    }],
    ad: {
        type: mongoose.Schema.ObjectId,
        ref: 'Ad',
        required: false,
    },
    lastMessage: {
        text: String,
        sender: { type: mongoose.Schema.ObjectId, ref: 'User' },
        createdAt: Date,
        imageUrl: String,
    },
}, {
    timestamps: true,
});

// ✅ Index optimisé pour la recherche par participants + annonce
threadSchema.index({ 'participants.user': 1, ad: 1 }); // <= à ajouter
threadSchema.index({ 'participants.user': 1, updatedAt: -1 });
threadSchema.index({ ad: 1, 'participants.user': 1 });

/**
 * ✅ Trouve ou crée un thread entre deux utilisateurs, strictement lié à une annonce donnée (ou sans annonce).
 * Garantit qu’un couple user1/user2 aura un thread différent par annonce.
 * @param {string|ObjectId} userId1 - Premier utilisateur
 * @param {string|ObjectId} userId2 - Deuxième utilisateur
 * @param {string|ObjectId|null} adId - L'ID de l'annonce (peut être null pour discussion libre)
 * @returns {Promise<Thread>} - Le thread trouvé ou créé
 */
threadSchema.statics.findOrCreateThread = async function(userId1, userId2, adId = null) {
    const [id1, id2] = [userId1.toString(), userId2.toString()].sort();
    const participantsQuery = { $all: [id1, id2] };

    const query = {
        'participants.user': participantsQuery,
        'participants': { $size: 2 },
        ad: adId ? new mongoose.Types.ObjectId(adId) : { $exists: false }
    };

    let thread = await this.findOne(query);

    if (!thread) {
        thread = await this.create({
            participants: [
                { user: id1, unreadCount: 0 },
                { user: id2, unreadCount: 0 }
            ],
            ad: adId || null
        });
    }

    return thread;
};

const Thread = mongoose.model('Thread', threadSchema);

module.exports = Thread;
