const express = require('express');
const router = express.Router();
const instanceController = require('../controllers/instanceController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Rota para sincronizar instâncias da Evolution API
router.post('/sync-from-evolution', instanceController.syncFromEvolution);

// Rota de listagem e criação de instâncias
router.route('/')
  .get(instanceController.getInstances)
  .post(instanceController.createInstance);

// Rotas para operações específicas em uma instância
router.route('/:id')
  .get(instanceController.getInstance)
  .put(instanceController.updateInstance)
  .delete(instanceController.deleteInstance);

// Rota para conectar instância (gerar QR Code)
router.post('/:id/connect', instanceController.connectInstance);

// Rota para verificar estado da conexão
router.get('/:id/state', instanceController.connectionState);

// Rota para desconectar instância
router.post('/:id/logout', instanceController.logoutInstance);

// Rota para reiniciar instância
router.post('/:id/restart', instanceController.restartInstance);

// Rotas para webhooks
router.post('/:id/webhook', instanceController.configureWebhook);
router.delete('/:id/webhook', instanceController.removeWebhook);
router.get('/:id/webhook', instanceController.getWebhookStatus);

module.exports = router; 