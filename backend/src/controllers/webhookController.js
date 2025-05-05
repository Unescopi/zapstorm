const { Message, Instance, Campaign, Contact } = require('../models');
const logger = require('../utils/logger');
const EvolutionApiService = require('../services/evolutionApiService');
const alertService = require('../services/alertService');

/**
 * Processa webhooks da API Evolution
 * Esta função recebe eventos como MESSAGE_UPSERT, CONNECTION_UPDATE, etc.
 */
exports.processWebhook = async (req, res) => {
  try {
    const { instanceName } = req.params;
    const webhook = req.body;

    logger.info(`Webhook recebido para instância ${instanceName}: ${JSON.stringify(webhook).substring(0, 500)}...`);

    // Verificar se a instância existe
    const instance = await Instance.findOne({ instanceName });
    if (!instance) {
      logger.error(`Webhook recebido para instância inexistente: ${instanceName}`);
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }

    // Identificar o tipo de evento
    // A Evolution API fornece esses dados no webhook
    let eventProcessed = false;
    
    if (webhook.event) {
      // Eventos no formato antigo (para compatibilidade)
      switch (webhook.event) {
        case 'message':
        case 'MESSAGES_UPSERT':
          await processMessagesUpsert(webhook, instanceName, instance);
          eventProcessed = true;
          break;
        
        case 'message-status':
        case 'MESSAGES_UPDATE':
          await processMessagesUpdate(webhook, instanceName, instance);
          eventProcessed = true;
          break;
          
        case 'MESSAGES_DELETE':
          await processMessagesDelete(webhook, instanceName, instance);
          eventProcessed = true;
          break;
          
        case 'SEND_MESSAGE':
          await processSendMessage(webhook, instanceName, instance);
          eventProcessed = true;
          break;
          
        case 'connection-status':
        case 'CONNECTION_UPDATE':
          await processConnectionUpdate(webhook, instanceName, instance);
          eventProcessed = true;
          break;
          
        default:
          logger.info(`Evento não processado: ${webhook.event}`);
      }
    } else if (webhook.type) {
      // Formato mais recente da Evolution API usa 'type' em vez de 'event'
      switch (webhook.type) {
        case 'MESSAGES_UPSERT':
          await processMessagesUpsert(webhook, instanceName, instance);
          eventProcessed = true;
          break;
          
        case 'MESSAGES_UPDATE':
          await processMessagesUpdate(webhook, instanceName, instance);
          eventProcessed = true;
          break;
          
        case 'MESSAGES_DELETE':
          await processMessagesDelete(webhook, instanceName, instance);
          eventProcessed = true;
          break;
          
        case 'SEND_MESSAGE':
          await processSendMessage(webhook, instanceName, instance);
          eventProcessed = true;
          break;
          
        case 'CONNECTION_UPDATE':
          await processConnectionUpdate(webhook, instanceName, instance);
          eventProcessed = true;
          break;
          
        default:
          logger.info(`Tipo de evento não processado: ${webhook.type}`);
      }
    }

    // Criar alerta para eventos bem-sucedidos
    if (eventProcessed) {
      // Determinar tipo e nível do evento
      const eventType = webhook.event || webhook.type || 'UNKNOWN';
      
      // Determinar se o evento é uma mensagem recebida
      let isIncomingMessage = false;
      if ((eventType === 'MESSAGES_UPSERT' || eventType === 'message') && 
          webhook.messages && webhook.messages.length > 0) {
        const message = webhook.messages[0];
        isIncomingMessage = message.key && !message.key.fromMe;
      }
      
      // Se é uma mensagem recebida, criar um alerta
      if (isIncomingMessage) {
        await alertService.createAlert(
          'webhook_event',
          'info',
          `Nova mensagem recebida na instância ${instanceName}`,
          {
            eventType,
            instanceName,
            timestamp: new Date()
          },
          {
            type: 'instance',
            id: instance._id,
            name: instance.instanceName
          }
        );
      }
    }

    // Sempre retornar 200 para confirmar recebimento
    res.status(200).json({
      success: true,
      message: 'Webhook processado com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao processar webhook:', error);
    
    // Mesmo com erro, retornar 200 para evitar reenvios
    res.status(200).json({
      success: false,
      message: 'Erro ao processar webhook, mas foi recebido'
    });
  }
};

/**
 * Processa eventos de novas mensagens (MESSAGES_UPSERT)
 */
const processMessagesUpsert = async (webhook, instanceName, instance) => {
  try {
    logger.info(`Processando MESSAGES_UPSERT para instância ${instanceName}`);
    
    const messages = webhook.messages || (webhook.data && webhook.data.messages) || [];
    
    if (!messages.length) {
      logger.warn('Evento MESSAGES_UPSERT sem mensagens');
      return;
    }
    
    let newContacts = 0;
    let receivedMessages = 0;
    
    for (const message of messages) {
      if (!message.key || !message.key.id) {
        logger.warn('Mensagem sem ID no evento MESSAGES_UPSERT');
        continue;
      }
      
      // Se a mensagem for enviada por nós mesmos, não criar contato
      if (message.key.fromMe) {
        logger.info(`Ignorando mensagem própria: ${message.key.id}`);
        continue;
      }
      
      // Mensagem recebida
      receivedMessages++;
      
      // Extrair número do remetente
      const sender = message.key.remoteJid.split('@')[0];
      
      // Verificar se o contato existe e atualizá-lo ou criá-lo
      let contact = await Contact.findOne({ phoneNumber: sender });
      let isNewContact = false;
      
      if (!contact) {
        // Extrair nome do contato se disponível
        const pushName = message.pushName || '';
        
        // Criar contato
        contact = await Contact.create({
          phoneNumber: sender,
          name: pushName,
          source: 'webhook',
          lastMessageAt: new Date()
        });
        
        isNewContact = true;
        newContacts++;
        
        logger.info(`Novo contato criado a partir do webhook: ${sender} (${pushName})`);
      } else {
        // Atualizar última mensagem
        await Contact.findByIdAndUpdate(
          contact._id,
          { lastMessageAt: new Date() }
        );
      }
      
      // Verificar se é uma resposta a uma mensagem que enviamos
      // Nesse caso, podemos registrar a leitura
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
        const messages = await Message.find({ messageId: message.key.id });
        const campaignIds = [...new Set(messages.map(m => m.campaignId ? m.campaignId.toString() : null).filter(Boolean))];
        
        for (const campaignId of campaignIds) {
          await Campaign.findByIdAndUpdate(
            campaignId,
            { $inc: { 'metrics.read': 1 } }
          );
        }
      }
      
      // Criar alerta se é um novo contato
      if (isNewContact) {
        await alertService.createAlert(
          'new_contact',
          'info',
          `Novo contato criado: ${contact.name || contact.phoneNumber}`,
          {
            contact: {
              id: contact._id,
              name: contact.name,
              phoneNumber: contact.phoneNumber
            },
            instanceName
          },
          {
            type: 'instance',
            id: instance._id,
            name: instance.instanceName
          }
        );
      }
    }
    
    // Criar alerta resumindo as mensagens recebidas se houver alguma
    if (receivedMessages > 0) {
      await alertService.createAlert(
        'messages_received',
        'info',
        `${receivedMessages} mensagen(s) recebida(s) na instância ${instanceName}`,
        {
          count: receivedMessages,
          newContacts,
          instanceName
        },
        {
          type: 'instance',
          id: instance._id,
          name: instance.instanceName
        }
      );
    }
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_UPSERT:', error);
  }
};

