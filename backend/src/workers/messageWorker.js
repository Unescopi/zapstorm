const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const queueService = require('../services/queueService');
const logger = require('../utils/logger');
const rateLimiterService = require('../services/rateLimiterService');
const messageVariationService = require('../services/messageVariationService');
const messageWorkerService = require('../services/messageWorkerService');
const webhookAnalyticsService = require('../services/webhookAnalyticsService');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Log de inicialização com informações de ambiente
logger.info('==========================================');
logger.info('INICIANDO MESSAGE WORKER');
logger.info(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
logger.info(`MongoDB URI: ${process.env.MONGO_URI ? '(configurado)' : '(não configurado)'}`);
logger.info(`RabbitMQ URI: ${process.env.RABBITMQ_URI || 'amqp://localhost'}`);
logger.info(`Versão do Node: ${process.version}`);
logger.info(`Diretório de trabalho: ${process.cwd()}`);
logger.info('==========================================');

// Modelos
const { Message, Campaign, Contact, Template, Instance } = require('../models');
const EvolutionApiService = require('../services/evolutionApiService');

// Conexão com MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zapstorm')
  .then(() => logger.info('Worker conectado ao MongoDB'))
  .catch(err => {
    logger.error('Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });

// Configuração do worker
const workerSettings = {
  concurrency: parseInt(process.env.MESSAGE_WORKER_CONCURRENCY || 5)
};

// Processar mensagens na fila usando RabbitMQ em vez de Bull
async function processMessage(message) {
  const { messageId } = message;
  
  try {
    logger.info(`Processando mensagem ${messageId}`);
    
    // Buscar mensagem por ID
    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error(`Mensagem não encontrada: ${messageId}`);
    }
    
    // Verificar se já foi enviada ou cancelada
    if (['sent', 'delivered', 'read', 'canceled'].includes(message.status)) {
      logger.info(`Mensagem ${messageId} já processada (${message.status}), ignorando`);
      return { success: true, status: message.status, messageId };
    }
    
    // Verificar status da campanha
    const campaign = await Campaign.findById(message.campaignId);
    if (!campaign) {
      await Message.findByIdAndUpdate(messageId, {
        status: 'failed',
        errorDetails: 'Campanha não encontrada'
      });
      throw new Error(`Campanha não encontrada para mensagem ${messageId}`);
    }
    
    if (campaign.status !== 'running') {
      await Message.findByIdAndUpdate(messageId, {
        status: 'failed',
        errorDetails: `Campanha não está ativa (${campaign.status})`
      });
      throw new Error(`Campanha ${campaign._id} não está ativa, status: ${campaign.status}`);
    }
    
    // Verificar se a instância está em pausa anti-spam para esta campanha
    if (messageWorkerService.isInstancePaused(campaign._id, message.instanceId)) {
      // Reagendar para mais tarde (pausa anti-spam)
      const pauseInfo = await Campaign.findById(campaign._id).select('antiSpam');
      const pauseDuration = pauseInfo?.antiSpam?.pauseAfter?.duration?.max || 30000;
      
      await Message.findByIdAndUpdate(messageId, {
        status: 'scheduled_retry',
        scheduledRetryAt: new Date(Date.now() + pauseDuration),
        'antiSpamInfo.pausedForAntiSpam': true,
        'antiSpamInfo.pauseDuration': pauseDuration
      });
      
      logger.info(`Mensagem ${messageId} em pausa anti-spam, reagendada para ${pauseDuration/1000}s`);
      
      // Reagendar usando RabbitMQ com delay
      await addToQueue(messageId, pauseDuration);
      
      return { 
        success: false, 
        paused: true, 
        waitTime: pauseDuration,
        messageId
      };
    }
    
    // Enviar mensagem usando serviço anti-spam melhorado
    const result = await messageWorkerService.sendMessageWithAntiSpam(message);
    
    // Atualizar métricas da campanha se mensagem foi enviada com sucesso
    if (result.success) {
      await Campaign.findByIdAndUpdate(
        message.campaignId,
        { $inc: { 'metrics.sent': 1 } }
      );
    }
    
    return result;
  } catch (error) {
    logger.error(`Erro ao processar mensagem ${messageId}: ${error.message}`);
    
    // Atualizar status da mensagem
    await Message.findByIdAndUpdate(messageId, {
      status: 'failed',
      errorDetails: error.message
    });
    
    return { success: false, error: error.message, messageId };
  }
}

// Adicionar mensagem à fila usando RabbitMQ
const addToQueue = async (messageId, delay = 0) => {
  try {
    if (delay > 0) {
      // Usar fila de atraso do RabbitMQ
      await queueService.enqueueDeferredMessage({ messageId }, delay);
      logger.debug(`Mensagem ${messageId} adicionada à fila de atraso com delay de ${delay}ms`);
    } else {
      // Usar fila normal
      await queueService.enqueueMessage({ messageId });
      logger.debug(`Mensagem ${messageId} adicionada à fila`);
    }
    return true;
  } catch (error) {
    logger.error(`Erro ao adicionar mensagem ${messageId} à fila: ${error.message}`);
    return false;
  }
};

// Agendador para mensagens com retry
const startRetryScheduler = () => {
  setInterval(async () => {
    try {
      // Buscar mensagens com retry agendado para agora
      const messages = await Message.find({
        status: 'scheduled_retry',
        scheduledRetryAt: { $lte: new Date() },
        retries: { $lt: 5 } // Limitar a 5 tentativas
      }).limit(50);
      
      if (messages.length > 0) {
        logger.info(`Encontradas ${messages.length} mensagens para retry`);
        
        for (const message of messages) {
          // Verificar se a campanha ainda está ativa
          const campaign = await Campaign.findById(message.campaignId);
          if (!campaign || campaign.status !== 'running') {
            await Message.findByIdAndUpdate(message._id, {
              status: 'canceled',
              errorDetails: 'Campanha inativa durante retry'
            });
            continue;
          }
          
          // Verificar se instância ainda está conectada
          const instance = await Instance.findById(message.instanceId);
          if (!instance || instance.status !== 'connected') {
            // Verificar se podemos rotacionar para outra instância
            if (campaign.rotateInstances) {
              const newInstance = await messageWorkerService.getOptimalInstance(
                campaign, 
                message, 
                instance
              );
              
              if (newInstance && newInstance.status === 'connected') {
                logger.info(`Rotacionando mensagem ${message._id} para instância ${newInstance.instanceName} durante retry`);
                message.instanceId = newInstance._id;
                await message.save();
              } else {
                await Message.findByIdAndUpdate(message._id, {
                  status: 'failed',
                  errorDetails: 'Instância desconectada e nenhuma alternativa disponível'
                });
                continue;
              }
            } else {
              await Message.findByIdAndUpdate(message._id, {
                status: 'failed',
                errorDetails: 'Instância desconectada durante retry'
              });
              continue;
            }
          }
          
          // Atualizar status para pending e adicionar à fila novamente
          await Message.findByIdAndUpdate(message._id, {
            status: 'pending',
            scheduledRetryAt: null
          });
          
          // Adicionar à fila com delay aleatório para evitar picos
          const delay = Math.floor(Math.random() * 5000);
          await addToQueue(message._id, delay);
        }
      }
    } catch (error) {
      logger.error(`Erro no scheduler de retries: ${error.message}`);
    }
  }, 30000); // Verificar a cada 30 segundos
};

// Monitorar saúde das filas
const startQueueMonitor = () => {
  setInterval(async () => {
    try {
      const queueStatus = await queueService.getQueueStats();
      
      // Registrar estatísticas da fila para monitoramento
      logger.debug(`Estado da fila: ${JSON.stringify(queueStatus)}`);
      
      // Verificar se há acúmulo anormal de mensagens
      if (queueStatus.waiting > 1000 || queueStatus.active > 50) {
        logger.warn(`Acúmulo na fila de mensagens: ${queueStatus.waiting} pendentes, ${queueStatus.active} ativas`);
        
        // Verificar taxas das instâncias e ajustar se necessário
        await checkInstancesHealth();
      }
    } catch (error) {
      logger.error(`Erro no monitor da fila: ${error.message}`);
    }
  }, 60000); // Verificar a cada minuto
};

// Verificar saúde das instâncias e ajustar taxas se necessário
const checkInstancesHealth = async () => {
  try {
    // Acionar o serviço de webhook analytics para verificar saúde das instâncias
    await webhookAnalyticsService.analyzeInstancesHealth();
    
    // Verificar instâncias em quarentena para possível recuperação
    await webhookAnalyticsService.checkQuarantinedInstances();
  } catch (error) {
    logger.error(`Erro ao verificar saúde das instâncias: ${error.message}`);
  }
};

// Iniciar o worker para consumir mensagens da fila RabbitMQ
async function startMessageWorker() {
  try {
    // Inicializar serviço de filas
    if (!queueService.channel) {
      await queueService.connect();
    }
    
    // Consumir mensagens da fila
    await queueService.channel.consume(
      queueService.queues.MESSAGES,
      async (msg) => {
        if (msg) {
          try {
            const messageData = JSON.parse(msg.content.toString());
            logger.info(`Recebida mensagem da fila: ${messageData.messageId}`);
            
            const result = await processMessage(messageData);
            
            if (result && result.success) {
              logger.info(`Mensagem ${messageData.messageId} processada com sucesso`);
            } else {
              logger.warn(`Falha no processamento da mensagem ${messageData.messageId}`);
            }
            
            // Confirmar processamento da mensagem na fila
            queueService.channel.ack(msg);
          } catch (error) {
            logger.error('Erro ao processar mensagem da fila:', error);
            
            // Decisão de reprocessamento
            if (msg.fields.redelivered) {
              // Se já foi reentregue, não tentar novamente, mover para DLQ
              queueService.channel.nack(msg, false, false);
              logger.warn('Mensagem rejeitada e movida para DLQ');
            } else {
              // Tentar reprocessar
              queueService.channel.nack(msg, false, true);
              logger.info('Mensagem devolvida à fila para nova tentativa');
            }
          }
        }
      },
      {
        noAck: false
      }
    );
    
    // Também consumir a fila de atraso quando mensagens estiverem prontas
    await queueService.channel.consume(
      queueService.queues.DELAYED_MESSAGES,
      async (msg) => {
        if (msg) {
          try {
            const messageData = JSON.parse(msg.content.toString());
            logger.info(`Recebida mensagem atrasada da fila: ${messageData.messageId}`);
            
            // Mover para a fila principal para processamento
            await queueService.enqueueMessage(messageData);
            
            // Confirmar que a mensagem foi movida da fila de atraso
            queueService.channel.ack(msg);
          } catch (error) {
            logger.error('Erro ao processar mensagem da fila de atraso:', error);
            queueService.channel.nack(msg, false, false);
          }
        }
      },
      {
        noAck: false
      }
    );
    
    logger.info('Worker de mensagens iniciado com sucesso!');
    
    // Iniciar scheduler de retries e monitor da fila
    startRetryScheduler();
    startQueueMonitor();
  } catch (error) {
    logger.error('Erro ao iniciar worker de mensagens:', error);
    setTimeout(startMessageWorker, 10000);  // Tentar reconectar após 10 segundos
  }
}

// Verificar se uma campanha está completa
const checkAndCompleteCampaignIfNeeded = async (campaignId) => {
  if (!campaignId) return;
  
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return;
    
    // Atualizar lastUpdated
    campaign.lastUpdated = new Date();
    
    // Verificar métricas para determinar se a campanha está completa
    const totalProcessed = campaign.metrics.sent + campaign.metrics.failed;
    const totalMessages = campaign.metrics.total;
    
    // Se todas as mensagens foram processadas, marcar como concluída
    if (totalProcessed >= totalMessages) {
      campaign.status = 'completed';
      logger.info(`Campanha ${campaignId} marcada como concluída. Total de mensagens: ${totalMessages}, Enviadas: ${campaign.metrics.sent}, Falhas: ${campaign.metrics.failed}`);
    }
    
    await campaign.save();
  } catch (error) {
    logger.error(`Erro ao verificar conclusão da campanha ${campaignId}:`, error);
  }
};

// Iniciar o worker
startMessageWorker();

// Gerenciamento de processo
process.on('SIGTERM', async () => {
  logger.info('Worker de mensagens recebeu SIGTERM, encerrando graciosamente...');
  await queueService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Worker de mensagens recebeu SIGINT, encerrando graciosamente...');
  await queueService.close();
  process.exit(0);
});

module.exports = {
  addToQueue,
  startMessageWorker
}; 