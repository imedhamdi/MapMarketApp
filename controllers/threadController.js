const Thread = require('../models/threadModel');
const Message = require('../models/messageModel');
const Ad = require('../models/adModel');
const { AppError } = require('../middlewares/errorHandler');

const asyncHandler = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

/**
 * Crée ou récupère un thread pour une annonce spécifique.
 * L'utilisateur connecté devient l'acheteur.
 */
exports.createOrGetThread = asyncHandler(async (req,res,next)=>{
    const buyerId = req.user.id;
    const { adId } = req.body;
    if(!adId) return next(new AppError('adId requis',400));
    const ad = await Ad.findById(adId).select('seller');
    if(!ad) return next(new AppError('Annonce introuvable',404));
    const sellerId = ad.seller.toString();

    let thread = await Thread.findOne({
        ad: adId,
        'participants.user': { $all: [buyerId, sellerId] },
        participants: { $size: 2 }
    });

    if(!thread){
        thread = await Thread.create({
            participants:[{user:buyerId},{user:sellerId}],
            ad: adId
        });
    }

    thread = await Thread.findById(thread._id)
        .populate('participants.user','name avatarUrl')
        .populate('ad');

    res.status(200).json({ success:true, data:{ thread }});
});

/**
 * Récupère les threads de l'utilisateur courant avec dernier message et nombre de messages non lus.
 */
exports.getThreadsForUser = asyncHandler(async (req,res,next)=>{
    const userId = req.user.id;
    const threads = await Thread.find({ 'participants.user': userId })
        .populate('participants.user','name avatarUrl')
        .populate('ad');

    const data = await Promise.all(threads.map(async t=>{
        const lastMessage = await Message.findOne({ threadId:t._id }).sort({createdAt:-1});
        const unread = await Message.countDocuments({ threadId:t._id, senderId:{ $ne:userId }, status:{ $ne:'read' } });
        return { ...t.toObject(), lastMessage, unreadCount: unread };
    }));

    res.status(200).json({ success:true, data:{ threads: data }});
});

