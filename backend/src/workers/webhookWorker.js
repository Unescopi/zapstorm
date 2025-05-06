/**
 * Worker para processamento de webhooks em segundo plano
 * Este worker consome a fila RabbitMQ de webhooks e processa cada evento
 */

const logger = require('../utils/logger');
const { connectToDatabase } = require('../config/database');
const webhookQueueService = require('../services/webhookQueueService');
const { Instance, WebhookLog, Message, Campaign, Contact, Alert } = require('../models');

// Importações de controladores necessários para processamento
const functions = {
  handleConnectionUpdate: async (instanceName, data) => {
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
      
      logger.info(`Status da instância ${instanceName} atualizado para ${status}`);
    } catch (error) {
      logger.error('Erro ao processar CONNECTION_UPDATE:', error);
    }
  },
  
  handleQrCodeUpdated: async (instanceName, data) => {
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
      
      logger.info(`QR code atualizado para instância ${instanceName}`);
    } catch (error) {
      logger.error('Erro ao processar QRCODE_UPDATED:', error);
    }
  },
  
  handleMessagesUpsert: async (instanceName, data) => {
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
          // Notificar sobre nova mensagem recebida
          logger.info(`Nova mensagem de ${savedMessage.remoteJid} para instância ${instanceName}`);
        }
      }
    } catch (error) {
      logger.error('Erro ao processar MESSAGES_UPSERT:', error);
    }
  },
  
  handleMessagesUpdate: async (instanceName, data) => {
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
  },
  
  handleMessagesDelete: async (instanceName, data) => {
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
  },
  
  handleSendMessage: async (instanceName, data) => {
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
  }
};

// Funções auxiliares importadas do webhookController
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

const determineMessageStatus = (update) => {
  if (update.status) return update.status.toLowerCase();
  
  // Status baseado nos campos disponíveis
  if (update.key?.fromMe === false) return 'received';
  if (update.update?.status) return update.update.status.toLowerCase();
  
  return 'unknown';
};

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

/**
 * Processa um evento de webhook
 */
const processWebhookEvent = async (data) => {
  try {
    const { instanceName, event, body } = data;
    
    // Iniciar o log do webhook
    const webhookLog = {
      instanceName,
      event,
      payload: body,
      status: 'success',
      processingStart: Date.now()
    };
    
    try {
      // Processar diferentes tipos de eventos
      switch (event) {
        case 'CONNECTION_UPDATE':
          await functions.handleConnectionUpdate(instanceName, body);
          break;
          
        case 'QRCODE_UPDATED':
          await functions.handleQrCodeUpdated(instanceName, body);
          break;
          
        case 'MESSAGES_UPSERT':
          await functions.handleMessagesUpsert(instanceName, body);
          break;
          
        case 'MESSAGES_UPDATE':
          await functions.handleMessagesUpdate(instanceName, body);
          break;
          
        case 'MESSAGES_DELETE':
          await functions.handleMessagesDelete(instanceName, body);
          break;
          
        case 'SEND_MESSAGE':
          await functions.handleSendMessage(instanceName, body);
          break;
          
        default:
          logger.info(`Evento não tratado especificamente: ${event}`);
      }
      
      // Finalizar o log com sucesso
      webhookLog.processingTimeMs = Date.now() - webhookLog.processingStart;
      webhookLog.responseStatus = 200;
      webhookLog.responseMessage = 'Processado com sucesso';
      
      // Salvar log do webhook
      await WebhookLog.create(webhookLog);
      
      return true;
    } catch (error) {
      // Finalizar o log com erro
      webhookLog.status = 'failed';
      webhookLog.processingTimeMs = Date.now() - webhookLog.processingStart;
      webhookLog.responseStatus = 500;
      webhookLog.responseMessage = `Erro: ${error.message}`;
      
      // Salvar log do webhook
      await WebhookLog.create(webhookLog);
      
      // Incrementar contador de falhas
      await Instance.findOneAndUpdate(
        { instanceName },
        { $inc: { 'webhook.failedWebhooks': 1 } }
      );
      
      throw error;
    }
  } catch (error) {
    logger.error(`Erro ao processar evento de webhook: ${error.message}`);
    return false;
  }
};

/**
 * Inicializa o worker
 */
async function startWorker() {
  logger.info('Iniciando worker de processamento de webhooks...');
  
  try {
    // Conectar ao banco de dados
    await connectToDatabase();
    logger.info('Conectado ao banco de dados');
    
    // Inicializar o serviço de fila
    await webhookQueueService.initialize();
    logger.info('Serviço de fila inicializado');
    
    // Registrar o processador
    await webhookQueueService.registerProcessor(processWebhookEvent);
    logger.info('Processador de webhooks registrado');
    
    logger.info('Worker de webhooks inicializado com sucesso, aguardando eventos...');
  } catch (error) {
    logger.error('Erro ao inicializar worker de webhooks:', error);
    process.exit(1);
  }
}

// Iniciar o worker
startWorker(); 