const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Rota de listagem e criação de templates
router.route('/')
  .get(templateController.getTemplates)
  .post(templateController.createTemplate);

// Rotas para operações específicas em um template
router.route('/:id')
  .get(templateController.getTemplate)
  .put(templateController.updateTemplate)
  .delete(templateController.deleteTemplate);

// Rota para pré-visualizar um template com variáveis
router.post('/:id/preview', templateController.previewTemplate);

module.exports = router; 