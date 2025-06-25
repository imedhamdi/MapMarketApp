// models/userModel.js
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto'); // Module natif de Node.js pour la génération de tokens

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Veuillez entrer votre nom.'],
        trim: true,
        maxlength: [50, 'Le nom ne doit pas dépasser 50 caractères.'],
    },
    email: {
        type: String,
        required: [true, 'Veuillez entrer votre adresse e-mail.'],
        unique: true,
        lowercase: true,
        trim: true,
        validate: [validator.isEmail, 'Veuillez fournir une adresse e-mail valide.'],
    },
    password: {
        type: String,
        required: [true, 'Veuillez entrer un mot de passe.'],
        minlength: [6, 'Le mot de passe doit comporter au moins 6 caractères.'],
        select: false, // Ne pas renvoyer le mot de passe par défaut dans les requêtes
    },
    passwordConfirm: { // Champ virtuel, ne sera pas sauvegardé en DB
        type: String,
        // Requis seulement à l'inscription ou si le mot de passe est modifié
        validate: {
            validator: function(el) {
                // 'this' pointe sur le document courant UNIQUEMENT lors de la création (User.create() ou new User().save())
                // Ne fonctionne pas sur User.findByIdAndUpdate() sauf si on utilise .save() après.
                return el === this.password;
            },
            message: 'Les mots de passe ne correspondent pas.',
        },
    },
    avatarUrl: {
        type: String,
        default: 'avatar-default.svg', // Ou une URL placeholder complète
    },
    isOnline: {
        type: Boolean,
        default: false
    },
    lastSeen: Date,
    role: {
        type: String,
        enum: ['user', 'admin', 'moderator'], // Définir les rôles possibles
        default: 'user',
    },
    isActive: { // Pour la désactivation de compte
        type: Boolean,
        default: true,
        select: false,
    },
    emailVerified: {
        type: Boolean,
        default: false,
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,

    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,

    favorites: [{ // Annonces mises en favori par l'utilisateur
        type: mongoose.Schema.ObjectId,
        ref: 'Ad', // Référence au modèle Ad (sera créé plus tard)
    }],
    blockedUsers: [{ // Utilisateurs que cet utilisateur a bloqués
        type: mongoose.Schema.ObjectId,
        ref: 'User',
    }],
    // isBlockedBy: [{ // Utilisateurs qui ont bloqué cet utilisateur - peut être géré différemment
    //     type: mongoose.Schema.ObjectId,
    //     ref: 'User',
    // }],

    // Préférences utilisateur
    settings: {
        darkMode: {
            type: Boolean,
            default: false, // Ou basé sur les préférences système au premier login
        },
        language: {
            type: String,
            enum: ['fr', 'en'],
            default: 'fr',
        },
        notifications: {
            pushEnabled: { type: Boolean, default: true },
            emailEnabled: { type: Boolean, default: true },
            pushSubscription: { // Stocker l'objet PushSubscription
                endpoint: String,
                expirationTime: { type: Number, default: null },
                keys: {
                    p256dh: String,
                    auth: String
                }
            },
        }
    },
    
    lastLoginAt: Date,
    lastLoginIp: String,
    // loginHistory: [ // Pour un historique plus détaillé
    //     {
    //         timestamp: Date,
    //         ip: String,
    //         device: String, // User-Agent ou autre info
    //         success: Boolean
    //     }
    // ],

}, {
    timestamps: true, // Ajoute createdAt et updatedAt automatiquement
    toJSON: { virtuals: true }, // Assure que les champs virtuels sont inclus dans les sorties JSON
    toObject: { virtuals: true } // Assure que les champs virtuels sont inclus lors de la conversion en objet
});

// --- MIDDLEWARES MONGOOSE (HOOKS) ---

// Hasher le mot de passe avant de sauvegarder (seulement si modifié ou nouveau)
userSchema.pre('save', async function(next) {
    // Ne pas ré-hasher si le mot de passe n'a pas été modifié
    if (!this.isModified('password')) return next();

    // Hasher le mot de passe avec un coût de 12
    this.password = await bcrypt.hash(this.password, 12);

    // Supprimer passwordConfirm car il n'est pas nécessaire de le sauvegarder
    this.passwordConfirm = undefined;
    next();
});

// Mettre à jour passwordChangedAt si le mot de passe est modifié (et n'est pas nouveau)
userSchema.pre('save', function(next) {
    if (!this.isModified('password') || this.isNew) return next();

    this.passwordChangedAt = Date.now() - 1000; // -1s pour s'assurer que le token est créé APRÈS le changement
    next();
});

// Middleware pour ne retourner que les utilisateurs actifs (sauf si explicitement demandé autrement)
// userSchema.pre(/^find/, function(next) { // S'applique à find, findOne, findById, etc.
//   // this pointe sur la requête actuelle
//   this.find({ isActive: { $ne: false } }); // $ne: false inclut true et les documents où isActive n'est pas défini
//   next();
// });


// --- MÉTHODES D'INSTANCE ---

// Vérifier si le mot de passe fourni correspond au mot de passe hashé
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
    return await bcrypt.compare(candidatePassword, userPassword);
};

// Vérifier si le mot de passe a été changé après l'émission d'un token JWT
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        // JWTTimestamp est en secondes, this.passwordChangedAt est une date
        return JWTTimestamp < changedTimestamp;
    }
    // False signifie que le mot de passe n'a JAMAIS été changé (ou pas après l'émission du token)
    return false;
};

// Générer un token aléatoire pour la vérification d'email ou la réinitialisation de mot de passe
const createToken = function() {
    const token = crypto.randomBytes(32).toString('hex');
    // Hasher le token avant de le sauvegarder en DB pour plus de sécurité
    // Le token envoyé à l'utilisateur sera celui non hashé.
    // Le token stocké en DB sera comparé au token hashé reçu.
    this.hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
    
    // Définir une date d'expiration (ex: 10 minutes pour réinitialisation, 24h pour validation email)
    // this.tokenExpires = Date.now() + 10 * 60 * 1000; // Exemple pour 10 minutes

    return token; // Retourner le token non hashé (à envoyer à l'utilisateur)
};

userSchema.methods.createEmailVerificationToken = function() {
    const verificationToken = createToken.call({ _id: this._id }); // Utiliser call pour lier 'this' correctement
    
    this.emailVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 heures

    return verificationToken;
};

userSchema.methods.createPasswordResetToken = function() {
    const resetToken = createToken.call({ _id: this._id });

    this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    return resetToken;
};


const User = mongoose.model('User', userSchema);

module.exports = User;
