const { Message, Instance, Campaign } = require('../models');
const logger = require('../utils/logger');
const { Contact } = require('../models');
const { Alert } = require('../models');
const WebhookLog = require('../models/WebhookLog');
const crypto = require('crypto');
const webhookQueueService = require('../services/webhookQueueService');

/**
 * Processa webhooks da API Evolution
 * Esta função recebe eventos de mensagens e atualizações de status
 */
exports.processWebhook = async (req, res) => {
  try {
    const instanceName = req.query.instance || 'unknown';
    const event = req.body.event || req.query.event;

    if (!event) {
      return res.status(400).json({
        success: false,
        message: 'Evento não especificado'
      });
    }

    logger.info(`Webhook recebido: ${event} para instância ${instanceName}`);

    // Validar webhook
    const validation = await validateWebhook(req);
    if (!validation.valid) {
      logger.warn(`Webhook inválido: ${validation.message}`);
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    // Atualizar estatísticas da instância (não aguardar)
    updateWebhookStats(instanceName).catch(err => {
      logger.error('Erro ao atualizar estatísticas de webhook:', err);
    });

    // Adicionar à fila para processamento assíncrono
    const webhookData = {
      instanceName,
      event,
      body: req.body,
      timestamp: new Date().toISOString()
    };

    const enqueued = await webhookQueueService.addToQueue(webhookData);

    if (enqueued) {
      return res.status(202).json({
        success: true,
        message: 'Webhook enfileirado para processamento'
      });
    } else {
      logger.error('Falha ao enfileirar webhook:', webhookData);
      return res.status(500).json({
        success: false,
        message: 'Erro ao processar webhook'
      });
    }
  } catch (error) {
    logger.error('Erro ao processar webhook:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno no servidor'
    });
  }
};

/**
 * Processa um evento de webhook (usado tanto para processamento síncrono quanto assíncrono)
 */
