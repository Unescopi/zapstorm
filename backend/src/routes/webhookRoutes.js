const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { protect, adminMiddleware } = require('../middlewares/authMiddleware');
const rateLimit = require('express-rate-limit');

// Configurar rate limiting adequado para ambiente de produção
const webhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 500, // limite de 500 requisições por minuto (mais adequado para volume alto)
  message: { success: false, message: 'Limite de requisições excedido, tente novamente mais tarde' },
  standardHeaders: true,
  legacyHeaders: false,
  // Usar RabbitMQ como armazenamento se disponível
  // Nota: isso requeriria uma implementação personalizada
  // ou usar algo como "rate-limit-redis" em produção
  skipFailedRequests: true // não contar requisições que resultam em erro
});

// Aplicar rate limiting em todas as rotas de webhook
router.use(webhookRateLimit);

// Adicionar middleware para processar corpo raw
router.use(express.json({ limit: '5mb' }));
router.use(express.urlencoded({ extended: true, limit: '5mb' }));

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

// Rota principal para receber webhooks
router.post('/receive/:instanceName', webhookController.receiveWebhook);

// Rota para testar webhook
router.post('/test/:instanceId', webhookController.testWebhook);

// Rota de análise de saúde das instâncias baseada em webhooks históricos
router.post('/analyze-health', async (req, res) => {
  try {
    const webhookAnalyticsService = require('../services/webhookAnalyticsService');
    await webhookAnalyticsService.analyzeInstancesHealth();
    res.status(200).json({ success: true, message: 'Análise de saúde iniciada com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para verificar instâncias em quarentena
router.post('/check-quarantine', async (req, res) => {
  try {
    const webhookAnalyticsService = require('../services/webhookAnalyticsService');
    await webhookAnalyticsService.checkQuarantinedInstances();
    res.status(200).json({ success: true, message: 'Verificação de instâncias em quarentena concluída' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router; 