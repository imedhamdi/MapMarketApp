const express = require('express');
const threadController = require('../controllers/threadController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/', threadController.createOrGetThread);
router.get('/', threadController.getThreadsForUser);

module.exports = router;

