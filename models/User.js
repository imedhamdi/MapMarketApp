// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Email invalide']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item'
  }],
  resetToken: String,
  resetTokenExpiration: {
    type: Date,
    validate: {
      validator: function(v) {
        return v > Date.now();
      },
      message: 'La date d\'expiration doit être dans le futur'
    }
  }
}, { timestamps: true });

// Hash du mot de passe avant sauvegarde
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Méthode pour comparer les mots de passe
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Générer un token de réinitialisation de mot de passe
userSchema.methods.generateResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  this.resetToken = hashedToken;
  this.resetTokenExpiration = Date.now() + 1000 * 60 * 10; // 10 minutes

  return resetToken; // retourne le token BRUT pour l'URL
};

// Middleware pour nettoyer les tokens expirés périodiquement
userSchema.statics.clearExpiredTokens = async function() {
  await this.updateMany(
    { resetTokenExpiration: { $lt: Date.now() } },
    { $set: { resetToken: null, resetTokenExpiration: null } }
  );
};

module.exports = mongoose.model('User', userSchema);