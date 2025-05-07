const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { protect, adminMiddleware } = require('../middlewares/authMiddleware');
const { webhookRateLimit } = require('../middlewares/rateLimitMiddleware');

// Rotas públicas (não requerem autenticação)
router.post('/', webhookRateLimit, webhookController.processWebhook);
router.post('/messages-upsert', webhookController.processMessageUpsert);
router.post('/messages-update', webhookController.processMessageUpdate);
router.post('/messages-delete', webhookController.processMessageDelete);
router.post('/send-message', webhookController.processSendMessage);

// Rotas protegidas (requerem autenticação)
router.get('/queue/status', protect, adminMiddleware, webhookController.getQueueStatus);
router.delete('/queue', protect, adminMiddleware, webhookController.clearQueue);

// Rotas de logs (apenas para usuários autenticados)
router.get('/logs', protect, webhookController.getWebhookLogs);
router.delete('/logs', protect, adminMiddleware, webhookController.clearWebhookLogs);

module.exports = router; 