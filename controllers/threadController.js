const Thread = require('../models/threadModel');
const Message = require('../models/messageModel');
const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');

/**
 * @desc    Récupère le nombre total de discussions non lues pour l'utilisateur actuel.
 * @route   GET /api/threads/unread-count
 * @access  Privé
 */
exports.getUnreadThreadsCount = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // 1. Récupérer les IDs des threads où l'utilisateur est participant
        const threads = await Thread.find({ participants: { $elemMatch: { user: userId } } }).select('_id');
        if (threads.length === 0) {
            return res.status(200).json({ count: 0 });
        }
        const threadIds = threads.map(t => t._id);

        // 2. Compter les threads ayant au moins un message non lu
        const unreadThreads = await Message.distinct('threadId', {
            threadId: { $in: threadIds },
            senderId: { $ne: userId },
            status: { $ne: 'read' }
        });

        res.status(200).json({ count: unreadThreads.length });
    } catch (error) {
        next(error);
    }
};

// Récupérer tous les threads visibles pour l'utilisateur
exports.getAllThreads = async (req, res, next) => {
    try {
        const threads = await Thread.find({
            'participants.user': req.user.id,
            deletedBy: { $ne: req.user.id }
        }).sort('-updatedAt');
        res.status(200).json({ success: true, data: { threads } });
    } catch (error) {
        next(error);
    }
};

// Créer un thread ou restaurer s'il était supprimé pour l'utilisateur
exports.createThread = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { recipientId, adId, firstMessage } = req.body;
        const participants = [req.user.id, recipientId];

        const thread = await Thread.create([
            {
                participants: participants.map(id => ({ user: id })),
                ad: adId || null
            }
        ], { session });

        const sanitizedFirst = firstMessage ? sanitizeHtml(firstMessage, { allowedTags: [], allowedAttributes: {} }) : '';

        const message = await Message.create([
            {
                threadId: thread[0]._id,
                senderId: req.user.id,
                text: sanitizedFirst
            }
        ], { session });

        await session.commitTransaction();
        session.endSession();

        const populatedThread = await Thread.findById(thread[0]._id);
        res.status(201).json({ success: true, data: { thread: populatedThread, message: message[0] } });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
};

// Soft delete d'un thread pour l'utilisateur
exports.deleteThread = async (req, res, next) => {
    try {
        const thread = await Thread.findById(req.params.id);
        if (!thread) return res.status(404).json({ message: 'Thread non trouvé' });
        const isParticipant = thread.participants.some(p => p.user.toString() === req.user.id);
        if (!isParticipant) return res.status(403).json({ message: 'Action non autorisée' });
        await Thread.findByIdAndUpdate(req.params.id, {
            $addToSet: { deletedBy: req.user.id }
        });
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

