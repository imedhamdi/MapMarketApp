// /models/Favorite.js
import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema({
  user: { // L'utilisateur qui a mis l'article en favori
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, "L'utilisateur est requis pour un favori."]
  },
  item: { // L'article (annonce ou alerte) mis en favori
    type: mongoose.Schema.ObjectId,
    ref: 'Item',
    required: [true, "L'article est requis pour un favori."]
  }
}, {
  timestamps: true // Ajoute createdAt (quand le favori a été ajouté)
});

// Assurer qu'un utilisateur ne peut pas mettre en favori le même article plusieurs fois
favoriteSchema.index({ user: 1, item: 1 }, { unique: true });

// Populer l'utilisateur et l'article lors des requêtes find
// favoriteSchema.pre(/^find/, function(next) {
//   this.populate({
//     path: 'user',
//     select: 'username avatarUrl' // Sélectionner uniquement les champs nécessaires
//   }).populate({
//     path: 'item',
//     // select: 'title price images category type ...' // Sélectionner les champs de l'item à afficher
//   });
//   next();
// });
// Note: Le populate ci-dessus peut être lourd pour certaines requêtes.
// Il est souvent préférable de le faire explicitement dans les contrôleurs quand c'est nécessaire.

const Favorite = mongoose.model('Favorite', favoriteSchema);

export default Favorite;
