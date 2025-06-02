// routes/settingRoutes.js
const express = require('express');
const settingController = require('../controllers/settingController');
const { protect } = require('../middlewares/authMiddleware');
const { validateUpdateSettings } = require('../middlewares/validationMiddleware'); // À créer si besoin

const router = express.Router();

// Toutes les routes pour les paramètres nécessitent une authentification
router.use(protect);

router.route('/')
    .get(settingController.getMySettings) // Pour récupérer les paramètres actuels
    .put( validateUpdateSettings, settingController.updateMySettings); // Pour mettre à jour un ou plusieurs paramètres


/* router.post('/push-subscription', settingController.savePushSubscription);
router.delete('/push-subscription', settingController.deletePushSubscription);
 */

module.exports = router;
