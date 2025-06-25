// routes/notificationRoutes.js
const express = require('express');
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Toutes les routes pour les notifications nécessitent une authentification
router.use(protect);

router.route('/')
    .get(notificationController.getMyNotifications); // Récupérer toutes les notifications de l'utilisateur

router.post('/mark-as-read', notificationController.markMultipleNotificationsAsRead);

router.post('/read-all', notificationController.markAllNotificationsAsRead); // Marquer toutes comme lues

router.route('/:id')
    .delete(notificationController.deleteNotification); // Supprimer une notification spécifique

router.post('/:id/read', notificationController.markNotificationAsRead); // Marquer une notification spécifique comme lue

// Route pour supprimer toutes les notifications lues (optionnel)
router.delete('/clear/all-read', notificationController.deleteAllReadNotifications);


module.exports = router;
