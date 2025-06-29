const User = require('../models/userModel');
const Ad = require('../models/adModel');
const { AppError } = require('../middlewares/errorHandler');
const APIFeatures = require('../utils/apiFeatures');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Dashboard statistics
exports.getDashboardStats = asyncHandler(async (req, res, next) => {
  const date30 = new Date();
  date30.setDate(date30.getDate() - 30);

  const [totalUsers, totalAds, activeAds, newUsers, newAds] = await Promise.all([
    User.countDocuments(),
    Ad.countDocuments(),
    Ad.countDocuments({ status: 'online' }),
    User.countDocuments({ createdAt: { $gte: date30 } }),
    Ad.countDocuments({ createdAt: { $gte: date30 } })
  ]);

  res.status(200).json({
    status: 'success',
    data: { totalUsers, totalAds, activeAds, newUsersLast30Days: newUsers, newAdsLast30Days: newAds }
  });
});

// Number of new users per month for last 6 months
exports.getNewUsersPerMonth = asyncHandler(async (req, res, next) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const stats = await User.aggregate([
    { $match: { createdAt: { $gte: start } } },
    {
      $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  const result = [];
  for (let i = 0; i < 6; i++) {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const stat = stats.find(s => s._id.year === date.getFullYear() && s._id.month === date.getMonth() + 1);
    result.push({
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      count: stat ? stat.count : 0
    });
  }

  res.status(200).json({ status: 'success', data: result });
});

// Users management
exports.getAllUsers = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.search) {
    const regex = new RegExp(req.query.search, 'i');
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('name email role createdAt isVerified isBanned')
      .skip(skip)
      .limit(limit)
      .sort('-createdAt'),
    User.countDocuments(filter)
  ]);

  res.status(200).json({
    status: 'success',
    results: users.length,
    total,
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
  if (req.user.id === req.params.id) {
    return next(new AppError('Vous ne pouvez pas supprimer votre propre compte.', 400));
  }

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

exports.deleteAdAsAdmin = asyncHandler(async (req, res, next) => {
  const ad = await Ad.findByIdAndDelete(req.params.id);

  if (!ad) {
    return next(new AppError('Annonce introuvable.', 404));
  }

  res.status(204).json({ status: 'success', data: null });
});

// Ban a user
exports.banUser = asyncHandler(async (req, res, next) => {
  if (req.user.id === req.params.id) {
    return next(new AppError('Vous ne pouvez pas vous bannir vous-même.', 400));
  }
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isBanned: true },
    { new: true }
  );
  if (!user) {
    return next(new AppError('Utilisateur introuvable.', 404));
  }
  res.status(200).json({ status: 'success', data: { user } });
});

exports.unbanUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isBanned: false },
    { new: true }
  );
  if (!user) {
    return next(new AppError('Utilisateur introuvable.', 404));
  }
  res.status(200).json({ status: 'success', data: { user } });
});
