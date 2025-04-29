const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Rota para estatísticas gerais
router.get('/stats', dashboardController.getStats);

// Rota para campanhas recentes
router.get('/recent-campaigns', dashboardController.getRecentCampaigns);

// Rota para mensagens com falha recentes
router.get('/recent-failures', dashboardController.getRecentFailures);

// Rota para status das instâncias
router.get('/instances-status', dashboardController.getInstancesStatus);

module.exports = router; 