/**
 * Processa eventos de atualização de mensagens (MESSAGES_UPDATE)
 */
const processMessagesUpdate = async (webhook, instanceName, instance) => {
  try {
    logger.info(`Processando MESSAGES_UPDATE para instância ${instanceName}`);
    
    const updates = webhook.messages || (webhook.data && webhook.data.messages) || [];
    
    if (!updates.length) {
      logger.warn('Evento MESSAGES_UPDATE sem atualizações');
      return;
    }
    
    let messagesDelivered = 0;
    let messagesRead = 0;
    
    for (const update of updates) {
      if (!update.key || !update.key.id) {
        logger.warn('Atualização sem ID no evento MESSAGES_UPDATE');
        continue;
      }
      
      // Se o status for 2, significa que foi entregue
      // Se o status for 3, significa que foi lido
      let messageStatus;
      let dateField = {};
      
      if (update.update && update.update.status === 2) {
        messageStatus = 'delivered';
        dateField.deliveredAt = new Date();
        messagesDelivered++;
      } else if (update.update && update.update.status === 3) {
        messageStatus = 'read';
        dateField.readAt = new Date();
        messagesRead++;
      } else {
        logger.info(`Status desconhecido ou não relevante: ${update.update?.status}`);
        continue;
      }
      
      // Atualizar mensagens no banco
      const updated = await Message.updateMany(
        { messageId: update.key.id },
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
        const messages = await Message.find({ messageId: update.key.id });
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
          await Instance.findOneAndUpdate(
            { instanceName },
            { $inc: { 'metrics.totalDelivered': 1 } }
          );
        }
      }
    }
    
    // Criar alerta se houver atualizações
    if (messagesDelivered > 0 || messagesRead > 0) {
      let message = '';
      if (messagesDelivered > 0 && messagesRead > 0) {
        message = `${messagesDelivered} mensagen(s) entregue(s) e ${messagesRead} lida(s) na instância ${instanceName}`;
      } else if (messagesDelivered > 0) {
        message = `${messagesDelivered} mensagen(s) entregue(s) na instância ${instanceName}`;
      } else {
        message = `${messagesRead} mensagen(s) lida(s) na instância ${instanceName}`;
      }
      
      await alertService.createAlert(
        'messages_status_update',
        'info',
        message,
        {
          delivered: messagesDelivered,
          read: messagesRead,
          instanceName
        },
        {
          type: 'instance',
          id: instance._id,
          name: instance.instanceName
        }
      );
    }
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_UPDATE:', error);
  }
};

