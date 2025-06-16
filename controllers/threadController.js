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

