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