/**
 * Processa eventos de exclusão de mensagens (MESSAGES_DELETE)
 */
const processMessagesDelete = async (webhook, instanceName, instance) => {
  try {
    logger.info(`Processando MESSAGES_DELETE para instância ${instanceName}`);
    
    const deletedMessages = webhook.messages || (webhook.data && webhook.data.messages) || [];
    
    if (!deletedMessages.length) {
      logger.warn('Evento MESSAGES_DELETE sem mensagens');
      return;
    }
    
    let messagesDeleted = 0;
    
    for (const deletedMsg of deletedMessages) {
      if (!deletedMsg.key || !deletedMsg.key.id) {
        logger.warn('Mensagem excluída sem ID no evento MESSAGES_DELETE');
        continue;
      }
      
      // Marcar mensagens como excluídas
      const updated = await Message.updateMany(
        { messageId: deletedMsg.key.id },
        { $set: { isDeleted: true, deletedAt: new Date() } }
      );
      
      if (updated.modifiedCount > 0) {
        logger.info(`${updated.modifiedCount} mensagens marcadas como excluídas`);
        messagesDeleted += updated.modifiedCount;
      }
    }
    
    // Criar alerta se mensagens foram excluídas
    if (messagesDeleted > 0) {
      await alertService.createAlert(
        'messages_deleted',
        'info',
        `${messagesDeleted} mensagen(s) excluída(s) na instância ${instanceName}`,
        {
          count: messagesDeleted,
          instanceName
        },
        {
          type: 'instance',
          id: instance._id,
          name: instance.instanceName
        }
      );
    }
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_DELETE:', error);
  }
};

/**
 * Processa eventos de envio de mensagens (SEND_MESSAGE)
 */
