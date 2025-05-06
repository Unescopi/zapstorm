/**
 * Worker para processamento assíncrono de webhooks
 * Este worker consome a fila de webhooks e processa os eventos
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const logger = require('../utils/logger');
const queueService = require('../services/queueService');
const webhookAnalyticsService = require('../services/webhookAnalyticsService');
const EvolutionApiService = require('../services/evolutionApiService');

// Modelos
const { Instance, Message, Campaign, Alert } = require('../models');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Log de inicialização com informações de ambiente
logger.info('==========================================');
logger.info('INICIANDO WEBHOOK WORKER');
logger.info(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
logger.info(`MongoDB URI: ${process.env.MONGO_URI ? '(configurado)' : '(não configurado)'}`);
logger.info(`RabbitMQ URI: ${process.env.RABBITMQ_URI || 'amqp://localhost'}`);
logger.info('==========================================');

// Conexão com MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zapstorm')
  .then(() => logger.info('Webhook Worker conectado ao MongoDB'))
  .catch(err => {
    logger.error('Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });

/**
 * Processa webhook da fila
 */
const processWebhook = async (webhookData) => {
  try {
    const { instanceName, event, body, receivedAt } = webhookData;
    
    logger.info(`Processando webhook: ${event} para instância ${instanceName}`);
    
    // Buscar instância
    const instance = await Instance.findOne({ instanceName });
    if (!instance) {
      logger.error(`Instância não encontrada para webhook: ${instanceName}`);
      return;
    }
    
    // Processar diferentes tipos de eventos
    switch (event) {
      case 'CONNECTION_UPDATE':
        await handleConnectionUpdate(instance, body);
        break;
        
      case 'QRCODE_UPDATED':
        await handleQrCodeUpdated(instance, body);
        break;
        
      case 'MESSAGES_UPSERT':
        await handleMessagesUpsert(instance, body);
        break;
        
      case 'MESSAGES_UPDATE':
      case 'MESSAGE_ACK_UPDATE':
        await handleMessagesUpdate(instance, body, event);
        break;
        
      case 'MESSAGES_DELETE':
        await handleMessagesDelete(instance, body);
        break;
        
      case 'SEND_MESSAGE':
        await handleSendMessage(instance, body);
        break;
        
      case 'STATUS_INSTANCE':
        await handleStatusInstance(instance, body);
        break;
        
      default:
        logger.info(`Evento não tratado especificamente: ${event}`);
        // Alimentar o serviço de analytics para eventos desconhecidos também
        await webhookAnalyticsService.processMessageStatusUpdate({
          instanceName,
          type: event,
          data: body,
          receivedAt
        });
    }
    
    return true;
  } catch (error) {
    logger.error(`Erro ao processar webhook: ${error.message}`);
    return false;
  }
};

/**
 * Handlers para diferentes tipos de eventos
 */
const handleConnectionUpdate = async (instance, data) => {
  try {
    if (!data.connection) return;
    
    const connectionState = data.connection.state || 'UNKNOWN';
    
    // Mapear estado da Evolution API para nosso modelo
    const statusMap = {
      'CONNECTED': 'connected',
      'OPEN': 'connected',
      'CONNECTING': 'connecting',
      'DISCONNECTED': 'disconnected',
      'LOGGED_OUT': 'disconnected',
      'CONFLICT': 'error',
      'UNLAUNCHED': 'disconnected',
      'UNPAIRED': 'disconnected',
      'UNPAIRED_IDLE': 'disconnected'
    };
    
    const newStatus = statusMap[connectionState] || instance.status;
    
    // Atualizar status da instância
    const updateData = {
      status: newStatus
    };
    
    // Registrar data/hora da conexão ou desconexão
    if (newStatus === 'connected' && instance.status !== 'connected') {
      updateData.lastConnection = new Date();
    } else if (newStatus === 'disconnected' && instance.status === 'connected') {
      updateData.lastDisconnection = new Date();
    }
    
    await Instance.findByIdAndUpdate(instance._id, updateData);
    
    logger.info(`Status da instância ${instance.instanceName} atualizado para ${newStatus}`);
    
    // Se desconectou, pausar campanhas ativas
    if (newStatus === 'disconnected' && instance.status === 'connected') {
      const pausedCount = await webhookAnalyticsService.pauseActiveInstanceCampaigns(instance._id);
      if (pausedCount > 0) {
        logger.warn(`${pausedCount} campanhas pausadas devido a desconexão da instância ${instance.instanceName}`);
      }
    }
    
    // Criar alerta para certos status
    if (['disconnected', 'connected'].includes(newStatus)) {
      await Alert.create({
        type: newStatus === 'connected' ? 'success' : 'warning',
        title: newStatus === 'connected' ? 'Instância Conectada' : 'Instância Desconectada',
        message: `A instância ${instance.instanceName} está ${newStatus === 'connected' ? 'online' : 'offline'}`,
        source: 'whatsapp',
        sourceId: instance.instanceName,
        read: false
      });
    }
  } catch (error) {
    logger.error(`Erro ao processar atualização de conexão: ${error.message}`, error);
  }
};

