const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Rota para receber webhooks da API Evolution
// Não usamos middleware de autenticação aqui, pois o webhook é chamado pelo sistema externo
router.post('/receive/:instanceName', webhookController.processWebhook);

// Rotas para configurar e gerenciar webhooks (protegidas por autenticação)
router.post('/configure/:instanceName', requireAuth, webhookController.configureWebhook);
router.get('/config/:instanceName', requireAuth, webhookController.getWebhookConfig);

module.exports = router; 