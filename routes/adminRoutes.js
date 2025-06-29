const express = require('express');
const adminController = require('../controllers/adminController');
const { protect, isAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

// Toutes les routes nécessitent une authentification et un rôle administrateur
router.use(protect);
router.use(isAdmin);

router.get('/stats', adminController.getDashboardStats);
router.get('/stats/new-users', adminController.getNewUsersPerMonth);

router.route('/users')
    .get(adminController.getAllUsers);

router.route('/users/:id')
    .patch(adminController.updateUser)
    .delete(adminController.deleteUser);

router.post('/users/:id/ban', adminController.banUser);
router.post('/users/:id/unban', adminController.unbanUser);

router.route('/ads')
    .get(adminController.getAllAds);

router.route('/ads/:id')
    .patch(adminController.updateAd)
    .delete(adminController.deleteAdAsAdmin);

module.exports = router;
