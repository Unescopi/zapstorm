const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Rota para receber webhooks da API Evolution
// Não usamos middleware de autenticação aqui, pois o webhook é chamado pelo sistema externo
router.post('/:instanceName', webhookController.processWebhook);

module.exports = router; 