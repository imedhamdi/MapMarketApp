const express = require('express');
const threadController = require('../controllers/threadController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(protect);

// Obtenir le nombre de discussions non lues
router.get('/unread-count', threadController.getUnreadThreadsCount);

module.exports = router;
