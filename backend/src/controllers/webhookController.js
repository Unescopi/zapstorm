const { Message, Instance, Campaign, WebhookConfig } = require('../models');
const logger = require('../utils/logger');
const EvolutionApiService = require('../services/evolutionApiService');

/**
 * Processa webhooks de mensagens recebidas (MESSAGES_UPSERT)
 */
const processMessagesUpsert = async (webhook, instanceName) => {
  try {
    logger.info(`Processando evento MESSAGES_UPSERT para ${instanceName}`);
    const messages = webhook.data?.messages || [];
    
    for (const message of messages) {
      // Processar apenas mensagens de outros usuários (não mensagens que nós enviamos)
      if (!message.key.fromMe) {
        logger.info(`Nova mensagem recebida de ${message.key.remoteJid}`);
        
        // Aqui você pode implementar lógica de resposta automática, registrar a mensagem no banco, etc.
        
        // Exemplo: atualizar status de mensagens que possivelmente enviamos
        if (message.key.id) {
          await Message.updateMany(
            { messageId: message.key.id },
            { 
              $set: { 
                status: 'delivered',
                deliveredAt: new Date()
              } 
            }
          );
        }
      }
    }
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_UPSERT:', error);
  }
};

/**
 * Processa webhooks de atualização de mensagens (MESSAGES_UPDATE)
 */
const processMessagesUpdate = async (webhook, instanceName) => {
  try {
    logger.info(`Processando evento MESSAGES_UPDATE para ${instanceName}`);
    const messages = webhook.data?.messages || [];
    
    for (const message of messages) {
      // Atualizar status de mensagens que possuem este messageId
      if (message.key.id) {
        // Se o status for read, atualizar no banco
        if (message.update.status === 'READ') {
          await Message.updateMany(
            { messageId: message.key.id },
            { 
              $set: { 
                status: 'read',
                readAt: new Date()
              } 
            }
          );
          
          logger.info(`Mensagem ${message.key.id} marcada como lida`);
          
          // Atualizar métricas das campanhas associadas
          const updatedMessages = await Message.find({ messageId: message.key.id });
          const campaignIds = [...new Set(updatedMessages.map(m => m.campaignId?.toString()).filter(Boolean))];
          
          for (const campaignId of campaignIds) {
            await Campaign.findByIdAndUpdate(
              campaignId,
              { $inc: { 'metrics.read': 1 } }
            );
          }
        }
      }
    }
  } catch (error) {
    logger.error('Erro ao processar MESSAGES_UPDATE:', error);
  }
};

/**
 * Processa webhooks de conexão (CONNECTION_UPDATE)
 */
