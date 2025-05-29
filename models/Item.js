// /models/Item.js
import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Le titre est requis."],
    trim: true,
    maxlength: [100, "Le titre ne peut pas dépasser 100 caractères."]
  },
  description: {
    type: String,
    required: [true, "La description est requise."],
    trim: true,
    maxlength: [1000, "La description ne peut pas dépasser 1000 caractères."]
  },
  type: { // 'annonce' ou 'alerte'
    type: String,
    required: true,
    enum: ['annonce', 'alerte'],
    default: 'annonce'
  },
  category: {
    type: String,
    required: [true, "La catégorie est requise."],
    // Vous pouvez utiliser un enum si vous avez une liste fixe de catégories backend
    // enum: ['immobilier', 'vehicules', 'emploi', 'mode', 'enfants', 'multimedia', 'maison', 'loisirs', 'videgrenier']
  },
  price: { // Pour les annonces
    type: Number,
    min: [0, "Le prix doit être positif."],
    // Requis conditionnellement si type === 'annonce' (géré au niveau du contrôleur/validation)
  },
  minPrice: { // Pour les alertes
    type: Number,
    min: [0, "Le prix minimum doit être positif."]
  },
  maxPrice: { // Pour les alertes
    type: Number,
    min: [0, "Le prix maximum doit être positif."],
    validate: { // S'assurer que maxPrice est supérieur ou égal à minPrice si les deux sont fournis
      validator: function(value) {
        return this.minPrice === undefined || value === undefined || value >= this.minPrice;
      },
      message: 'Le prix maximum doit être supérieur ou égal au prix minimum.'
    }
  },
  etat: { // Pour les annonces (Neuf, Très bon état, etc.)
    type: String,
    // enum: ['neuf', 'tres_bon_etat', 'bon_etat', 'satisfaisant', 'pour_pieces'],
    // Requis conditionnellement si type === 'annonce'
  },
  images: [{ // Pour les annonces, URLs des images (stockées localement ou sur Cloudinary)
    type: String 
  }],
  location: {
    // Type GeoJSON Point pour la géolocalisation
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: { // [longitude, latitude]
      type: [Number],
      required: [true, "Les coordonnées de localisation sont requises."]
    },
    // address: String, // Optionnel: adresse textuelle (peut être utile)
  },
  userId: { // Référence à l'utilisateur qui a créé l'item
    type: mongoose.Schema.ObjectId,
    ref: 'User', // Référence au modèle User
    required: [true, "L'identifiant de l'utilisateur est requis."]
  },
  // Champs pour la gestion (ex: statut de l'annonce)
  // status: {
  //   type: String,
  //   enum: ['active', 'sold', 'inactive', 'expired'],
  //   default: 'active'
  // },
  // viewCount: {
  //   type: Number,
  //   default: 0
  // }
}, {
  timestamps: true, // Ajoute createdAt et updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index géospatial pour les requêtes de proximité
itemSchema.index({ location: '2dsphere' });

// Index pour améliorer les performances des requêtes courantes
itemSchema.index({ userId: 1 });
itemSchema.index({ category: 1 });
itemSchema.index({ type: 1 });
itemSchema.index({ createdAt: -1 }); // Pour trier par les plus récents

// Avant de sauvegarder, s'assurer que les champs conditionnels sont bien gérés
// (par exemple, price pour 'annonce', minPrice/maxPrice pour 'alerte')
// Cela peut aussi être géré plus en amont dans la validation du contrôleur.
itemSchema.pre('save', function(next) {
  if (this.type === 'annonce') {
    this.minPrice = undefined;
    this.maxPrice = undefined;
    if (this.price === undefined || this.price === null) {
        // Vous pourriez vouloir une valeur par défaut ou une validation plus stricte ici
        // Pour l'instant, on laisse passer, la validation de schéma peut le gérer
    }
  } else if (this.type === 'alerte') {
    this.price = undefined;
    this.etat = undefined;
    this.images = []; // Les alertes n'ont pas d'images
  }
  next();
});


const Item = mongoose.model('Item', itemSchema);

export default Item;