const handleQrCodeUpdated = async (instance, data) => {
  try {
    if (!data.qrcode) return;
    
    // Atualizar QR code na instância
    await Instance.findByIdAndUpdate(
      instance._id,
      { 
        qrcode: data.qrcode,
        status: 'connecting',
        lastUpdated: new Date()
      }
    );
    
    // Criar alerta
    await Alert.create({
      type: 'info',
      title: 'QR Code Atualizado',
      message: `Novo QR code disponível para instância ${instance.instanceName}`,
      source: 'whatsapp',
      sourceId: instance.instanceName,
      read: false
    });
  } catch (error) {
    logger.error(`Erro ao processar QR code: ${error.message}`, error);
  }
};

const handleMessagesUpsert = async (instance, data) => {
  try {
    // Enviar para serviço de analytics para processamento avançado
    await webhookAnalyticsService.processMessageStatusUpdate({
      instanceName: instance.instanceName,
      type: 'MESSAGES_UPSERT',
      data
    });
    
    // Processar mensagens recebidas se necessário
    if (data.messages && Array.isArray(data.messages)) {
      for (const message of data.messages) {
        // Verificar se é mensagem de resposta
        if (message.key && 
            message.key.fromMe === false && 
            message.message) {
          // Processar mensagem recebida
          await processIncomingMessage(instance, message);
        }
      }
    }
  } catch (error) {
    logger.error(`Erro ao processar MESSAGES_UPSERT: ${error.message}`, error);
  }
};

const handleMessagesUpdate = async (instance, data, eventType) => {
  try {
    // Enviar para serviço de analytics para detecção de bloqueios e padrões
    await webhookAnalyticsService.processMessageStatusUpdate({
      instanceName: instance.instanceName,
      type: eventType,
      data
    });
    
    // Processar atualizações de status
    if (data.statuses && Array.isArray(data.statuses)) {
      for (const status of data.statuses) {
        await updateMessageStatus(instance, status);
      }
    } else if (data.status && data.key && data.key.id) {
      // Formato alternativo
      await updateMessageStatus(instance, data);
    }
  } catch (error) {
    logger.error(`Erro ao processar ${eventType}: ${error.message}`, error);
  }
};

const handleMessagesDelete = async (instance, data) => {
  try {
    if (!data.keys || !Array.isArray(data.keys)) return;
    
    for (const key of data.keys) {
      if (key.id) {
        // Atualizar mensagem no banco de dados
        await Message.findOneAndUpdate(
          { messageId: key.id },
          { 
            isDeleted: true,
            $push: {
              statusHistory: {
                status: 'deleted',
                timestamp: new Date(),
                details: 'Mensagem apagada'
              }
            }
          }
        );
      }
    }
  } catch (error) {
    logger.error(`Erro ao processar MESSAGES_DELETE: ${error.message}`, error);
  }
};

const handleSendMessage = async (instance, data) => {
  try {
    if (!data.status || !data.key?.id) return;
    
    // Status da mensagem enviada
    await Message.findOneAndUpdate(
      { messageId: data.key.id },
      {
        status: data.status.toLowerCase(),
        $push: {
          statusHistory: {
            status: data.status.toLowerCase(),
            timestamp: new Date(),
            details: JSON.stringify(data)
          }
        }
      }
    );
  } catch (error) {
    logger.error(`Erro ao processar SEND_MESSAGE: ${error.message}`, error);
  }
};

