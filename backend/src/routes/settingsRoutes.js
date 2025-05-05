const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permissions');

// Aplicar middleware de autenticação
router.use(authMiddleware);

// Rotas para configurações do sistema - requer permissão de administrador
router.get('/', checkPermission('admin'), settingsController.getSettings);
router.put('/', checkPermission('admin'), settingsController.updateSettings);

module.exports = router; 