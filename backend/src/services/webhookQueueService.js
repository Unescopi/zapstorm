/**
 * Serviço de fila para processamento de webhooks de forma assíncrona
 * Usa o sistema de filas RabbitMQ existente no ZapStorm
 */

const logger = require('../utils/logger');
const queueService = require('./queueService');

// Usar o singleton do QueueService (já é uma instância)
const queue = queueService;

// Adicionar nova fila para webhooks
queue.queues.WEBHOOKS = 'zapstorm-webhooks';

// Processador de webhook registrado
let webhookProcessor = null;

/**
 * Inicializar o serviço de filas para webhooks
 */
async function initialize() {
  try {
    // Conectar ao RabbitMQ se ainda não estiver conectado
    if (!queue.channel) {
      await queue.connect();
    }
    
    // Configurar fila de webhooks
    await queue.channel.assertQueue(queue.queues.WEBHOOKS, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: queue.queues.DLQ
    });
    
    logger.info('Fila de webhooks configurada com sucesso');
    return true;
  } catch (error) {
    logger.error('Erro ao inicializar fila de webhooks:', error);
    return false;
  }
}

/**
 * Adicionar webhook à fila para processamento assíncrono
 * @param {Object} data Dados do webhook
 */
async function addToQueue(data) {
  try {
    if (!queue.channel) {
      try {
        await queue.connect();
      } catch (connError) {
        logger.error('Erro ao conectar ao RabbitMQ:', connError);
        return false;
      }
    }
    
    // Adicionar timestamp para rastreamento
    const webhookData = {
      ...data,
      enqueuedAt: new Date().toISOString()
    };
    
    const result = await queue.channel.sendToQueue(
      queue.queues.WEBHOOKS,
      Buffer.from(JSON.stringify(webhookData)),
      {
        persistent: true,
        contentType: 'application/json'
      }
    );
    
    if (result) {
      logger.info(`Webhook ${data.event} para instância ${data.instanceName} enfileirado com sucesso`);
    } else {
      logger.warn(`Não foi possível enfileirar webhook ${data.event} para instância ${data.instanceName}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Erro ao enfileirar webhook:', error);
    return false;
  }
}

/**
 * Verificar se o serviço de fila está disponível
 */
async function isAvailable() {
  try {
    if (!queue.channel) {
      await queue.connect();
    }
    return true;
  } catch (error) {
    logger.error('Serviço de fila não disponível:', error);
    return false;
  }
}

/**
 * Registrar função processadora para webhooks
 * @param {Function} processor Função que processa os webhooks
 */
async function registerProcessor(processor) {
  if (!processor || typeof processor !== 'function') {
    logger.error('Processador de webhook inválido');
    return false;
  }
  
  webhookProcessor = processor;
  
  try {
    if (!queue.channel) {
      await queue.connect();
    }
    
    // Consumir mensagens da fila
    await queue.channel.consume(queue.queues.WEBHOOKS, async (msg) => {
      if (msg) {
        try {
          const webhookData = JSON.parse(msg.content.toString());
          const startTime = Date.now();
          
          logger.info(`Processando webhook da fila: ${webhookData.event} para instância ${webhookData.instanceName}`);
          
          // Processar webhook
          await webhookProcessor(webhookData);
          
          // Calcular tempo de processamento
          const processingTime = Date.now() - startTime;
          logger.info(`Webhook processado em ${processingTime}ms`);
          
          // Confirmar processamento
          queue.channel.ack(msg);
        } catch (error) {
          logger.error('Erro ao processar webhook da fila:', error);
          
          // Rejeitar a mensagem e enviá-la para a DLQ
          queue.channel.nack(msg, false, false);
        }
      }
    });
    
    logger.info('Consumidor de webhooks registrado com sucesso');
    return true;
  } catch (error) {
    logger.error('Erro ao registrar processador de webhooks:', error);
    return false;
  }
}

/**
 * Obter estatísticas da fila de webhooks
 */
async function getQueueStatus() {
  try {
    if (!queue.channel) {
      await queue.connect();
    }
    
    const webhookQueue = await queue.channel.assertQueue(queue.queues.WEBHOOKS, { durable: true });
    
    return {
      enabled: true,
      stats: {
        waiting: webhookQueue.messageCount,
        consumers: webhookQueue.consumerCount
      }
    };
  } catch (error) {
    logger.error('Erro ao obter estatísticas da fila de webhooks:', error);
    return {
      enabled: false,
      error: error.message,
      stats: {}
    };
  }
}

/**
 * Limpar a fila de webhooks
 */
async function clearQueue() {
  try {
    if (!queue.channel) {
      await queue.connect();
    }
    
    await queue.channel.purgeQueue(queue.queues.WEBHOOKS);
    logger.info('Fila de webhooks limpa com sucesso');
    
    return { success: true };
  } catch (error) {
    logger.error('Erro ao limpar fila de webhooks:', error);
    return { success: false, message: error.message };
  }
}

module.exports = {
  initialize,
  addToQueue,
  registerProcessor,
  getQueueStatus,
  isAvailable,
  clearQueue
}; 