const handleStatusInstance = async (instance, data) => {
  try {
    const updateData = {};
    
    // Atualizar informações do perfil se disponíveis
    if (data.profile) {
      updateData.profile = {
        name: data.profile.name,
        description: data.profile.description,
        phone: data.profile.phone,
        profilePictureUrl: data.profile.imgUrl
      };
    }
    
    // Atualizar métricas se disponíveis
    if (data.metrics) {
      updateData['metrics.totalSent'] = data.metrics.totalSent || instance.metrics.totalSent;
      updateData['metrics.totalDelivered'] = data.metrics.totalDelivered || instance.metrics.totalDelivered;
      updateData['metrics.totalRead'] = data.metrics.totalRead || instance.metrics.totalRead;
      updateData['metrics.lastUpdateTime'] = new Date();
    }
    
    if (Object.keys(updateData).length > 0) {
      await Instance.findByIdAndUpdate(instance._id, { $set: updateData });
    }
  } catch (error) {
    logger.error(`Erro ao processar STATUS_INSTANCE: ${error.message}`, error);
  }
};

/**
 * Processa mensagem recebida (resposta)
 */
const processIncomingMessage = async (instance, message) => {
  try {
    // Verificar se é resposta a uma mensagem nossa
    const quotedMessageId = message.message?.extendedTextMessage?.contextInfo?.stanzaId || 
                           message.message?.conversation?.contextInfo?.stanzaId;
    
    if (!quotedMessageId) return;
    
    // Buscar mensagem original
    const originalMessage = await Message.findOne({ messageId: quotedMessageId });
    if (!originalMessage) return;
    
    // Extrair conteúdo da resposta
    let replyContent = '';
    if (message.message.conversation) {
      replyContent = message.message.conversation;
    } else if (message.message.extendedTextMessage?.text) {
      replyContent = message.message.extendedTextMessage.text;
    } else if (message.message.imageMessage?.caption) {
      replyContent = `[Imagem] ${message.message.imageMessage.caption}`;
    } else {
      replyContent = '[Conteúdo não textual]';
    }
    
    // Registrar resposta
    const reply = new Message({
      campaignId: originalMessage.campaignId,
      contactId: originalMessage.contactId,
      instanceId: instance._id,
      messageId: message.key.id,
      content: replyContent,
      isReply: true,
      replyToMessageId: quotedMessageId,
      status: 'received',
      createdAt: new Date()
    });
    
    await reply.save();
    
    // Atualizar métricas da campanha
    await Campaign.findByIdAndUpdate(
      originalMessage.campaignId,
      { $inc: { 'metrics.replies': 1 } }
    );
    
    logger.info(`Resposta registrada para mensagem ${quotedMessageId}: ${replyContent.substring(0, 50)}...`);
  } catch (error) {
    logger.error(`Erro ao processar mensagem recebida: ${error.message}`, error);
  }
};

/**
 * Atualiza status de mensagem
 */
const updateMessageStatus = async (instance, status) => {
  try {
    if (!status.id && !status.key?.id) return;
    
    const messageId = status.id || status.key?.id;
    const statusValue = status.status?.toLowerCase() || (status.key?.fromMe ? 'sent' : 'received');
    
    // Mapeamento de códigos ACK para status
    let mappedStatus = statusValue;
    if (status.ack !== undefined) {
      const ackMap = {
        '-1': 'error',
        '0': 'pending',
        '1': 'sent',
        '2': 'delivered',
        '3': 'read',
        '4': 'played'
      };
      mappedStatus = ackMap[status.ack.toString()] || statusValue;
    }
    
    // Determinar campo de timestamp
    const timestampField = {
      'sent': 'sentAt',
      'delivered': 'deliveredAt',
      'read': 'readAt'
    }[mappedStatus];
    
    // Preparar atualização
    const updateData = { status: mappedStatus };
    
    if (timestampField) {
      updateData[timestampField] = new Date();
    }
    
    // Registrar histórico
    updateData.$push = {
      statusHistory: {
        status: mappedStatus,
        timestamp: new Date(),
        details: JSON.stringify(status)
      }
    };
    
    // Atualizar mensagem
    const result = await Message.findOneAndUpdate(
      { messageId },
      updateData
    );
    
    // Se mensagem foi atualizada, atualizar métricas da campanha
    if (result && result.campaignId) {
      const metricField = {
        'sent': 'metrics.sent',
        'delivered': 'metrics.delivered',
        'read': 'metrics.read',
        'error': 'metrics.failed',
        'failed': 'metrics.failed'
      }[mappedStatus];
      
      if (metricField) {
        const update = { $inc: {} };
        update.$inc[metricField] = 1;
        
        await Campaign.findByIdAndUpdate(result.campaignId, update);
      }
    }
  } catch (error) {
    logger.error(`Erro ao atualizar status de mensagem: ${error.message}`, error);
  }
};

