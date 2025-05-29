// /models/Message.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  threadId: { // La discussion à laquelle ce message appartient
    type: mongoose.Schema.ObjectId,
    ref: 'Thread',
    required: [true, "L'identifiant de la discussion est requis."]
  },
  senderId: { // L'utilisateur qui a envoyé le message
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, "L'expéditeur est requis."]
  },
  receiverId: { // L'utilisateur qui doit recevoir le message (utile pour les notifications)
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, "Le destinataire est requis."]
  },
  text: {
    type: String,
    trim: true,
    required: [true, "Le contenu du message ne peut pas être vide."]
  },
  isRead: { // Statut de lecture du message (par le destinataire)
    type: Boolean,
    default: false
  },
  // Optionnel: si le message a été "supprimé doucement" par l'un des utilisateurs
  // deletedBy: [{
  //   userId: { type: mongoose.Schema.ObjectId, ref: 'User' },
  //   deletedAt: { type: Date, default: Date.now }
  // }]
}, {
  timestamps: true // createdAt (quand le message a été envoyé)
});

messageSchema.index({ threadId: 1 });
messageSchema.index({ "timestamps.createdAt": -1 }); // Pour trier les messages dans un thread

// Après avoir sauvegardé un nouveau message, mettre à jour le champ `lastMessage`
// et `updatedAt` du Thread parent, et potentiellement les compteurs de non-lus.
messageSchema.post('save', async function(doc, next) {
  try {
    const Thread = mongoose.model('Thread'); // Accéder au modèle Thread
    const thread = await Thread.findById(doc.threadId);
    if (thread) {
      thread.lastMessage = doc._id;
      thread.updatedAt = Date.now(); // Forcer la mise à jour pour le tri des threads

      // Mettre à jour les compteurs de messages non lus
      // Le destinataire du message (receiverId) a un nouveau message non lu.
      const receiverIdStr = doc.receiverId.toString();
      thread.unreadCounts = thread.unreadCounts || new Map(); // S'assurer que c'est initialisé
      const currentUnread = thread.unreadCounts.get(receiverIdStr) || 0;
      thread.unreadCounts.set(receiverIdStr, currentUnread + 1);
      
      // Marquer la modification pour que Mongoose la sauvegarde
      thread.markModified('unreadCounts'); 
      await thread.save();
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour du thread après sauvegarde du message:", error);
    // Ne pas bloquer le flux à cause de cette erreur post-sauvegarde
  }
  next();
});


const Message = mongoose.model('Message', messageSchema);

export default Message;
