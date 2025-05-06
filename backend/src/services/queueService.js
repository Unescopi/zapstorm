/**
 * Serviço unificado de fila utilizando apenas RabbitMQ
 * Este serviço substitui o uso do Bull/Redis e centraliza todas as operações de fila
 */

const amqp = require('amqplib');
const logger = require('../utils/logger');

// Configurações
const RABBITMQ_URI = process.env.RABBITMQ_URI || 'amqp://localhost';
const RETRY_INTERVAL = 5000; // ms

// Nomes das filas
const QUEUE_NAMES = {
  MESSAGES: 'messages',
  DELAYED_MESSAGES: 'delayed-messages',
  FAILED_MESSAGES: 'failed-messages',
  WEBHOOKS: 'webhooks'
};

// Estado da conexão
let connection = null;
let channel = null;
let isConnecting = false;

/**
 * Conecta ao RabbitMQ e configura as filas
 */
const connect = async () => {
  if (channel) return channel;
  if (isConnecting) {
    logger.info('Já existe uma conexão em andamento, aguardando...');
    return waitForConnection();
  }

  isConnecting = true;
  
  try {
    logger.info(`Conectando ao RabbitMQ: ${RABBITMQ_URI}`);
    connection = await amqp.connect(RABBITMQ_URI);
    
    // Gerenciar reconexão em caso de falha
    connection.on('error', (err) => {
      logger.error(`Erro na conexão com RabbitMQ: ${err.message}`);
      setTimeout(reconnect, RETRY_INTERVAL);
    });
    
    connection.on('close', () => {
      if (channel) {
        logger.warn('Conexão RabbitMQ fechada, tentando reconectar...');
        setTimeout(reconnect, RETRY_INTERVAL);
      }
    });
    
    // Criar canal
    channel = await connection.createChannel();
    
    // Configurar filas com suas características
    await channel.assertQueue(QUEUE_NAMES.MESSAGES, { 
      durable: true 
    });
    
    await channel.assertQueue(QUEUE_NAMES.DELAYED_MESSAGES, { 
      durable: true,
      arguments: {
        'x-message-ttl': 60000, // TTL padrão de 1 minuto
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': QUEUE_NAMES.MESSAGES
      }
    });
    
    await channel.assertQueue(QUEUE_NAMES.FAILED_MESSAGES, { 
      durable: true 
    });
    
    await channel.assertQueue(QUEUE_NAMES.WEBHOOKS, { 
      durable: true 
    });
    
    // Prefetch para controle de concorrência
    await channel.prefetch(process.env.RABBITMQ_PREFETCH || 5);
    
    logger.info('Conectado ao RabbitMQ e filas configuradas com sucesso');
    isConnecting = false;
    return channel;
  } catch (error) {
    logger.error(`Erro ao conectar ao RabbitMQ: ${error.message}`);
    isConnecting = false;
    setTimeout(reconnect, RETRY_INTERVAL);
    throw error;
  }
};

/**
 * Tenta reconectar ao RabbitMQ
 */
const reconnect = async () => {
  if (isConnecting) return;
  
  try {
    // Limpar estado
    if (channel) {
      try {
        await channel.close();
      } catch (err) {
        logger.error(`Erro ao fechar canal: ${err.message}`);
      }
      channel = null;
    }
    
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        logger.error(`Erro ao fechar conexão: ${err.message}`);
      }
      connection = null;
    }
    
    // Reconectar
    await connect();
  } catch (error) {
    logger.error(`Erro na reconexão com RabbitMQ: ${error.message}`);
    setTimeout(reconnect, RETRY_INTERVAL);
  }
};

/**
 * Espera até que a conexão esteja estabelecida
 */
const waitForConnection = () => {
  return new Promise((resolve) => {
    const checkConnection = () => {
      if (channel) {
        resolve(channel);
      } else {
        setTimeout(checkConnection, 500);
      }
    };
    checkConnection();
  });
};

/**
 * Envia uma mensagem para a fila principal
 * @param {Object} message Mensagem a ser enviada
 * @returns {Promise<boolean>} Resultado da operação
 */