const processSendMessage = async (webhook, instanceName, instance) => {
  try {
    logger.info(`Processando SEND_MESSAGE para instância ${instanceName}`);
    
    const messageData = webhook.message || (webhook.data && webhook.data.message);
    
    if (!messageData || !messageData.key || !messageData.key.id) {
      logger.warn('Evento SEND_MESSAGE sem dados válidos de mensagem');
      return;
    }
    
    // Atualizar mensagem no banco
    const messageId = messageData.key.id;
    
    const updated = await Message.updateMany(
      { messageId },
      { 
        $set: { 
          status: 'sent',
          sentAt: new Date()
        } 
      }
    );
    
    if (updated.modifiedCount > 0) {
      logger.info(`${updated.modifiedCount} mensagens atualizadas para status 'sent'`);
      
      // Atualizar métricas das campanhas
      const messages = await Message.find({ messageId });
      const campaignIds = [...new Set(messages.map(m => m.campaignId ? m.campaignId.toString() : null).filter(Boolean))];
      
      // Determinar para qual campanha a mensagem foi enviada
      let campaignName = "Desconhecida";
      if (campaignIds.length > 0) {
        const campaign = await Campaign.findById(campaignIds[0]);
        if (campaign) {
          campaignName = campaign.name;
        }
      }
      
      for (const campaignId of campaignIds) {
        await Campaign.findByIdAndUpdate(
          campaignId,
          { 
            $inc: { 'metrics.sent': 1, 'metrics.pending': -1 },
          }
        );
      }
      
      // Atualizar métricas da instância
      await Instance.findOneAndUpdate(
        { instanceName },
        { $inc: { 'metrics.totalSent': 1 } }
      );
      
      // Criar alerta de mensagem enviada
      await alertService.createAlert(
        'message_sent',
        'info',
        `Mensagem enviada pela instância ${instanceName}`,
        {
          messageId,
          campaignIds,
          campaignName,
          instanceName
        },
        {
          type: 'instance',
          id: instance._id,
          name: instance.instanceName
        }
      );
    }
  } catch (error) {
    logger.error('Erro ao processar SEND_MESSAGE:', error);
  }
};

/**
 * Processa eventos de atualização de conexão (CONNECTION_UPDATE)
 */
const processConnectionUpdate = async (webhook, instanceName, instance) => {
  try {
    logger.info(`Processando CONNECTION_UPDATE para instância ${instanceName}`);
    
    const connectionInfo = webhook.connection || (webhook.data && webhook.data.connection) || {};
    const connectionStatus = connectionInfo.status || connectionInfo;
    
    if (!connectionStatus) {
      logger.warn('Evento CONNECTION_UPDATE sem status de conexão');
      return;
    }
    
    let instanceStatus;
    
    // Mapear status da API para nosso modelo
    switch (connectionStatus) {
      case 'open':
      case 'connected':
        instanceStatus = 'connected';
        break;
      case 'connecting':
        instanceStatus = 'connecting';
        break;
      case 'close':
      case 'disconnected':
        instanceStatus = 'disconnected';
        break;
      default:
        instanceStatus = 'unknown';
    }
    
    // Atualizar instância
    await Instance.findOneAndUpdate(
      { instanceName },
      { 
        $set: { 
          status: instanceStatus,
          lastConnection: instanceStatus === 'connected' ? new Date() : undefined
        } 
      }
    );
    
    logger.info(`Status da instância ${instanceName} atualizado para ${instanceStatus}`);
    
    // Criar alerta para mudanças de status
    const alertLevel = instanceStatus === 'connected' ? 'info' : 
                        instanceStatus === 'connecting' ? 'info' : 'warning';
    
    const alertMessage = instanceStatus === 'connected' ? 
                          `Instância ${instanceName} conectada com sucesso` : 
                          instanceStatus === 'connecting' ? 
                          `Instância ${instanceName} tentando conexão` : 
                          `Instância ${instanceName} desconectada`;
    
    await alertService.createAlert(
      'connection_update',
      alertLevel,
      alertMessage,
      {
        instanceName,
        status: instanceStatus,
        previousStatus: instance.status
      },
      {
        type: 'instance',
        id: instance._id,
        name: instance.instanceName
      }
    );
  } catch (error) {
    logger.error('Erro ao processar CONNECTION_UPDATE:', error);
  }
}; 