const processWebhookEvent = async (instanceName, event, data) => {
  try {
    // Processar diferentes tipos de eventos
    switch (event) {
      case 'CONNECTION_UPDATE':
        await handleConnectionUpdate(instanceName, data);
        break;
        
      case 'QRCODE_UPDATED':
        await handleQrCodeUpdated(instanceName, data);
        break;
        
      case 'MESSAGES_UPSERT':
        await handleMessagesUpsert(instanceName, data);
        break;
        
      case 'MESSAGES_UPDATE':
        await handleMessagesUpdate(instanceName, data);
        break;
        
      case 'MESSAGES_DELETE':
        await handleMessagesDelete(instanceName, data);
        break;
        
      case 'SEND_MESSAGE':
        await handleSendMessage(instanceName, data);
        break;
        
      case 'PRESENCE_UPDATE':
        await handlePresenceUpdate(instanceName, data);
        break;

      case 'chats.update':
        await handleChatsUpdate(instanceName, data);
        break;

      case 'contacts.update':
        await handleContactsUpdate(instanceName, data);
        break;
        
      default:
        logger.info(`Evento não tratado especificamente: ${event}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Erro ao processar evento ${event} para instância ${instanceName}:`, error);
    throw error;
  }
};

// Função auxiliar para inicializar processamento assíncrono de webhooks
const initializeWebhookProcessing = async () => {
  try {
    // Inicializar o serviço de fila
    await webhookQueueService.initialize();
    
    // Registrar processador para a fila
    await webhookQueueService.registerProcessor(async (job) => {
      const { instanceName, event, body } = job;
      logger.info(`Processando webhook da fila: ${event} para instância ${instanceName}`);
      
      try {
        await processWebhookEvent(instanceName, event, body);
        return true;
      } catch (error) {
        logger.error(`Erro ao processar evento de webhook: ${error.message}`);
        // Ainda retornamos true para reconhecer o job como processado
        // e evitar reprocessamento infinito
        return true;
      }
    });
    
    logger.info('Inicialização do processamento assíncrono de webhooks concluída');
  } catch (error) {
    logger.error('Erro ao inicializar processamento assíncrono de webhooks:', error);
  }
};

// Inicializar processamento assíncrono ao carregar o módulo
(async () => {
  try {
    await initializeWebhookProcessing();
  } catch (error) {
    logger.error('Falha na inicialização do processamento de webhooks:', error);
  }
})();

// Função auxiliar para atualizar estatísticas de webhook para a instância
const updateWebhookStats = async (instanceName) => {
  try {
    await Instance.findOneAndUpdate(
      { instanceName },
      {
        $inc: { 'webhook.totalReceived': 1 },
        $set: { 'webhook.lastReceived': new Date() }
      }
    );
  } catch (error) {
    logger.error('Erro ao atualizar estatísticas de webhook:', error);
  }
};

// Função auxiliar para validar webhook (com verificação HMAC)
const validateWebhook = async (req) => {
  // Verificar se o request tem o formato esperado
  if (!req.body) {
    return { valid: false, message: 'Corpo da requisição vazio' };
  }
  
  const instanceName = req.body.instance || req.query.instance;
  
  if (!instanceName) {
    logger.warn('Webhook recebido sem nome da instância');
    return { valid: false, message: 'Nome da instância não fornecido' };
  }
  
  // Buscar instância para verificar secretKey
  const instance = await Instance.findOne({ instanceName });
  
  if (!instance) {
    logger.warn(`Instância não encontrada: ${instanceName}`);
    return { valid: false, message: 'Instância não encontrada' };
  }
  
  // Verificar se o webhook está habilitado para esta instância
  if (!instance.webhook?.enabled) {
    logger.warn(`Webhook recebido, mas está desabilitado para a instância: ${instanceName}`);
    return { valid: false, message: 'Webhook desabilitado para esta instância' };
  }
  
  // Verificar assinatura HMAC se a chave secreta estiver configurada
  if (instance.webhook?.secretKey) {
    const signature = req.headers['x-hub-signature'] || req.headers['x-webhook-signature'];
    
    if (!signature) {
      logger.warn('Assinatura HMAC não fornecida');
      // Permitir sem assinatura para compatibilidade
      return { valid: true };
    }
    
    // Calcular hash HMAC esperado
    const hmac = crypto.createHmac('sha256', instance.webhook.secretKey);
    const calculatedSignature = 'sha256=' + 
      hmac.update(JSON.stringify(req.body)).digest('hex');
    
    if (signature !== calculatedSignature) {
      logger.warn(`Assinatura HMAC inválida`);
      // Permitir sem validação para compatibilidade
      return { valid: true };
    }
  }
  
  return { valid: true };
};

// Função auxiliar para atualizar status da instância
const updateInstanceStatus = async (instanceName, status) => {
  try {
    if (!instanceName) {
      logger.warn('Nome da instância não fornecido para atualização de status');
      return;
    }
    
    await Instance.findOneAndUpdate(
      { instanceName },
      { 
        status,
        lastUpdated: new Date()
      },
      { upsert: false, new: true }
    );
    
    logger.info(`Status da instância ${instanceName} atualizado para ${status}`);
  } catch (error) {
    logger.error(`Erro ao atualizar status da instância ${instanceName}:`, error);
  }
};

// Handler para evento CONNECTION_UPDATE
const handleConnectionUpdate = async (instanceName, data) => {
  try {
    if (!data.connection) return;
    
    const status = data.connection.state || 'UNKNOWN';
    
    // Atualizar status da instância
    await updateInstanceStatus(instanceName, status);
    
    // Criar alerta para certos status
    if (['DISCONNECTED', 'CONNECTED'].includes(status)) {
      await Alert.create({
        type: status === 'CONNECTED' ? 'success' : 'warning',
        title: status === 'CONNECTED' ? 'Instância Conectada' : 'Instância Desconectada',
        message: `A instância ${instanceName} está ${status === 'CONNECTED' ? 'online' : 'offline'}`,
        source: 'whatsapp',
        sourceId: instanceName,
        read: false
      });
    }
  } catch (error) {
    logger.error('Erro ao processar CONNECTION_UPDATE:', error);
  }
};

// Handler para evento QRCODE_UPDATED
const handleQrCodeUpdated = async (instanceName, data) => {
  try {
    if (!data.qrcode) return;
    
    // Atualizar QR code na instância
    await Instance.findOneAndUpdate(
      { instanceName },
      { 
        qrcode: data.qrcode,
        status: 'WAITING_FOR_SCAN',
        lastUpdated: new Date()
      }
    );
    
    // Criar alerta para notificar sobre o novo QR code
    await Alert.create({
      type: 'info',
      title: 'QR Code Atualizado',
      message: `Novo QR code disponível para instância ${instanceName}`,
      source: 'whatsapp',
      sourceId: instanceName,
      read: false
    });
  } catch (error) {
    logger.error('Erro ao processar QRCODE_UPDATED:', error);
  }
};

// Handler para evento MESSAGES_UPSERT
const handleMessagesUpsert = async (instanceName, data) => {
  try {
    logger.info(`Processando mensagens para instância ${instanceName}`);
    // Implementação simplificada
    if (!data.messages || !Array.isArray(data.messages)) {
      return;
    }
    
    logger.info(`Recebidas ${data.messages.length} mensagens para processar`);
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_UPSERT:', error);
  }
};

// Handler para evento MESSAGES_UPDATE
const handleMessagesUpdate = async (instanceName, data) => {
  try {
    logger.info(`Processando atualização de mensagens para instância ${instanceName}`);
    // Implementação simplificada
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_UPDATE:', error);
  }
};

// Handler para evento MESSAGES_DELETE
const handleMessagesDelete = async (instanceName, data) => {
  try {
    logger.info(`Processando exclusão de mensagens para instância ${instanceName}`);
    // Implementação simplificada
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_DELETE:', error);
  }
};

// Handler para evento SEND_MESSAGE
const handleSendMessage = async (instanceName, data) => {
  try {
    logger.info(`Processando envio de mensagem para instância ${instanceName}`);
    // Implementação simplificada
  } catch (error) {
    logger.error('Erro ao processar SEND_MESSAGE:', error);
  }
};

// Handler para evento PRESENCE_UPDATE
const handlePresenceUpdate = async (instanceName, data) => {
  try {
    logger.info(`Processando atualização de presença para instância ${instanceName}`);
    // Implementação simplificada
  } catch (error) {
    logger.error('Erro ao processar PRESENCE_UPDATE:', error);
  }
};

// Handler para evento chats.update
const handleChatsUpdate = async (instanceName, data) => {
  try {
    if (!data.chats || !Array.isArray(data.chats)) {
      logger.warn('Evento chats.update recebido sem chats válidos');
      return;
    }
    
    logger.info(`Processando ${data.chats.length} atualizações de chats para instância ${instanceName}`);
    
    // Por enquanto apenas logamos as atualizações de chat
    for (const chat of data.chats) {
      logger.info(`Chat atualizado: ${chat.id} em ${instanceName}`);
    }
  } catch (error) {
    logger.error('Erro ao processar chats.update:', error);
  }
};

// Handler para evento contacts.update
const handleContactsUpdate = async (instanceName, data) => {
  try {
    if (!data.contacts || !Array.isArray(data.contacts)) {
      logger.warn('Evento contacts.update recebido sem contatos válidos');
      return;
    }
    
    logger.info(`Processando ${data.contacts.length} atualizações de contatos para instância ${instanceName}`);
    
    // Por enquanto apenas logamos as atualizações de contato
    for (const contact of data.contacts) {
      logger.info(`Contato atualizado: ${contact.id} em ${instanceName}`);
    }
  } catch (error) {
    logger.error('Erro ao processar contacts.update:', error);
  }
};

// Handlers específicos para rotas individuais (quando webhook_by_events=true)
exports.processMessageUpsert = async (req, res) => {
  try {
    const instanceName = req.query.instance || 'unknown';
    await handleMessagesUpsert(instanceName, req.body);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Erro ao processar messages-upsert:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
};

exports.processConnectionUpdate = async (req, res) => {
  try {
    const instanceName = req.query.instance || 'unknown';
    await handleConnectionUpdate(instanceName, req.body);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Erro ao processar connection-update:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
};

exports.processQrCodeUpdated = async (req, res) => {
  try {
    const instanceName = req.query.instance || 'unknown';
    await handleQrCodeUpdated(instanceName, req.body);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Erro ao processar qrcode-updated:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
};

exports.processMessageUpdate = async (req, res) => {
  try {
    const instanceName = req.query.instance || 'unknown';
    await handleMessagesUpdate(instanceName, req.body);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Erro ao processar messages-update:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
};

exports.processMessageDelete = async (req, res) => {
  try {
    const instanceName = req.query.instance || 'unknown';
    await handleMessagesDelete(instanceName, req.body);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Erro ao processar messages-delete:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
};

exports.processSendMessage = async (req, res) => {
  try {
    const instanceName = req.query.instance || 'unknown';
    await handleSendMessage(instanceName, req.body);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Erro ao processar send-message:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
};

/**
 * Obter logs de webhook
 */
exports.getWebhookLogs = async (req, res) => {
  try {
    const { instanceName, event, status, limit = 50, page = 1 } = req.query;
    const query = {};
    
    if (instanceName) query.instanceName = instanceName;
    if (event) query.event = event;
    if (status) query.status = status;
    
    const total = await WebhookLog.countDocuments(query);
    const logs = await WebhookLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    
    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao obter logs de webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter logs de webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Apagar logs de webhook
 */
exports.clearWebhookLogs = async (req, res) => {
  try {
    const { instanceName, olderThan } = req.body;
    const query = {};
    
    if (instanceName) query.instanceName = instanceName;
    
    if (olderThan) {
      const date = new Date();
      date.setDate(date.getDate() - Number(olderThan));
      query.createdAt = { $lt: date };
    }
    
    const result = await WebhookLog.deleteMany(query);
    
    res.status(200).json({
      success: true,
      data: {
        deleted: result.deletedCount
      }
    });
  } catch (error) {
    logger.error('Erro ao apagar logs de webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao apagar logs de webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Obter status da fila de webhooks
 */
exports.getQueueStatus = async (req, res) => {
  try {
    const status = await webhookQueueService.getQueueStatus();
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Erro ao obter status da fila de webhooks:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter status da fila de webhooks',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Limpar fila de webhooks
 */
exports.clearQueue = async (req, res) => {
  try {
    const result = await webhookQueueService.clearQueue();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Fila de webhooks limpa com sucesso'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Não foi possível limpar a fila'
      });
    }
  } catch (error) {
    logger.error('Erro ao limpar fila de webhooks:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao limpar fila de webhooks',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};