const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { protect, adminMiddleware } = require('../middlewares/authMiddleware');
const { webhookRateLimit } = require('../middlewares/rateLimitMiddleware');

// Aplicar rate limiting em todas as rotas de webhook
router.use(webhookRateLimit);

// Rotas públicas (sem autenticação)
// Rota principal para webhooks da Evolution API
router.post('/', webhookController.processWebhook);

// Rotas específicas para cada tipo de evento (opcional, se webhook_by_events=true)
router.post('/messages-upsert', webhookController.processMessageUpsert);
router.post('/connection-update', webhookController.processConnectionUpdate);
router.post('/qrcode-updated', webhookController.processQrCodeUpdated);
router.post('/messages-update', webhookController.processMessageUpdate);
router.post('/messages-delete', webhookController.processMessageDelete);
router.post('/send-message', webhookController.processSendMessage);

// Rotas protegidas (requerem autenticação)
// Rotas de logs (apenas para usuários autenticados)
router.get('/logs', protect, webhookController.getWebhookLogs);
router.delete('/logs', protect, adminMiddleware, webhookController.clearWebhookLogs);

// Rotas para gerenciamento da fila (apenas para administradores)
router.get('/queue/status', protect, adminMiddleware, webhookController.getQueueStatus);
router.delete('/queue', protect, adminMiddleware, webhookController.clearQueue);

module.exports = router; 