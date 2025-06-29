const User = require('../models/userModel');
const Ad = require('../models/adModel');
const { AppError } = require('../middlewares/errorHandler');
const APIFeatures = require('../utils/apiFeatures');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Dashboard statistics
exports.getDashboardStats = asyncHandler(async (req, res, next) => {
  const totalUsers = await User.countDocuments();
  const totalAds = await Ad.countDocuments();
  const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5);
  const recentAds = await Ad.find().sort({ createdAt: -1 }).limit(5).populate('userId', 'name');

  res.status(200).json({
    status: 'success',
    data: { totalUsers, totalAds, recentUsers, recentAds }
  });
});

// Users management
exports.getAllUsers = asyncHandler(async (req, res, next) => {
  const features = new APIFeatures(User.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const users = await features.query;

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { users }
  });
});

exports.updateUser = asyncHandler(async (req, res, next) => {
  const filteredBody = {
    name: req.body.name,
    role: req.body.role,
    isActive: req.body.isActive
  };

  const updatedUser = await User.findByIdAndUpdate(req.params.id, filteredBody, {
    new: true,
    runValidators: true
  });

  if (!updatedUser) {
    return next(new AppError('Utilisateur introuvable.', 404));
  }

  res.status(200).json({ status: 'success', data: { user: updatedUser } });
});

exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);

  if (!user) {
    return next(new AppError('Utilisateur introuvable.', 404));
  }

  res.status(204).json({ status: 'success', data: null });
});

// Ads management
exports.getAllAds = asyncHandler(async (req, res, next) => {
  const features = new APIFeatures(Ad.find().populate('userId', 'name email'), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const ads = await features.query;

  res.status(200).json({
    status: 'success',
    results: ads.length,
    data: { ads }
  });
});

exports.updateAd = asyncHandler(async (req, res, next) => {
  const updatedAd = await Ad.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  if (!updatedAd) {
    return next(new AppError('Annonce introuvable.', 404));
  }

  res.status(200).json({ status: 'success', data: { ad: updatedAd } });
});

exports.deleteAd = asyncHandler(async (req, res, next) => {
  const ad = await Ad.findByIdAndDelete(req.params.id);

  if (!ad) {
    return next(new AppError('Annonce introuvable.', 404));
  }

  res.status(204).json({ status: 'success', data: null });
});
