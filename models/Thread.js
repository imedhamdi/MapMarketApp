// /models/Thread.js
import mongoose from 'mongoose';

const threadSchema = new mongoose.Schema({
  participants: [{ // Les utilisateurs participant à la discussion
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  }],
  // Optionnel: Contexte de la discussion (ex: lié à une annonce spécifique)
  itemContext: {
    type: mongoose.Schema.ObjectId,
    ref: 'Item',
    required: false // Une discussion peut exister sans être liée à un item spécifique
  },
  lastMessage: { // Référence au dernier message pour un affichage rapide et le tri
    type: mongoose.Schema.ObjectId,
    ref: 'Message'
  },
  // Pour chaque participant, stocker quand il a lu le thread pour la dernière fois
  // Cela permet de gérer les messages non lus par participant.
  // Exemple: { userId1: Date, userId2: Date }
  // Ou une approche plus simple avec un compteur de messages non lus par utilisateur dans le thread.
  // Pour la simplicité et la conformité avec le frontend qui semble attendre un `unreadCount` par thread (pour l'utilisateur courant),
  // on pourrait stocker cela différemment ou le calculer dynamiquement.
  // Ici, on va se concentrer sur la structure de base.
  // La gestion des "non-lus" sera affinée dans les contrôleurs et la logique Socket.IO.

  // Unread counts per participant (key is userId, value is count)
  // This is an alternative to lastReadByParticipant
  unreadCounts: {
    type: Map,
    of: Number,
    default: {}
  }
}, {
  timestamps: true // createdAt (début de la discussion), updatedAt (dernier message ou activité)
});

// Assurer que les participants sont toujours stockés dans un ordre défini (ex: triés par ID)
// pour éviter les doublons de threads avec les mêmes participants dans un ordre différent.
// Ou utiliser un index unique combiné.
threadSchema.index({ participants: 1 }); // Index sur les participants
threadSchema.index({ "timestamps.updatedAt": -1 }); // Pour trier les threads par la dernière activité

// Méthode pour s'assurer que les participants sont uniques et triés pour éviter les doublons
// threadSchema.pre('save', function(next) {
//   if (this.isModified('participants')) {
//     this.participants.sort(); // Trier les IDs pour la cohérence
//   }
//   next();
// });
// Alternative: un index unique composé sur les participants (plus robuste)
// threadSchema.index({ participants: 1 }, { unique: true, partialFilterExpression: { participants: { $size: 2 } } });
// La création d'un index unique sur un tableau nécessite une attention particulière.
// Une approche commune est de créer une clé composite des ID participants triés.

const Thread = mongoose.model('Thread', threadSchema);

export default Thread;
