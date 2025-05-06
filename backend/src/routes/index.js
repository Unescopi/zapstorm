const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permissions');
const router = express.Router();

// Importar os roteadores
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const instanceRoutes = require('./instanceRoutes');
const contactRoutes = require('./contactRoutes');
const templateRoutes = require('./templateRoutes');
const campaignRoutes = require('./campaignRoutes');
const messageRoutes = require('./messageRoutes');
const healthRoutes = require('./healthRoutes');
const listRoutes = require('./listRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const webhookRoutes = require('./webhookRoutes');
const schedulerRoutes = require('./schedulerRoutes');

// Exportar função para configurar rotas
module.exports = (app) => {
  // Rota para verificação de sistema
  app.use('/health', healthRoutes); // Não requer autenticação
  
  // Autenticação
  app.use('/auth', authRoutes);
  
  // Middleware de autenticação para rotas protegidas
  app.use(authMiddleware);
  
  // Rotas protegidas
  app.use('/users', userRoutes);
  app.use('/instances', instanceRoutes);
  app.use('/contacts', contactRoutes);
  app.use('/templates', templateRoutes);
  app.use('/campaigns', campaignRoutes);
  app.use('/messages', messageRoutes);
  app.use('/lists', listRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/webhooks', webhookRoutes);
  app.use('/scheduler', schedulerRoutes);
}; 