/**
 * Inicializa o worker e começa a processar a fila de webhooks
 */
const startWebhookWorker = async () => {
  try {
    // Conectar ao serviço de fila
    await queueService.connect();
    
    // Definir o número de mensagens que podem ser processadas simultaneamente
    const concurrency = parseInt(process.env.WEBHOOK_WORKER_CONCURRENCY || '5');
    
    // Processar fila de webhooks
    await queueService.channel().consume(
      queueService.queues.WEBHOOKS,
      async (msg) => {
        if (msg) {
          try {
            const webhookData = JSON.parse(msg.content.toString());
            logger.debug(`Recebido webhook da fila: ${webhookData.event} para ${webhookData.instanceName}`);
            
            const success = await processWebhook(webhookData);
            
            if (success) {
              // Confirmar processamento
              queueService.channel().ack(msg);
            } else {
              // Falha no processamento, recolocar na fila ou DLQ
              if (msg.fields.redelivered) {
                // Se já foi reentregue, não tentar novamente
                logger.warn(`Webhook rejeitado após reentrega: ${webhookData.event} - ${webhookData.instanceName}`);
                queueService.channel().nack(msg, false, false);
              } else {
                // Primeira falha, tentar novamente
                logger.info(`Webhook devolvido à fila para nova tentativa: ${webhookData.event} - ${webhookData.instanceName}`);
                queueService.channel().nack(msg, false, true);
              }
            }
          } catch (error) {
            logger.error(`Erro ao processar webhook da fila: ${error.message}`);
            
            // Se erro de parsing ou outros erros graves, não tentar novamente
            queueService.channel().nack(msg, false, false);
          }
        }
      },
      { prefetch: concurrency }
    );
    
    logger.info(`Webhook worker iniciado com sucesso. Concorrência: ${concurrency}`);
    
    // Iniciar verificações periódicas de saúde
    startPeriodicHealthChecks();
  } catch (error) {
    logger.error(`Erro ao iniciar webhook worker: ${error.message}`);
    
    // Tentar reconectar após um atraso
    setTimeout(() => {
      startWebhookWorker();
    }, 10000);
  }
};

/**
 * Inicia verificações periódicas de saúde das instâncias
 */
const startPeriodicHealthChecks = () => {
  // Verificar saúde a cada 30 minutos
  setInterval(async () => {
    try {
      await webhookAnalyticsService.analyzeInstancesHealth();
      logger.info('Verificação periódica de saúde das instâncias concluída');
    } catch (error) {
      logger.error(`Erro na verificação periódica de saúde: ${error.message}`);
    }
  }, 30 * 60 * 1000);
  
  // Verificar instâncias em quarentena a cada 2 horas
  setInterval(async () => {
    try {
      await webhookAnalyticsService.checkQuarantinedInstances();
      logger.info('Verificação de instâncias em quarentena concluída');
    } catch (error) {
      logger.error(`Erro na verificação de instâncias em quarentena: ${error.message}`);
    }
  }, 2 * 60 * 60 * 1000);
};

// Iniciar worker
startWebhookWorker();

// Gerenciamento de processo
process.on('SIGTERM', async () => {
  logger.info('Webhook worker recebeu SIGTERM, encerrando graciosamente...');
  await queueService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Webhook worker recebeu SIGINT, encerrando graciosamente...');
  await queueService.close();
  process.exit(0);
}); 