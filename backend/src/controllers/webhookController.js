const { Message, Instance, Campaign } = require('../models');
const logger = require('../utils/logger');

/**
 * Processa webhooks da API Evolution
 * Esta função recebe eventos de mensagens e atualizações de status
 */
exports.processWebhook = async (req, res) => {
  try {
    const { instanceName } = req.params;
    const webhook = req.body;

    logger.info(`Webhook recebido para instância ${instanceName}: ${JSON.stringify(webhook)}`);

    // Verificar se a instância existe
    const instance = await Instance.findOne({ instanceName });
    if (!instance) {
      logger.error(`Webhook recebido para instância inexistente: ${instanceName}`);
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }

    // Processa diferentes tipos de eventos
    if (webhook.event) {
      // Formato antigo do nosso sistema
      switch (webhook.event) {
        case 'message':
          await processIncomingMessage(webhook, instanceName);
          break;
        
        case 'message-status':
          await processMessageStatus(webhook, instanceName);
          break;
          
        case 'connection-status':
          await processConnectionStatus(webhook, instanceName);
          break;
          
        default:
          logger.warn(`Tipo de evento desconhecido: ${webhook.event}`);
      }
    } 
    // Eventos da Evolution API (v2)
    else if (webhook.event_type) {
      switch (webhook.event_type) {
        // Eventos de mensagens
        case 'MESSAGES_UPSERT':
          await processEvolutionMessages(webhook, instanceName);
          break;
          
        // Evento de status de mensagem
        case 'MESSAGES_UPDATE':
          await processEvolutionMessageStatus(webhook, instanceName);
          break;
          
        // Evento de conexão
        case 'CONNECTION_UPDATE':
          await processEvolutionConnectionStatus(webhook, instanceName);
          break;
          
        // Evento de QR Code
        case 'QRCODE_UPDATED':
          await processEvolutionQrCode(webhook, instanceName);
          break;
          
        default:
          logger.info(`Evento Evolution recebido (não processado): ${webhook.event_type}`);
      }
    }
    // Se não tiver event ou event_type, verificar estrutura específica para cada tipo de evento
    else {
      // Tentar identificar o tipo de evento pela estrutura
      if (webhook.status && (webhook.status === 'open' || webhook.status === 'connecting' || webhook.status === 'close')) {
        await processConnectionStatus(webhook, instanceName);
      } else if (webhook.qrcode) {
        await processEvolutionQrCode(webhook, instanceName);
      } else {
        logger.warn(`Webhook sem tipo de evento identificável: ${JSON.stringify(webhook)}`);
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
 * Processa mensagens recebidas (formato Evolution API)
 */
const processEvolutionMessages = async (webhook, instanceName) => {
  try {
    if (!webhook.data || !webhook.data.messages || !Array.isArray(webhook.data.messages)) {
      logger.warn('Formato de mensagem Evolution inválido');
      return;
    }
    
    for (const message of webhook.data.messages) {
      if (!message.key || !message.key.id) {
        continue;
      }
      
      // Extrair ID da mensagem
      const messageId = message.key.id;
      
      // Verificar se é uma mensagem do sistema ou uma resposta a uma mensagem que enviamos
      if (message.key.fromMe === false) {
        // Mensagem recebida (não enviada por nós)
        logger.info(`Mensagem recebida de ${message.key.remoteJid}: ${JSON.stringify(message.message)}`);
        // Aqui poderia implementar lógica para resposta automática
      } else {
        // Mensagem que nós enviamos, atualizar status para 'sent'
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
          logger.info(`${updated.modifiedCount} mensagens marcadas como enviadas (messageId: ${messageId})`);
          
          // Atualizar métricas das campanhas
          const messages = await Message.find({ messageId });
          const campaignIds = [...new Set(messages.map(m => m.campaignId?.toString()).filter(Boolean))];
          
          for (const campaignId of campaignIds) {
            await Campaign.findByIdAndUpdate(
              campaignId,
              { 
                $inc: { 'metrics.sent': 1, 'metrics.pending': -1 },
                $set: { lastUpdated: new Date() }
              }
            );
          }
        }
      }
    }
  } catch (error) {
    logger.error('Erro ao processar mensagens Evolution:', error);
  }
};

/**
 * Processa atualizações de status de mensagens (formato Evolution API)
 */
const processEvolutionMessageStatus = async (webhook, instanceName) => {
  try {
    if (!webhook.data || !webhook.data.messages || !Array.isArray(webhook.data.messages)) {
      logger.warn('Formato de atualização de mensagem Evolution inválido');
      return;
    }
    
    for (const message of webhook.data.messages) {
      if (!message.key || !message.key.id) {
        continue;
      }
      
      // Extrair ID da mensagem
      const messageId = message.key.id;
      
      // Verificar se é uma mensagem enviada por nós
      if (message.key.fromMe !== true) {
        continue;
      }
      
      // Determinar o status com base nos campos presentes
      let messageStatus = null;
      let dateField = {};
      
      if (message.update.status === 1) {
        messageStatus = 'received';
      } else if (message.update.status === 2) {
        messageStatus = 'delivered';
        dateField.deliveredAt = new Date();
      } else if (message.update.status === 3) {
        messageStatus = 'read';
        dateField.readAt = new Date();
      }
      
      if (!messageStatus) {
        continue;
      }
      
      // Atualizar mensagens
      const updated = await Message.updateMany(
        { messageId },
        { 
          $set: { 
            status: messageStatus,
            ...dateField
          } 
        }
      );
      
      if (updated.modifiedCount > 0) {
        logger.info(`${updated.modifiedCount} mensagens atualizadas para status ${messageStatus} (messageId: ${messageId})`);
        
        // Atualizar métricas das campanhas
        const messages = await Message.find({ messageId });
        const campaignIds = [...new Set(messages.map(m => m.campaignId?.toString()).filter(Boolean))];
        
        for (const campaignId of campaignIds) {
          // Incrementar campo correspondente nas métricas
          await Campaign.findByIdAndUpdate(
            campaignId,
            { 
              $inc: { [`metrics.${messageStatus}`]: 1 },
              $set: { lastUpdated: new Date() }
            }
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
  } catch (error) {
    logger.error('Erro ao processar status de mensagem Evolution:', error);
  }
};

/**
 * Processa atualizações de status de conexão (formato Evolution API)
 */
const processEvolutionConnectionStatus = async (webhook, instanceName) => {
  try {
    if (!webhook.data || !webhook.data.state) {
      logger.warn('Formato de status de conexão Evolution inválido');
      return;
    }
    
    const evolutionStatus = webhook.data.state;
    
    let connectionStatus;
    
    // Mapear status da Evolution API para nosso modelo
    switch (evolutionStatus) {
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
          lastConnection: connectionStatus === 'connected' ? new Date() : undefined,
          lastUpdated: new Date()
        } 
      }
    );
    
    logger.info(`Status da instância ${instanceName} atualizado para ${connectionStatus} via Evolution API`);
  } catch (error) {
    logger.error('Erro ao processar status de conexão Evolution:', error);
  }
};

/**
 * Processa atualizações de QR Code (formato Evolution API)
 */
const processEvolutionQrCode = async (webhook, instanceName) => {
  try {
    // Verificar se o webhook contém dados do QR code
    if (!webhook.data || (!webhook.data.qrcode && !webhook.qrcode)) {
      logger.warn('Webhook de QR Code sem dados');
      return;
    }
    
    const qrcode = webhook.data?.qrcode || webhook.qrcode;
    
    // Atualizar instância com o QR code
    await Instance.findOneAndUpdate(
      { instanceName },
      { 
        $set: { 
          qrcode,
          status: 'connecting',
          lastUpdated: new Date()
        } 
      }
    );
    
    logger.info(`QR Code atualizado para instância ${instanceName}`);
  } catch (error) {
    logger.error('Erro ao processar QR Code:', error);
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