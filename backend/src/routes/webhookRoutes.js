const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { protect, adminMiddleware } = require('../middlewares/authMiddleware');
const { webhookRateLimit } = require('../middlewares/rateLimitMiddleware');

// Rotas públicas (sem autenticação)
// Rota principal para webhooks da Evolution API
router.post('/', webhookRateLimit, webhookController.processWebhook);

// Rotas específicas para cada tipo de evento (opcional, se webhook_by_events=true)
router.post('/messages-upsert', webhookRateLimit, webhookController.processMessageUpsert);
router.post('/connection-update', webhookRateLimit, webhookController.processConnectionUpdate);
router.post('/qrcode-updated', webhookRateLimit, webhookController.processQrCodeUpdated);
router.post('/messages-update', webhookRateLimit, webhookController.processMessageUpdate);
router.post('/messages-delete', webhookRateLimit, webhookController.processMessageDelete);
router.post('/send-message', webhookRateLimit, webhookController.processSendMessage);

// Rotas protegidas (requerem autenticação)
// Rotas de logs (apenas para usuários autenticados)
router.get('/logs', protect, webhookController.getWebhookLogs);
router.delete('/logs', protect, adminMiddleware, webhookController.clearWebhookLogs);

// Rotas para gerenciamento da fila (apenas para administradores)
router.get('/queue/status', protect, adminMiddleware, webhookController.getQueueStatus);
router.delete('/queue', protect, adminMiddleware, webhookController.clearQueue);

module.exports = router; 