const processConnectionUpdate = async (webhook, instanceName) => {
  try {
    logger.info(`Processando evento CONNECTION_UPDATE para ${instanceName}`);
    
    // Mapear status da conexão para o nosso modelo
    let connectionStatus;
    switch (webhook.data?.state) {
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
        connectionStatus = webhook.data?.state || 'disconnected';
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
    logger.error('Erro ao processar CONNECTION_UPDATE:', error);
  }
};

/**
 * Processa webhooks de mensagens enviadas (SEND_MESSAGE)
 */
const processSendMessage = async (webhook, instanceName) => {
  try {
    logger.info(`Processando evento SEND_MESSAGE para ${instanceName}`);
    
    // Obter os dados da mensagem enviada
    const messageData = webhook.data;
    if (!messageData || !messageData.key?.id) {
      logger.warn('Dados incompletos de SEND_MESSAGE');
      return;
    }
    
    // Atualizar status da mensagem no banco
    await Message.updateMany(
      { messageId: messageData.key.id },
      { 
        $set: { 
          status: 'sent',
          sentAt: new Date()
        } 
      }
    );
    
    logger.info(`Mensagem ${messageData.key.id} marcada como enviada`);
    
    // Atualizar métricas das campanhas associadas
    const updatedMessages = await Message.find({ messageId: messageData.key.id });
    const campaignIds = [...new Set(updatedMessages.map(m => m.campaignId?.toString()).filter(Boolean))];
    
    for (const campaignId of campaignIds) {
      await Campaign.findByIdAndUpdate(
        campaignId,
        { $inc: { 'metrics.sent': 1, 'metrics.pending': -1 } }
      );
    }
    
    // Atualizar métricas da instância
    await Instance.findOneAndUpdate(
      { instanceName },
      { $inc: { 'metrics.totalSent': 1 } }
    );
  } catch (error) {
    logger.error('Erro ao processar SEND_MESSAGE:', error);
  }
};

/**
 * Processa webhooks da API Evolution
 * Esta função recebe eventos e encaminha para o processador apropriado
 */
exports.processWebhook = async (req, res) => {
  try {
    const { instanceName } = req.params;
    const webhook = req.body;
    const event = req.headers['x-hub-event'] || webhook.event;

    logger.info(`Webhook recebido para instância ${instanceName}: Evento ${event}`);
    logger.debug(`Dados do webhook: ${JSON.stringify(webhook)}`);

    // Verificar se a instância existe
    const instance = await Instance.findOne({ instanceName });
    if (!instance) {
      logger.error(`Webhook recebido para instância inexistente: ${instanceName}`);
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }

    // Processar diferentes tipos de eventos
    if (event) {
      switch (event) {
        case 'MESSAGES_UPSERT':
          await processMessagesUpsert(webhook, instanceName);
          break;
          
        case 'MESSAGES_UPDATE':
          await processMessagesUpdate(webhook, instanceName);
          break;
        
        case 'CONNECTION_UPDATE':
          await processConnectionUpdate(webhook, instanceName);
          break;
          
        case 'SEND_MESSAGE':
          await processSendMessage(webhook, instanceName);
          break;
          
        default:
          logger.info(`Evento ${event} recebido, mas não processado especificamente`);
      }
    } else {
      logger.warn(`Webhook sem evento definido: ${JSON.stringify(webhook)}`);
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
 * Configura webhook para uma instância
 */
exports.configureWebhook = async (req, res) => {
  try {
    const { instanceName } = req.params;
    const { enabled, url, webhookByEvents, events, base64 } = req.body;
    
    // Verificar se a instância existe
    const instance = await Instance.findOne({ instanceName });
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    // Validar dados básicos
    if (enabled && !url) {
      return res.status(400).json({
        success: false,
        message: 'URL do webhook é obrigatória quando habilitado'
      });
    }
    
    // Criar ou atualizar configuração de webhook no banco
    let webhookConfig = await WebhookConfig.findOne({ instanceName });
    
    if (!webhookConfig) {
      webhookConfig = new WebhookConfig({
        instanceName,
        enabled,
        url,
        webhookByEvents,
        events,
        base64
      });
    } else {
      webhookConfig.enabled = enabled;
      if (url) webhookConfig.url = url;
      if (webhookByEvents !== undefined) webhookConfig.webhookByEvents = webhookByEvents;
      if (events) webhookConfig.events = events;
      if (base64 !== undefined) webhookConfig.base64 = base64;
    }
    
    await webhookConfig.save();
    
    // Se estiver habilitado, configurar no Evolution API
    if (enabled) {
      const evolutionApi = new EvolutionApiService(instance.serverUrl, instance.apiKey);
      
      const payload = {
        url,
        webhookByEvents,
        base64,
        events
      };
      
      await evolutionApi.configureWebhook(instanceName, payload);
      
      logger.info(`Webhook configurado com sucesso para instância ${instanceName}`);
    }
    
    res.status(200).json({
      success: true,
      message: enabled ? 'Webhook configurado com sucesso' : 'Webhook desabilitado com sucesso',
      data: webhookConfig
    });
  } catch (error) {
    logger.error('Erro ao configurar webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao configurar webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Obtém configuração de webhook para uma instância
 */
exports.getWebhookConfig = async (req, res) => {
  try {
    const { instanceName } = req.params;
    
    // Buscar configuração no banco
    const webhookConfig = await WebhookConfig.findOne({ instanceName });
    
    if (!webhookConfig) {
      return res.status(404).json({
        success: false,
        message: 'Configuração de webhook não encontrada'
      });
    }
    
    res.status(200).json({
      success: true,
      data: webhookConfig
    });
  } catch (error) {
    logger.error('Erro ao obter configuração de webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter configuração de webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 