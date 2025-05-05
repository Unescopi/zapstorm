const { Message, Instance, Campaign, Contact } = require('../models');
const logger = require('../utils/logger');
const queueService = require('../services/queueService');

/**
 * Processa webhooks da API Evolution
 * Esta função recebe eventos de mensagens, atualizações de status e outros eventos da API Evolution
 */
exports.processWebhook = async (req, res) => {
  try {
    const { instanceName } = req.params;
    const webhook = req.body;
    
    // Identificar o tipo de evento baseado no formato do webhook
    const eventType = determineEventType(webhook);

    logger.info(`Webhook recebido para instância ${instanceName}: Tipo: ${eventType}`);
    logger.debug(`Conteúdo do webhook: ${JSON.stringify(webhook)}`);

    // Verificar se a instância existe
    const instance = await Instance.findOne({ instanceName });
    if (!instance) {
      logger.error(`Webhook recebido para instância inexistente: ${instanceName}`);
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }

    // Processar o evento com base no tipo identificado
    switch (eventType) {
      case 'MESSAGES_UPSERT':
        await processIncomingMessage(webhook, instance);
        break;
      
      case 'MESSAGES_UPDATE':
        await processMessageUpdate(webhook, instance);
        break;
        
      case 'CONNECTION_UPDATE':
        await processConnectionUpdate(webhook, instance);
        break;
        
      case 'QRCODE_UPDATED':
        await processQrCodeUpdate(webhook, instance);
        break;
        
      case 'SEND_MESSAGE':
        await processMessageStatus(webhook, instance);
        break;
        
      case 'CONTACTS_UPSERT':
      case 'CONTACTS_UPDATE':
        await processContactUpdate(webhook, instance);
        break;
        
      case 'CONTACTS_SET':
        await processContactsInitialSync(webhook, instance);
        break;
        
      case 'CHATS_SET':
      case 'CHATS_UPSERT':
      case 'CHATS_UPDATE':
        // Implementar conforme necessário
        logger.info(`Evento ${eventType} recebido, mas não processado ativamente`);
        break;
        
      default:
        logger.warn(`Tipo de evento não tratado: ${eventType}`);
    }

    // Publicar evento para outras partes do sistema consumirem, se necessário
    await queueService.publishEvent({
      type: 'webhook_received',
      data: {
        instanceName,
        eventType,
        timestamp: new Date().toISOString(),
        webhook: webhook
      }
    });

    // Sempre retornar 200 para confirmar recebimento
    return res.status(200).json({
      success: true,
      message: 'Webhook processado com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao processar webhook:', error);
    logger.error(`Stack trace: ${error.stack}`);
    
    // Mesmo com erro, retornar 200 para evitar reenvios
    return res.status(200).json({
      success: false,
      message: 'Erro ao processar webhook, mas foi recebido'
    });
  }
};

/**
 * Determina o tipo de evento com base na estrutura do webhook
 * @param {Object} webhook - O payload do webhook
 * @returns {string} - O tipo de evento identificado
 */
function determineEventType(webhook) {
  // Verificar se o webhook especifica explicitamente o tipo de evento
  if (webhook.event) {
    return webhook.event;
  }
  
  // Para webhooks da Evolution API v2+
  if (webhook.type) {
    return webhook.type.toUpperCase();
  }
  
  // Se tem mensagem e a mensagem tem um remetente
  if (webhook.data && webhook.data.key && webhook.data.key.remoteJid) {
    return 'MESSAGES_UPSERT';
  }
  
  // Se contém status de QR code
  if (webhook.qrcode || (webhook.data && webhook.data.qrcode)) {
    return 'QRCODE_UPDATED';
  }
  
  // Se contém informações de estado de conexão
  if (webhook.state || (webhook.data && webhook.data.state)) {
    return 'CONNECTION_UPDATE';
  }
  
  // Se contém atualizações de contatos
  if (webhook.data && webhook.data.contacts) {
    return 'CONTACTS_UPDATE';
  }
  
  // Evento desconhecido
  return 'UNKNOWN';
}

/**
 * Processa mensagens recebidas (MESSAGES_UPSERT)
 */
async function processIncomingMessage(webhook, instance) {
  try {
    // Extrair dados conforme a estrutura do webhook da Evolution API
    const messageData = webhook.data || webhook;
    
    // Ignora se não for uma mensagem recebida
    if (messageData.key && messageData.key.fromMe) {
      logger.debug('Ignorando mensagem enviada por nós');
      return;
    }

    // Verificar se temos dados suficientes
    if (!messageData.key || !messageData.key.id) {
      logger.warn('Mensagem recebida sem ID');
      return;
    }
    
    // Extrair informações básicas da mensagem
    const messageId = messageData.key.id;
    const sender = messageData.key.remoteJid;
    const senderName = messageData.pushName || 'Desconhecido';
    
    // Extrair o conteúdo da mensagem
    let messageContent = '';
    if (messageData.message) {
      if (messageData.message.conversation) {
        messageContent = messageData.message.conversation;
      } else if (messageData.message.extendedTextMessage) {
        messageContent = messageData.message.extendedTextMessage.text;
      } else if (messageData.message.imageMessage) {
        messageContent = messageData.message.imageMessage.caption || '[Imagem]';
      } else if (messageData.message.videoMessage) {
        messageContent = messageData.message.videoMessage.caption || '[Vídeo]';
      } else if (messageData.message.audioMessage) {
        messageContent = '[Áudio]';
      } else if (messageData.message.documentMessage) {
        messageContent = messageData.message.documentMessage.fileName || '[Documento]';
      }
    }
    
    logger.info(`Mensagem recebida de ${senderName} (${sender}): ${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}`);
    
    // Verificar se é uma resposta para uma mensagem que enviamos
    // Atualizar mensagens em nossa base
    const updated = await Message.updateMany(
      { messageId: messageId },
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
      const messages = await Message.find({ messageId: messageId });
      const campaignIds = [...new Set(messages.map(m => m.campaignId ? m.campaignId.toString() : null).filter(Boolean))];
      
      for (const campaignId of campaignIds) {
        await Campaign.findByIdAndUpdate(
          campaignId,
          { $inc: { 'metrics.read': 1 } }
        );
      }
    }
    
    // Verificar se precisamos salvar o contato
    const phoneNumber = sender.split('@')[0]; // Remover @s.whatsapp.net ou @g.us
    
    // Se for um chat pessoal (não um grupo)
    if (sender.includes('@s.whatsapp.net')) {
      // Verificar se já temos este contato
      const existingContact = await Contact.findOne({ 
        $or: [
          { phoneNumber },
          { whatsappId: sender }
        ]
      });
      
      if (!existingContact) {
        // Criar novo contato
        const newContact = new Contact({
          name: senderName,
          phoneNumber,
          whatsappId: sender,
          source: 'chat',
          lastMessageAt: new Date()
        });
        
        await newContact.save();
        logger.info(`Novo contato criado a partir da mensagem: ${senderName} (${phoneNumber})`);
      } else {
        // Atualizar contato existente
        existingContact.lastMessageAt = new Date();
        
        // Atualizar nome se necessário
        if (senderName !== 'Desconhecido' && (!existingContact.name || existingContact.name === 'Desconhecido')) {
          existingContact.name = senderName;
        }
        
        await existingContact.save();
        logger.debug(`Contato atualizado: ${existingContact.name} (${phoneNumber})`);
      }
    }
  } catch (error) {
    logger.error('Erro ao processar mensagem recebida:', error);
    logger.error(`Stack trace: ${error.stack}`);
  }
}

/**
 * Processa atualizações de status de mensagens
 */
async function processMessageStatus(webhook, instance) {
  try {
    // Extrair dados conforme a estrutura do webhook da Evolution API
    const statusData = webhook.data || webhook;
    
    // Se não tiver ID da mensagem, não conseguimos processar
    if (!statusData.id) {
      logger.warn('Status recebido sem ID de mensagem');
      return;
    }
    
    const messageId = statusData.id;
    const status = statusData.status || statusData.ack || '';
    
    let messageStatus;
    
    // Mapear status da API para nosso modelo
    switch (status.toLowerCase()) {
      case 'sent':
      case '1':
        messageStatus = 'sent';
        break;
      case 'delivered':
      case '2':
        messageStatus = 'delivered';
        break;
      case 'read':
      case '3':
        messageStatus = 'read';
        break;
      case 'failed':
      case 'error':
      case '0':
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
      { messageId: messageId },
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
      const messages = await Message.find({ messageId: messageId });
      const campaignIds = [...new Set(messages.map(m => m.campaignId ? m.campaignId.toString() : null).filter(Boolean))];
      
      for (const campaignId of campaignIds) {
        // Incrementar campo correspondente nas métricas
        await Campaign.findByIdAndUpdate(
          campaignId,
          { $inc: { [`metrics.${messageStatus}`]: 1 } }
        );
      }
      
      // Atualizar métricas da instância
      if (messageStatus === 'delivered' || messageStatus === 'read') {
        await Instance.findByIdAndUpdate(
          instance._id,
          { $inc: { 'metrics.totalDelivered': 1 } }
        );
      }
    }
  } catch (error) {
    logger.error('Erro ao processar status de mensagem:', error);
    logger.error(`Stack trace: ${error.stack}`);
  }
}

/**
 * Processa atualizações de mensagens (MESSAGES_UPDATE)
 */
async function processMessageUpdate(webhook, instance) {
  try {
    // Por enquanto, processamos da mesma forma que mensagens normais
    await processMessageStatus(webhook, instance);
  } catch (error) {
    logger.error('Erro ao processar atualização de mensagem:', error);
    logger.error(`Stack trace: ${error.stack}`);
  }
}

/**
 * Processa atualizações de status de conexão
 */
async function processConnectionUpdate(webhook, instance) {
  try {
    // Extrair dados conforme a estrutura do webhook da Evolution API
    const connectionData = webhook.data || webhook;
    
    let connectionState;
    
    // Verificar os diferentes campos possíveis para o estado
    if (connectionData.state) {
      connectionState = connectionData.state;
    } else if (connectionData.connection) {
      connectionState = connectionData.connection;
    } else if (connectionData.status) {
      connectionState = connectionData.status;
    } else {
      logger.warn('Status de conexão não identificado');
      return;
    }
    
    let status;
    
    // Mapear status da API para nosso modelo
    switch (connectionState.toLowerCase()) {
      case 'open':
      case 'connected':
        status = 'connected';
        break;
      case 'connecting':
        status = 'connecting';
        break;
      case 'close':
      case 'disconnected':
      case 'loggedout':
        status = 'disconnected';
        break;
      default:
        logger.warn(`Estado de conexão desconhecido: ${connectionState}`);
        status = 'disconnected';
    }
    
    // Atualizar instância
    await Instance.findByIdAndUpdate(
      instance._id,
      { 
        $set: { 
          status: status,
          lastConnection: status === 'connected' ? new Date() : instance.lastConnection
        } 
      }
    );
    
    logger.info(`Status da instância ${instance.instanceName} atualizado para ${status}`);
  } catch (error) {
    logger.error('Erro ao processar status de conexão:', error);
    logger.error(`Stack trace: ${error.stack}`);
  }
}

/**
 * Processa atualizações de QR Code
 */
async function processQrCodeUpdate(webhook, instance) {
  try {
    // Extrair dados conforme a estrutura do webhook da Evolution API
    const qrcodeData = webhook.data || webhook;
    
    if (!qrcodeData.qrcode) {
      logger.warn('Webhook de QR Code sem dados do código');
      return;
    }
    
    logger.info(`QR Code atualizado para instância ${instance.instanceName}`);
    
    // Atualizar instância para status "connecting" se não estiver conectada
    if (instance.status !== 'connected') {
      await Instance.findByIdAndUpdate(
        instance._id,
        { status: 'connecting' }
      );
    }
    
    // Publicar evento de QR Code atualizado para outras partes do sistema
    await queueService.publishEvent({
      type: 'qrcode_updated',
      data: {
        instanceId: instance._id,
        instanceName: instance.instanceName,
        qrcode: qrcodeData.qrcode
      }
    });
  } catch (error) {
    logger.error('Erro ao processar QR Code:', error);
    logger.error(`Stack trace: ${error.stack}`);
  }
}

/**
 * Processa atualizações de contatos
 */
async function processContactUpdate(webhook, instance) {
  try {
    // Extrair dados conforme a estrutura do webhook da Evolution API
    const contactData = webhook.data || webhook;
    
    // Se não tiver dados de contatos, não podemos processar
    if (!contactData.contacts || !Array.isArray(contactData.contacts)) {
      logger.warn('Webhook de contatos sem dados válidos');
      return;
    }
    
    logger.info(`Recebidos ${contactData.contacts.length} contatos para atualização`);
    
    // Processar cada contato
    for (const contact of contactData.contacts) {
      if (!contact.id) {
        logger.debug('Contato sem ID, ignorando');
        continue;
      }
      
      const whatsappId = contact.id;
      const phoneNumber = whatsappId.split('@')[0]; // Remover @s.whatsapp.net
      const name = contact.name || contact.notify || contact.pushname || contact.shortName || 'Sem nome';
      
      // Verificar se já temos este contato
      const existingContact = await Contact.findOne({ 
        $or: [
          { phoneNumber },
          { whatsappId }
        ]
      });
      
      if (existingContact) {
        // Atualizar contato existente
        let updated = false;
        
        // Só atualizar nome se tivermos um valor melhor
        if (name !== 'Sem nome' && (!existingContact.name || existingContact.name === 'Desconhecido' || existingContact.name === 'Sem nome')) {
          existingContact.name = name;
          updated = true;
        }
        
        // Garantir que temos o whatsappId
        if (!existingContact.whatsappId) {
          existingContact.whatsappId = whatsappId;
          updated = true;
        }
        
        // Atualizar outros campos, se disponíveis
        if (contact.status && !existingContact.status) {
          existingContact.status = contact.status;
          updated = true;
        }
        
        if (contact.profilePicUrl && !existingContact.profilePictureUrl) {
          existingContact.profilePictureUrl = contact.profilePicUrl;
          updated = true;
        }
        
        if (updated) {
          await existingContact.save();
          logger.debug(`Contato atualizado: ${existingContact.name} (${phoneNumber})`);
        }
      } else {
        // Criar novo contato
        const newContact = new Contact({
          name,
          phoneNumber,
          whatsappId,
          status: contact.status || '',
          profilePictureUrl: contact.profilePicUrl || '',
          source: 'sync'
        });
        
        await newContact.save();
        logger.debug(`Novo contato criado: ${name} (${phoneNumber})`);
      }
    }
    
    logger.info(`Processamento de contatos concluído com sucesso`);
  } catch (error) {
    logger.error('Erro ao processar atualização de contatos:', error);
    logger.error(`Stack trace: ${error.stack}`);
  }
}

/**
 * Processa a sincronização inicial de contatos
 */
async function processContactsInitialSync(webhook, instance) {
  try {
    // Chama o mesmo processamento de atualização de contatos
    await processContactUpdate(webhook, instance);
  } catch (error) {
    logger.error('Erro ao processar sincronização inicial de contatos:', error);
    logger.error(`Stack trace: ${error.stack}`);
  }
} 