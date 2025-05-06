const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

// Rotas de usuários - somente admin pode gerenciar usuários
router.get('/', authMiddleware, adminMiddleware, authController.getAllUsers);
router.post('/', authMiddleware, adminMiddleware, authController.createUser);
router.get('/:id', authMiddleware, adminMiddleware, authController.getUserById);
router.put('/:id', authMiddleware, adminMiddleware, authController.updateUser);
router.delete('/:id', authMiddleware, adminMiddleware, authController.deleteUser);
router.put('/:id/activate', authMiddleware, adminMiddleware, authController.activateUser);
router.put('/:id/deactivate', authMiddleware, adminMiddleware, authController.deactivateUser);

module.exports = router; 