const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const multer = require('multer');

// Configuração do multer para upload de arquivos
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // Limite de 10MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas arquivos CSV
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos CSV são permitidos'));
    }
  }
});

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Rota de listagem e criação de contatos
router.route('/')
  .get(contactController.getContacts)
  .post(contactController.createContact);

// Rota para exportar contatos
router.get('/export', contactController.exportCSV);

// Rota para importação em massa de contatos via CSV
router.post('/import', upload.single('file'), contactController.importCSV);

// Rota para excluir múltiplos contatos
router.post('/delete-multiple', contactController.deleteMultipleContacts);

// Rota para obter todas as tags distintas
router.get('/tags', contactController.getTags);

// Rotas para operações específicas em um contato
router.route('/:id')
  .get(contactController.getContact)
  .put(contactController.updateContact)
  .delete(contactController.deleteContact);

module.exports = router; 