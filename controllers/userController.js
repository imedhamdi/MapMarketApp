// controllers/userController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'mapmarket_secret';
const SALT_ROUNDS = 12;
const TOKEN_EXPIRES_IN = '7d';

// Helper: Génère un token JWT
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES_IN }
  );
};

// Helper: Valide les entrées
const validateRequest = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
};

// Inscription utilisateur
exports.register = async (req, res) => {
  try {
    validateRequest(req, res);

    const { name, email, password } = req.body;

    // Vérifie si l'utilisateur existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe déjà.'
      });
    }

    // Crée le nouvel utilisateur
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      name,
      email,
      password
    });

    // Génère le token
    const token = generateToken(user);

    // Réponse sécurisée (sans mot de passe)
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    };

    res.status(201).json({
      success: true,
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création du compte',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Connexion utilisateur
exports.login = async (req, res) => {
  try {
    validateRequest(req, res);

    const { email, password } = req.body;

    // Trouve l'utilisateur
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Identifiants incorrects'
      });
    }

    // Vérifie le mot de passe
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Identifiants incorrects'
      });
    }

    // Génère le token
    const token = generateToken(user);

    // Réponse sécurisée
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email
    };

    res.status(200).json({
      success: true,
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la connexion'
    });
  }
};

// Récupère le profil utilisateur
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -resetToken -resetTokenExpires')
      .populate('favorites', 'title price category location coordinates');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    res.status(200).json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Erreur récupération profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du profil'
    });
  }
};

// Met à jour le profil utilisateur
exports.updateProfile = async (req, res) => {
  try {
    validateRequest(req, res);

    const { name, email, currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Trouve l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifie le mot de passe actuel si changement demandé
    if (newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Mot de passe actuel incorrect'
        });
      }
      user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }

    // Met à jour les autres champs
    if (name) user.name = name;
    if (email) user.email = email;

    await user.save();

    // Génère un nouveau token si email changé
    let token;
    if (email) {
      token = generateToken(user);
    }

    // Réponse sécurisée
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      updatedAt: user.updatedAt
    };

    res.status(200).json({
      success: true,
      message: 'Profil mis à jour avec succès',
      token: token || undefined,
      user: userResponse
    });

  } catch (error) {
    console.error('Erreur mise à jour profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du profil'
    });
  }
};

// Supprime le compte utilisateur
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Vérifie le mot de passe
    const { password } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mot de passe incorrect'
      });
    }

    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'Compte supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression compte:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression du compte'
    });
  }
};

// Gestion des favoris
exports.manageFavorites = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { action } = req.query; // 'add' ou 'remove'
    const userId = req.user.id;

    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action invalide'
      });
    }

    const update = action === 'add'
      ? { $addToSet: { favorites: itemId } }
      : { $pull: { favorites: itemId } };

    const user = await User.findByIdAndUpdate(
      userId,
      update,
      { new: true }
    ).select('favorites');

    res.status(200).json({
      success: true,
      message: action === 'add'
        ? 'Article ajouté aux favoris'
        : 'Article retiré des favoris',
      favorites: user.favorites
    });

  } catch (error) {
    console.error('Erreur gestion favoris:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la gestion des favoris'
    });
  }
};

// Récupère les favoris
exports.getFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('favorites')
      .populate('favorites', 'title price category location coordinates images');

    res.status(200).json({
      success: true,
      favorites: user.favorites || []
    });

  } catch (error) {
    console.error('Erreur récupération favoris:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des favoris'
    });
  }
};

// Vérifie si un article est favori
exports.checkFavorite = async (req, res) => {
  try {
    const { itemId } = req.params;
    const user = await User.findById(req.user.id);

    const isFavorite = user.favorites.includes(itemId);

    res.status(200).json({
      success: true,
      isFavorite
    });

  } catch (error) {
    console.error('Erreur vérification favori:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification du favori'
    });
  }
};

// Mot de passe oublié
exports.forgotPassword = async (req, res) => {
  try {
    validateRequest(req, res);

    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      // Pour des raisons de sécurité, on ne révèle pas si l'email existe
      return res.status(200).json({
        success: true,
        message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé'
      });
    }

    // Génère un token de réinitialisation
    const resetToken = user.generateResetToken();
    await user.save();

    // En production, vous enverriez un email ici
    if (process.env.NODE_ENV === 'development') {
      console.log(`Lien de réinitialisation: http://localhost:5000/reset-password/${resetToken}`);
    }

    res.status(200).json({
      success: true,
      message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé'
    });

  } catch (error) {
    console.error('Erreur mot de passe oublié:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la demande de réinitialisation'
    });
  }
};



exports.validateResetToken = async (req, res) => {
  try {
    const token = req.params.token;
    
    // Hash le token pour le comparer avec celui en base
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    console.log('Token reçu:', token);
    console.log('Token hashé:', hashedToken);

    // Trouve l'utilisateur avec un token valide
    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpires: { $gt: Date.now() }
    });

    console.log('User trouvé:', user);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token invalide ou expiré',
        details: {
          tokenReceived: token,
          hashedToken,
          currentTime: new Date(),
          expiryTime: user?.resetTokenExpires
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Token valide',
      email: user.email // Optionnel: renvoyer l'email associé
    });

  } catch (error) {
    console.error('Erreur validation token:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la validation du token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// Réinitialisation du mot de passe
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    console.log('Token reçu:', token);
    
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    console.log('Token hashé:', hashedToken);
    console.log('Date actuelle:', new Date());
    
    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpires: { $gt: Date.now() }
    });

    console.log('Utilisateur trouvé:', user);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token invalide ou expiré',
        details: {
          currentTime: new Date(),
          storedToken: hashedToken
        }
      });
    }

    // Met à jour le mot de passe
    user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });

  } catch (error) {
    console.error('Erreur réinitialisation mot de passe:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la réinitialisation du mot de passe'
    });
  }
};