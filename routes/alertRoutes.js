// routes/alertRoutes.js
const express = require('express');
const alertController = require('../controllers/alertController');
const { protect, checkOwnership } = require('../middlewares/authMiddleware');
const Alert = require('../models/alertModel'); // Nécessaire pour checkOwnership
// Importer les validateurs spécifiques (à créer dans validationMiddleware.js)
const { validateCreateAlert, validateUpdateAlert } = require('../middlewares/validationMiddleware');

const router = express.Router();

// Toutes les routes pour les alertes nécessitent une authentification
router.use(protect);

router.route('/')
    .post(validateCreateAlert, alertController.createAlert) // Valider les données de création
    .get(alertController.getMyAlerts);

router.route('/:id')
    .get(alertController.getAlertById) // checkOwnership implicite car on filtre par userId dans le contrôleur
    .put(
        checkOwnership(Alert, 'id', 'userId'), // Vérifie que l'utilisateur est propriétaire de l'alerte
        /* validateUpdateAlert, */
        alertController.updateAlert
    )
    .delete(
        checkOwnership(Alert, 'id', 'userId'),
        alertController.deleteAlert
    );

module.exports = router;
