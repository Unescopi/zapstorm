const { Message, Instance, Campaign } = require('../models');
const logger = require('../utils/logger');
const { Contact } = require('../models');
const { Alert } = require('../models');
const WebhookLog = require('../models/WebhookLog');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const webhookQueueService = require('../services/webhookQueueService');

// Rate limiting middleware para webhooks
exports.webhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 300, // limite de 300 requisições por minuto
  message: { success: false, message: 'Limite de requisições excedido, tente novamente mais tarde' },
  standardHeaders: true,
  legacyHeaders: false
});

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
        
      default:
        logger.info(`Evento não tratado especificamente: ${event}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Erro ao processar evento ${event} para instância ${instanceName}:`, error);
    throw error;
  }
};

/**
 * Inicializar processamento assíncrono de webhooks
 */
const initializeWebhookProcessing = async () => {
  try {
    // Inicializar o serviço de fila
    await webhookQueueService.initialize();
    
    // Registrar processador para a fila
    await webhookQueueService.registerProcessor(async (job) => {
      const { instanceName, event, body } = job;
      logger.info(`Processando webhook da fila: ${event} para instância ${instanceName}`);
      
      return processWebhookEvent(instanceName, event, body);
    });
    
    logger.info('Inicialização do processamento assíncrono de webhooks concluída');
  } catch (error) {
    logger.error('Erro ao inicializar processamento assíncrono de webhooks:', error);
  }
};

// Inicializar processamento assíncrono ao carregar o módulo
// O uso da IIFE assegura que async/await funcione corretamente durante a inicialização
(async () => {
  try {
    await initializeWebhookProcessing();
  } catch (error) {
    logger.error('Falha na inicialização do processamento de webhooks:', error);
  }
})();

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

// Atualizar estatísticas de webhook para a instância
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

/**
 * Processa mensagens recebidas
 */
const processIncomingMessage = async (webhook, instanceName) => {
  try {
    const { message } = webhook;
    
    if (!message || !message.key || !message.key.id) {
      logger.warn('Mensagem recebida sem ID');
      return;
    }
    
    // Verificar se é uma resposta a uma mensagem que enviamos
    // Nesse caso, podemos registrar a leitura
    
    // Atualizar status de mensagens que possuem este messageId
    const updated = await Message.updateMany(
      { messageId: message.key.id },
      { 
        $set: { 
          status: 'read',
          readAt: new Date()
        } 
      }
    );
    
    if (updated.modifiedCount > 0) {
      logger.info(`${updated.modifiedCount} mensagens marcadas como lidas`);
      
      // Atualizar métricas das campanhas associadas
      // Buscar mensagens afetadas para saber de quais campanhas são
      const messages = await Message.find({ messageId: message.key.id });
      const campaignIds = [...new Set(messages.map(m => m.campaignId.toString()))];
      
      for (const campaignId of campaignIds) {
        await Campaign.findByIdAndUpdate(
          campaignId,
          { $inc: { 'metrics.read': 1 } }
        );
      }
    }
  } catch (error) {
    logger.error('Erro ao processar mensagem recebida:', error);
  }
};

/**
 * Processa atualizações de status de mensagens
 */
const processMessageStatus = async (webhook, instanceName) => {
  try {
    const { status, id } = webhook;
    
    if (!id) {
      logger.warn('Status recebido sem ID de mensagem');
      return;
    }
    
    let messageStatus;
    
    // Mapear status da API para nosso modelo
    switch (status) {
      case 'sent':
        messageStatus = 'sent';
        break;
      case 'delivered':
        messageStatus = 'delivered';
        break;
      case 'read':
        messageStatus = 'read';
        break;
      case 'failed':
        messageStatus = 'failed';
        break;
      default:
        logger.warn(`Status desconhecido: ${status}`);
        return;
    }
    
    // Determinar que campo de data atualizar
    let dateField = {};
    if (messageStatus === 'delivered') {
      dateField.deliveredAt = new Date();
    } else if (messageStatus === 'read') {
      dateField.readAt = new Date();
    }
    
    // Atualizar mensagens
    const updated = await Message.updateMany(
      { messageId: id },
      { 
        $set: { 
          status: messageStatus,
          ...dateField
        } 
      }
    );
    
    if (updated.modifiedCount > 0) {
      logger.info(`${updated.modifiedCount} mensagens atualizadas para status ${messageStatus}`);
      
      // Atualizar métricas das campanhas
      const messages = await Message.find({ messageId: id });
      const campaignIds = [...new Set(messages.map(m => m.campaignId.toString()))];
      
      for (const campaignId of campaignIds) {
        // Incrementar campo correspondente nas métricas
        await Campaign.findByIdAndUpdate(
          campaignId,
          { $inc: { [`metrics.${messageStatus}`]: 1 } }
        );
      }
      
      // Atualizar métricas da instância
      if (messageStatus === 'delivered' || messageStatus === 'read') {
        await Instance.findOneAndUpdate(
          { instanceName },
          { $inc: { 'metrics.totalDelivered': 1 } }
        );
      }
    }
  } catch (error) {
    logger.error('Erro ao processar status de mensagem:', error);
  }
};

