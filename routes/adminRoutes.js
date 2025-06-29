const express = require('express');
const adminController = require('../controllers/adminController');
const { protect, isAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

// Toutes les routes nécessitent une authentification et un rôle administrateur
router.use(protect);
router.use(isAdmin);

router.get('/stats', adminController.getDashboardStats);

router.route('/users')
    .get(adminController.getAllUsers);

router.route('/users/:id')
    .patch(adminController.updateUser)
    .delete(adminController.deleteUser);

router.route('/ads')
    .get(adminController.getAllAds);

router.route('/ads/:id')
    .patch(adminController.updateAd)
    .delete(adminController.deleteAd);

module.exports = router;