const enqueueMessage = async (message) => {
  try {
    if (!channel) await connect();
    
    await channel.sendToQueue(
      QUEUE_NAMES.MESSAGES,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
    
    return true;
  } catch (error) {
    logger.error(`Erro ao enfileirar mensagem: ${error.message}`);
    return false;
  }
};

/**
 * Envia uma mensagem para a fila de atraso (delayed)
 * Esta mensagem será movida para a fila principal após o tempo especificado
 * @param {Object} message Mensagem a ser enviada
 * @param {number} delayMs Atraso em milissegundos
 * @returns {Promise<boolean>} Resultado da operação
 */
const enqueueDeferredMessage = async (message, delayMs = 60000) => {
  try {
    if (!channel) await connect();
    
    // Se o atraso for muito longo, usar uma fila específica com TTL
    const queueName = QUEUE_NAMES.DELAYED_MESSAGES;
    
    // Criar fila com TTL específico se necessário
    if (delayMs !== 60000) {
      const specificQueueName = `${QUEUE_NAMES.DELAYED_MESSAGES}-${delayMs}`;
      
      await channel.assertQueue(specificQueueName, {
        durable: true,
        arguments: {
          'x-message-ttl': delayMs,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': QUEUE_NAMES.MESSAGES
        }
      });
      
      await channel.sendToQueue(
        specificQueueName,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
    } else {
      // Usar fila de atraso padrão
      await channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
    }
    
    return true;
  } catch (error) {
    logger.error(`Erro ao enfileirar mensagem com atraso: ${error.message}`);
    return false;
  }
};

/**
 * Envia uma mensagem para a fila de falhas
 * @param {Object} message Mensagem a ser enviada
 * @returns {Promise<boolean>} Resultado da operação
 */
const enqueueFailed = async (message) => {
  try {
    if (!channel) await connect();
    
    await channel.sendToQueue(
      QUEUE_NAMES.FAILED_MESSAGES,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
    
    return true;
  } catch (error) {
    logger.error(`Erro ao enfileirar mensagem falha: ${error.message}`);
    return false;
  }
};

/**
 * Enfileira mensagem com retry agendado
 * @param {Object} message Mensagem a ser enviada
 * @param {number} delayMs Atraso em milissegundos
 * @returns {Promise<boolean>} Resultado da operação
 */
const enqueueRetry = async (message, delayMs = 30000) => {
  return enqueueDeferredMessage(message, delayMs);
};

/**
 * Enfileira um webhook para processamento assíncrono
 * @param {Object} webhookData Dados do webhook
 * @returns {Promise<boolean>} Resultado da operação
 */
const enqueueWebhook = async (webhookData) => {
  try {
    if (!channel) await connect();
    
    await channel.sendToQueue(
      QUEUE_NAMES.WEBHOOKS,
      Buffer.from(JSON.stringify(webhookData)),
      { persistent: true }
    );
    
    return true;
  } catch (error) {
    logger.error(`Erro ao enfileirar webhook: ${error.message}`);
    return false;
  }
};

/**
 * Obtém estatísticas das filas
 * @returns {Promise<Object>} Estatísticas das filas
 */
const getQueueStats = async () => {
  try {
    if (!channel) await connect();
    
    const stats = {};
    
    for (const queueName of Object.values(QUEUE_NAMES)) {
      const queueInfo = await channel.assertQueue(queueName, { durable: true });
      stats[queueName] = {
        messages: queueInfo.messageCount,
        consumers: queueInfo.consumerCount
      };
    }
    
    // Formatar estatísticas para formato compatível com Bull
    return {
      waiting: stats[QUEUE_NAMES.MESSAGES].messages,
      active: stats[QUEUE_NAMES.MESSAGES].consumers,
      delayed: stats[QUEUE_NAMES.DELAYED_MESSAGES].messages,
      failed: stats[QUEUE_NAMES.FAILED_MESSAGES].messages,
      webhooks: stats[QUEUE_NAMES.WEBHOOKS].messages
    };
  } catch (error) {
    logger.error(`Erro ao obter estatísticas das filas: ${error.message}`);
    return {
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      webhooks: 0,
      error: error.message
    };
  }
};

/**
 * Fecha a conexão com RabbitMQ
 */
const close = async () => {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    
    if (connection) {
      await connection.close();
      connection = null;
    }
    
    logger.info('Conexão com RabbitMQ fechada com sucesso');
  } catch (error) {
    logger.error(`Erro ao fechar conexão com RabbitMQ: ${error.message}`);
  }
};

module.exports = {
  connect,
  enqueueMessage,
  enqueueDeferredMessage,
  enqueueFailed,
  enqueueRetry,
  enqueueWebhook,
  getQueueStats,
  close,
  queues: QUEUE_NAMES,
  channel: () => channel
}; 