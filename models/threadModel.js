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
        required: true,
    },
    hiddenFor: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }],
    deletedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
}, {
    timestamps: true,
});

// ✅ Index optimisé pour la recherche par participants + annonce
threadSchema.index({ 'participants.user': 1, ad: 1 }); // <= à ajouter
threadSchema.index({ 'participants.user': 1, updatedAt: -1 });
threadSchema.index({ ad: 1, 'participants.user': 1 });

// Empêche la création de doublons : un seul thread par annonce et participants
threadSchema.pre('save', async function(next) {
    if (!this.isNew) return next();
    try {
        const participantIds = this.participants.map(p => p.user.toString()).sort();
        const existing = await this.constructor.findOne({
            ad: this.ad,
            'participants.user': { $all: participantIds },
            participants: { $size: participantIds.length }
        });
        if (existing) {
            return next(new Error('Thread already exists for these users and ad'));
        }
        next();
    } catch (err) {
        next(err);
    }
});

threadSchema.pre(/^find/, function(next) {
    this.populate('participants.user', 'name avatarUrl isOnline lastSeen')
        .populate('ad', 'title imageUrls price')
        .populate({
            path: 'lastMessage',
            select: 'text senderId createdAt status'
        });
    next();
});

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
