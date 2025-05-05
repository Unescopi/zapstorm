const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const authMiddleware = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permissions');

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Obter configurações
router.get('/', checkPermission('settings:read'), settingController.getSettings);

// Atualizar configurações
router.put('/', checkPermission('settings:write'), settingController.updateSettings);

// Obter status dos webhooks
router.get('/webhook-status', checkPermission('settings:read'), settingController.getWebhookStatus);

module.exports = router; 