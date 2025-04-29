const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Rota de listagem e criação de campanhas
router.route('/')
  .get(campaignController.getCampaigns)
  .post(campaignController.createCampaign);

// Rotas para operações específicas em uma campanha
router.route('/:id')
  .get(campaignController.getCampaign)
  .put(campaignController.updateCampaign)
  .delete(campaignController.deleteCampaign);

// Rota para obter relatório da campanha
router.get('/:id/report', campaignController.getCampaignReport);

// Rotas para controle de campanha
router.post('/:id/start', campaignController.verificarContatos, campaignController.startCampaign);
router.post('/:id/pause', campaignController.pauseCampaign);
router.post('/:id/resume', campaignController.resumeCampaign);
router.post('/:id/cancel', campaignController.cancelCampaign);

// Rota para reenviar mensagens com falha de uma campanha
router.post('/:id/resend-failed', campaignController.resendFailedMessages);

// Rota para reenviar uma mensagem específica
router.post('/messages/:messageId/resend', campaignController.resendMessage);

module.exports = router; 