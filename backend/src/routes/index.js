const express = require('express');
const authMiddleware = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permissions');

// Importar os roteadores
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const instanceRoutes = require('./instanceRoutes');
const contactRoutes = require('./contactRoutes');
const templateRoutes = require('./templateRoutes');
const campaignRoutes = require('./campaignRoutes');
const webhookRoutes = require('./webhookRoutes');
const settingRoutes = require('./settingRoutes');
// Removendo a rota de mensagens que não é necessária
// const messageRoutes = require('./messageRoutes');
const healthRoutes = require('./healthRoutes');

// Exportar função para configurar rotas
module.exports = (app) => {
  // Rota para verificação de sistema
  app.use('/health', healthRoutes); // Não requer autenticação
  
  // Webhook (não requer autenticação, pois é chamado por sistema externo)
  app.use('/webhook', webhookRoutes);
  
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
  app.use('/settings', settingRoutes);
  // Removendo a rota de mensagens
  // app.use('/messages', messageRoutes);
}; 