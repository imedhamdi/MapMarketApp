// /models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto'; // Pour générer des tokens (reset password, email verification)
import validator from 'validator'; // Pour la validation d'email

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Le nom d'utilisateur est requis."],
    unique: true,
    trim: true,
    minlength: [3, "Le nom d'utilisateur doit contenir au moins 3 caractères."],
    maxlength: [30, "Le nom d'utilisateur ne peut pas dépasser 30 caractères."]
  },
  email: {
    type: String,
    required: [true, "L'adresse e-mail est requise."],
    unique: true,
    lowercase: true, // Toujours stocker les emails en minuscules
    trim: true,
    validate: [validator.isEmail, "Veuillez fournir une adresse e-mail valide."]
  },
  password: {
    type: String,
    required: [true, "Le mot de passe est requis."],
    minlength: [6, "Le mot de passe doit contenir au moins 6 caractères."],
    select: false // Ne pas retourner le mot de passe par défaut lors des requêtes
  },
  avatarUrl: {
    type: String,
    default: '' // Peut être une URL vers un service d'avatar par défaut ou une image locale/Cloudinary
  },
  // Champs pour la vérification d'email
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  // Champs pour la réinitialisation du mot de passe
  passwordResetToken: String,
  passwordResetExpires: Date,
  passwordChangedAt: Date, // Pour invalider les anciens tokens JWT après un changement de mot de passe
  // Rôles (si vous prévoyez une gestion des rôles plus avancée)
  // role: {
  //   type: String,
  //   enum: ['user', 'admin'],
  //   default: 'user'
  // },
  // Évaluation du vendeur (exemple simple)
  rating: {
    score: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true, // Ajoute createdAt et updatedAt automatiquement
  toJSON: { virtuals: true }, // Permet d'inclure les champs virtuels lors de la conversion en JSON
  toObject: { virtuals: true }
});

// Middleware Mongoose: Hacher le mot de passe avant de sauvegarder l'utilisateur
userSchema.pre('save', async function(next) {
  // Ne hacher le mot de passe que s'il a été modifié (ou est nouveau)
  if (!this.isModified('password')) return next();

  // Hacher le mot de passe avec un coût de 12 (plus élevé = plus sûr mais plus lent)
  this.password = await bcrypt.hash(this.password, 12);

  // Supprimer le champ passwordConfirm s'il existe (non utilisé ici mais bonne pratique)
  // this.passwordConfirm = undefined; 
  next();
});

// Middleware Mongoose: Mettre à jour passwordChangedAt lors de la modification du mot de passe
userSchema.pre('save', function(next) {
  if (!this.isModified('password') || this.isNew) return next();
  this.passwordChangedAt = Date.now() - 1000; // -1s pour s'assurer que le token est créé après
  next();
});

// Méthode d'instance: Vérifier si le mot de passe fourni correspond au mot de passe haché
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Méthode d'instance: Vérifier si le mot de passe a été changé après l'émission du token JWT
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false; // Le mot de passe n'a jamais été changé
};

// Méthode d'instance: Créer un token de réinitialisation de mot de passe
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Le token expire dans 10 minutes
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; 

  return resetToken; // Retourner le token non haché à envoyer à l'utilisateur
};

// Méthode d'instance: Créer un token de vérification d'email
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');

  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  // Le token expire dans 24 heures
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;

  return verificationToken; // Retourner le token non haché
};


const User = mongoose.model('User', userSchema);

export default User;
