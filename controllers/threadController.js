const Thread = require('../models/threadModel');
const Message = require('../models/messageModel');

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
    try {
        const { recipientId, adId } = req.body;
        const participants = [req.user.id, recipientId];
        let thread = await Thread.findOne({
            'participants.user': { $all: participants },
            ad: adId || null
        });
        if (thread) {
            const index = thread.deletedBy.findIndex(id => id.toString() === req.user.id);
            if (index > -1) {
                thread.deletedBy.splice(index, 1);
                await thread.save({ validateBeforeSave: false });
            }
            return res.status(200).json({ success: true, data: { thread } });
        }
        thread = await Thread.create({
            participants: participants.map(id => ({ user: id })),
            ad: adId || null
        });
        res.status(201).json({ success: true, data: { thread } });
    } catch (error) {
        next(error);
    }
};

// Soft delete d'un thread pour l'utilisateur
exports.deleteThread = async (req, res, next) => {
    try {
        const thread = await Thread.findById(req.params.id);
        if (!thread) return res.status(404).json({ message: 'Thread non trouvé' });
        const isParticipant = thread.participants.some(p => {
            const id = p.user && p.user._id ? p.user._id.toString() : p.user.toString();
            return id === req.user.id;
        });
        if (!isParticipant) return res.status(403).json({ message: 'Action non autorisée' });
        await Thread.findByIdAndUpdate(req.params.id, {
            $addToSet: { deletedBy: req.user.id }
        });
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