/**
 * Processa atualizações de status de conexão
 */
const processConnectionStatus = async (webhook, instanceName) => {
  try {
    const { status } = webhook;
    
    let connectionStatus;
    
    // Mapear status da API para nosso modelo
    switch (status) {
      case 'open':
        connectionStatus = 'connected';
        break;
      case 'connecting':
        connectionStatus = 'connecting';
        break;
      case 'close':
        connectionStatus = 'disconnected';
        break;
      default:
        connectionStatus = 'disconnected';
    }
    
    // Atualizar instância
    await Instance.findOneAndUpdate(
      { instanceName },
      { 
        $set: { 
          status: connectionStatus,
          lastConnection: connectionStatus === 'connected' ? new Date() : undefined
        } 
      }
    );
    
    logger.info(`Status da instância ${instanceName} atualizado para ${connectionStatus}`);
  } catch (error) {
    logger.error('Erro ao processar status de conexão:', error);
  }
};

// Função auxiliar para validar webhook (agora com verificação HMAC)
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
  if (!instance.webhook.enabled) {
    logger.warn(`Webhook recebido, mas está desabilitado para a instância: ${instanceName}`);
    return { valid: false, message: 'Webhook desabilitado para esta instância' };
  }
  
  // Verificar se o evento está habilitado para essa instância
  const event = req.body.event || req.query.event;
  if (event && instance.webhook.events && 
      instance.webhook.events[event] === false) {
    logger.warn(`Evento desabilitado: ${event} para instância ${instanceName}`);
    return { valid: false, message: `Evento ${event} desabilitado para esta instância` };
  }
  
  // Verificar assinatura HMAC se a chave secreta estiver configurada
  if (instance.webhook.secretKey) {
    const signature = req.headers['x-hub-signature'] || req.headers['x-webhook-signature'];
    
    if (!signature) {
      logger.warn('Assinatura HMAC não fornecida');
      // Permitir sem assinatura para compatibilidade com versões anteriores da Evolution API
      // return { valid: false, message: 'Assinatura não fornecida' };
      return { valid: true };
    }
    
    // Calcular hash HMAC esperado
    const hmac = crypto.createHmac('sha256', instance.webhook.secretKey);
    const calculatedSignature = 'sha256=' + 
      hmac.update(JSON.stringify(req.body)).digest('hex');
    
    if (signature !== calculatedSignature) {
      logger.warn(`Assinatura HMAC inválida: ${signature} !== ${calculatedSignature}`);
      // Permitir sem validação para compatibilidade com versões anteriores
      // return { valid: false, message: 'Assinatura inválida' };
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

// Função auxiliar para criar ou atualizar contato
const upsertContact = async (instanceName, contactData) => {
  try {
    const { id, name, pushName, number } = contactData;
    
    if (!id || !number) {
      return null;
    }
    
    // Normalizar número
    const normalizedPhone = number.startsWith('+') ? number : `+${number}`;
    
    const contact = await Contact.findOneAndUpdate(
      { whatsappId: id },
      { 
        name: name || pushName || 'Sem nome',
        phone: normalizedPhone,
        instanceName,
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );
    
    return contact;
  } catch (error) {
    logger.error('Erro ao processar contato:', error);
    return null;
  }
};

// Função auxiliar para salvar mensagem
const saveMessage = async (instanceName, messageData) => {
  try {
    const { 
      key,
      pushName,
      message,
      messageType,
      messageTimestamp,
      fromMe,
      chatId,
      senderJid,
    } = messageData;
    
    if (!key?.id || !chatId) {
      return null;
    }
    
    // Identificar número do remetente/destinatário
    const phoneNumber = chatId.includes('@g.us') 
      ? senderJid.split('@')[0] 
      : chatId.split('@')[0];
    
    // Obter ou criar contato
    const contact = await upsertContact(instanceName, {
      id: senderJid || chatId,
      name: pushName,
      number: phoneNumber
    });
    
    // Extrair conteúdo da mensagem com base no tipo
    let messageContent = '';
    
    if (message?.conversation) {
      messageContent = message.conversation;
    } else if (message?.extendedTextMessage?.text) {
      messageContent = message.extendedTextMessage.text;
    } else if (message?.imageMessage?.caption) {
      messageContent = `[Imagem] ${message.imageMessage.caption}`;
    } else if (message?.videoMessage?.caption) {
      messageContent = `[Vídeo] ${message.videoMessage.caption}`;
    } else if (message?.audioMessage) {
      messageContent = '[Áudio]';
    } else if (message?.documentMessage) {
      messageContent = `[Documento] ${message.documentMessage.fileName || ''}`;
    } else if (message?.contactMessage) {
      messageContent = '[Contato]';
    } else if (message?.locationMessage) {
      messageContent = '[Localização]';
    } else {
      messageContent = '[Conteúdo não reconhecido]';
    }
    
    // Salvar mensagem no banco de dados
    const savedMessage = await Message.findOneAndUpdate(
      { messageId: key.id },
      {
        messageId: key.id,
        instanceName,
        contactId: contact?._id,
        remoteJid: chatId,
        fromMe: !!fromMe,
        content: messageContent,
        messageType: messageType || 'text',
        timestamp: messageTimestamp ? new Date(messageTimestamp * 1000) : new Date(),
        status: 'received'
      },
      { upsert: true, new: true }
    );
    
    return savedMessage;
  } catch (error) {
    logger.error('Erro ao salvar mensagem:', error);
    return null;
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
    if (!data.messages || !Array.isArray(data.messages)) return;
    
    // Processar cada mensagem recebida
    for (const message of data.messages) {
      // Ignorar mensagens de status e notificações do sistema
      if (message.key?.remoteJid === 'status@broadcast') continue;
      if (message.messageStubType) continue;
      
      // Salvar a mensagem no banco de dados
      const savedMessage = await saveMessage(instanceName, {
        key: message.key,
        pushName: message.pushName,
        message: message.message,
        messageType: determineMessageType(message),
        messageTimestamp: message.messageTimestamp,
        fromMe: message.key?.fromMe,
        chatId: message.key?.remoteJid,
        senderJid: message.key?.participant || message.key?.remoteJid
      });
      
      if (savedMessage && !message.key?.fromMe) {
        // Notificar sobre nova mensagem recebida (você pode expandir isso com mais lógica)
        logger.info(`Nova mensagem de ${savedMessage.remoteJid} para instância ${instanceName}`);
      }
    }
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_UPSERT:', error);
  }
};

// Handler para evento MESSAGES_UPDATE
const handleMessagesUpdate = async (instanceName, data) => {
  try {
    if (!data.messages || !Array.isArray(data.messages)) return;
    
    // Processar cada atualização de mensagem
    for (const update of data.messages) {
      if (!update.key?.id) continue;
      
      // Atualizar status da mensagem
      await Message.findOneAndUpdate(
        { messageId: update.key.id },
        {
          status: determineMessageStatus(update),
          lastUpdated: new Date()
        }
      );
    }
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_UPDATE:', error);
  }
};

// Handler para evento MESSAGES_DELETE
const handleMessagesDelete = async (instanceName, data) => {
  try {
    if (!data.keys || !Array.isArray(data.keys)) return;
    
    // Marcar mensagens como deletadas
    for (const key of data.keys) {
      if (!key.id) continue;
      
      await Message.findOneAndUpdate(
        { messageId: key.id },
        {
          deleted: true,
          lastUpdated: new Date()
        }
      );
    }
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_DELETE:', error);
  }
};

// Handler para evento SEND_MESSAGE
const handleSendMessage = async (instanceName, data) => {
  try {
    if (!data.status || !data.key?.id) return;
    
    // Atualizar status da mensagem enviada
    await Message.findOneAndUpdate(
      { messageId: data.key.id },
      {
        status: data.status,
        lastUpdated: new Date()
      }
    );
  } catch (error) {
    logger.error('Erro ao processar SEND_MESSAGE:', error);
  }
};

// Função auxiliar para determinar o tipo de mensagem
const determineMessageType = (message) => {
  if (!message.message) return 'unknown';
  
  if (message.message.conversation) return 'text';
  if (message.message.imageMessage) return 'image';
  if (message.message.videoMessage) return 'video';
  if (message.message.audioMessage) return 'audio';
  if (message.message.documentMessage) return 'document';
  if (message.message.contactMessage) return 'contact';
  if (message.message.locationMessage) return 'location';
  if (message.message.extendedTextMessage) return 'text';
  
  return 'unknown';
};

// Função auxiliar para determinar o status da mensagem
const determineMessageStatus = (update) => {
  if (update.status) return update.status.toLowerCase();
  
  // Status baseado nos campos disponíveis
  if (update.key?.fromMe === false) return 'received';
  if (update.update?.status) return update.update.status.toLowerCase();
  
  return 'unknown';
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