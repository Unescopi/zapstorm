const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Rotas para listar e gerenciar alertas
router.get('/', alertController.getAlerts);
router.get('/unread-summary', alertController.getUnreadSummary);
router.get('/:id', alertController.getAlert);
router.post('/:id/read', alertController.markAsRead);
router.post('/read-all', alertController.markAllAsRead);

module.exports = router; 