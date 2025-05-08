const amqp = require('amqplib');
const logger = require('../utils/logger');

class QueueService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.url = process.env.RABBITMQ_URI || 'amqp://localhost:5672';
    this.queues = {
      MESSAGES: 'zapstorm-messages',
      RETRY: 'zapstorm-retry',
      FAILED: 'zapstorm-failed',
      EVENTS: 'zapstorm-events',
      DLQ: 'zapstorm-dlq'  // Nova fila para mensagens mortas
    };
    this.isReconnecting = false;
    this.reconnectTimeout = null;
    
    // Log da URL para depuração
    logger.info(`QueueService inicializado com URL: ${this.url}`);
  }

  async setupQueues() {
    // Configurar DLQ
    await this.channel.assertQueue(this.queues.DLQ, {
      durable: true
    });

    // Configurar filas com seus parâmetros e DLQ
    await this.channel.assertQueue(this.queues.MESSAGES, {
      durable: true,
      messageTtl: 3600000,
      deadLetterExchange: '',
      deadLetterRoutingKey: this.queues.DLQ
    });
    
    await this.channel.assertQueue(this.queues.RETRY, {
      durable: true,
      messageTtl: 3600000 * 24,
      deadLetterExchange: '',
      deadLetterRoutingKey: this.queues.DLQ
    });
    
    await this.channel.assertQueue(this.queues.FAILED, {
      durable: true,
      messageTtl: 3600000 * 48,
      deadLetterExchange: '',
      deadLetterRoutingKey: this.queues.DLQ
    });
    
    await this.channel.assertQueue(this.queues.EVENTS, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: this.queues.DLQ
    });
  }

  async connect() {
    if (this.isReconnecting) {
      logger.warn('Tentativa de reconexão já em andamento, ignorando...');
      return;
    }

    this.isReconnecting = true;
    let attempts = 0;
    const maxAttempts = 5;
    const baseDelay = 1000;

    try {
      while (attempts < maxAttempts) {
        try {
          logger.info(`Tentativa ${attempts + 1}/${maxAttempts} de conexão ao RabbitMQ em: ${this.url}`);
          
          this.connection = await amqp.connect(this.url);
          this.channel = await this.connection.createChannel();
          
          // Configurar filas
          await this.setupQueues();
          
          // Configurar handlers para reconexão
          this.connection.on('error', (err) => {
            logger.error('Erro na conexão RabbitMQ:', err);
            this.handleDisconnect();
          });
          
          this.connection.on('close', () => {
            logger.warn('Conexão RabbitMQ fechada');
            this.handleDisconnect();
          });
          
          logger.info('Conectado ao RabbitMQ e filas configuradas');
          this.isReconnecting = false;
          return true;
        } catch (error) {
          attempts++;
          if (attempts >= maxAttempts) throw error;
          
          const delay = baseDelay * Math.pow(2, attempts);
          logger.info(`Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } catch (error) {
      logger.error('Falha em todas as tentativas de conexão:', error);
      this.isReconnecting = false;
      throw error;
    }
  }

  handleDisconnect() {
    this.connection = null;
    this.channel = null;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(err => {
        logger.error('Falha na reconexão automática:', err);
      });
    }, 5000);
  }

  async enqueueMessage(message) {
    try {
      if (!this.channel) {
        try {
          logger.info(`Tentando conectar ao RabbitMQ para enviar mensagem ${message._id}`);
          console.log(`Tentando conectar ao RabbitMQ para enviar mensagem ${message._id}`);
          await this.connect();
          if (!this.channel) {
            logger.error(`Não foi possível estabelecer canal com RabbitMQ após conexão`);
            console.error(`Não foi possível estabelecer canal com RabbitMQ após conexão`);
            return false;
          }
        } catch (connError) {
          logger.error(`Erro ao conectar ao RabbitMQ para mensagem ${message._id}:`, connError);
          console.error(`Erro ao conectar ao RabbitMQ:`, connError.message);
          return false;
        }
      }
      
      // Tentativa de envio com até 3 retries
      let attempts = 0;
      while (attempts < 3) {
        try {
          const result = this.channel.sendToQueue(
            this.queues.MESSAGES,
            Buffer.from(JSON.stringify(message)),
            {
              persistent: true,
              contentType: 'application/json'
            }
          );
          
          logger.info(`Mensagem ${message._id} enfileirada com sucesso`);
          console.log(`Mensagem ${message._id} enfileirada com sucesso`);
          return result;
        } catch (sendError) {
          attempts++;
          logger.error(`Tentativa ${attempts}/3 falhou ao enviar mensagem ${message._id}:`, sendError);
          console.error(`Tentativa ${attempts}/3 falhou:`, sendError.message);
          
          if (attempts < 3) {
            // Esperar um pouco antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 500 * attempts));
            
            // Tentar recriar o canal se necessário
            if (!this.channel || !this.connection) {
              try {
                await this.connect();
              } catch (reconnError) {
                logger.error(`Falha ao reconectar na tentativa ${attempts}:`, reconnError);
              }
            }
          }
        }
      }
      
      logger.error(`Todas as tentativas de envio falharam para mensagem ${message._id}`);
      return false;
    } catch (error) {
      logger.error(`Erro não tratado ao enfileirar mensagem ${message._id}:`, error);
      console.error(`Erro não tratado:`, error.message);
      
      // Tentar reconectar em caso de erro
      this.channel = null;
      this.connection = null;
      
      return false;
    }
  }

  async enqueueRetry(message, delay = 300000) { // 5 minutos de delay por padrão
    if (!this.channel) {
      await this.connect();
    }
    
    return this.channel.sendToQueue(
      this.queues.RETRY,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        contentType: 'application/json',
        expiration: delay.toString() // Atraso em ms
      }
    );
  }

  async enqueueFailed(message) {
    if (!this.channel) {
      await this.connect();
    }
    
    return this.channel.sendToQueue(
      this.queues.FAILED,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        contentType: 'application/json'
      }
    );
  }

  async publishEvent(event) {
    if (!this.channel) {
      await this.connect();
    }
    
    return this.channel.sendToQueue(
      this.queues.EVENTS,
      Buffer.from(JSON.stringify(event)),
      {
        persistent: true,
        contentType: 'application/json'
      }
    );
  }

  async consumeMessages(callback) {
    if (!this.channel) {
      await this.connect();
    }
    
    return this.channel.consume(this.queues.MESSAGES, async (msg) => {
      if (msg) {
        try {
          const message = JSON.parse(msg.content.toString());
          await callback(message);
          this.channel.ack(msg);
        } catch (error) {
          logger.error('Erro ao processar mensagem:', error);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }

  async consumeRetry(callback) {
    if (!this.channel) {
      await this.connect();
    }
    
    return this.channel.consume(this.queues.RETRY, async (msg) => {
      if (msg) {
        try {
          const message = JSON.parse(msg.content.toString());
          await callback(message);
          this.channel.ack(msg);
        } catch (error) {
          logger.error('Erro ao processar mensagem de retry:', error);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }

  async consumeEvents(callback) {
    if (!this.channel) {
      await this.connect();
    }
    
    return this.channel.consume(this.queues.EVENTS, async (msg) => {
      if (msg) {
        try {
          const event = JSON.parse(msg.content.toString());
          await callback(event);
          this.channel.ack(msg);
        } catch (error) {
          logger.error('Erro ao processar evento:', error);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }

  async close() {
    if (this.channel) {
      await this.channel.close();
    }
    
    if (this.connection) {
      await this.connection.close();
    }
    
    logger.info('Desconectado do RabbitMQ');
  }

  /**
   * Envia mensagens em lote para a fila
   * @param {Array} messages Lista de mensagens para enfileirar
   * @param {Object} options Opções para envio em lote
   */
  async enqueueMessageBatch(messages, options = {}) {
    const { 
      batchSize = 50, 
      delay = 5000,
      randomizeDelay = true,  // Adicionar variação aleatória no delay
      minDelayVariation = 0.8, // 80% do delay base no mínimo
      maxDelayVariation = 1.2  // 120% do delay base no máximo
    } = options;
    
    logger.info(`[queueService] Iniciando enfileiramento em lote: ${messages.length} mensagens, batchSize=${batchSize}, delay=${delay}ms com variação aleatória=${randomizeDelay}`);
    
    try {
      // Verificar conexão
      if (!this.channel) {
        logger.error('[queueService] Canal RabbitMQ não disponível para enfileiramento em lote!');
        throw new Error('Canal RabbitMQ não disponível');
      }

      logger.info(`[queueService] Canal RabbitMQ disponível, verificando fila: ${this.queues.MESSAGES}`);
      
      // Garantir que a fila existe
      await this.channel.assertQueue(this.queues.MESSAGES, {
        durable: true
      });
      
      logger.info(`[queueService] Fila ${this.queues.MESSAGES} verificada com sucesso`);
      
      // Dividir mensagens em lotes
      const batches = [];
      for (let i = 0; i < messages.length; i += batchSize) {
        batches.push(messages.slice(i, i + batchSize));
      }
      
      logger.info(`[queueService] Mensagens divididas em ${batches.length} lotes`);
      
      // Publicar cada lote com atraso entre eles
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        logger.info(`[queueService] Processando lote ${i+1}/${batches.length} com ${batch.length} mensagens`);
        
        // Aplicar uma distribuição natural às mensagens dentro do lote
        // Adicionar pequenos atrasos entre as mensagens dentro do mesmo lote 
        for (let j = 0; j < batch.length; j++) {
          const message = batch[j];
          const messageId = message._id || message.id || 'unknown';
          const payload = {
            _id: messageId.toString(),
            contactId: message.contactId.toString(),
            campaignId: message.campaignId.toString(),
            content: message.content,
            mediaUrl: message.mediaUrl,
            mediaType: message.mediaType,
            instanceId: message.instanceId
          };
          
          try {
            const success = this.channel.sendToQueue(
              this.queues.MESSAGES,
              Buffer.from(JSON.stringify(payload)),
              {
                persistent: true,
                messageId: messageId.toString()
              }
            );
            
            if (!success) {
              logger.warn(`[queueService] Não foi possível enfileirar mensagem ${messageId} - buffer cheio?`);
            } else {
              logger.debug(`[queueService] Mensagem ${messageId} enfileirada com sucesso`);
            }
            
            // Pequeno atraso entre mensagens do mesmo lote para distribuição mais natural
            // Exceto para a última mensagem do lote
            if (j < batch.length - 1) {
              const microDelay = Math.floor(delay / batchSize / 3); // Delay pequeno entre mensagens
              if (microDelay > 5) { // Só aplicar se o micro delay for maior que 5ms
                await new Promise(resolve => setTimeout(resolve, microDelay));
              }
            }
          } catch (publishError) {
            logger.error(`[queueService] Erro ao publicar mensagem ${messageId}: ${publishError.message}`);
            throw publishError;
          }
        }
        
        logger.info(`[queueService] Lote ${i+1} publicado com sucesso com ${batch.length} mensagens`);
        
        // Adicionar atraso entre lotes (exceto o último) com variação aleatória
        if (i < batches.length - 1 && delay > 0) {
          let actualDelay = delay;
          
          // Adicionar variação aleatória ao delay entre lotes para parecer mais natural
          if (randomizeDelay) {
            const variation = minDelayVariation + Math.random() * (maxDelayVariation - minDelayVariation);
            actualDelay = Math.floor(delay * variation);
            logger.debug(`[queueService] Aplicando delay com variação aleatória: ${actualDelay}ms (${Math.round(variation * 100)}% do padrão)`);
          }
          
          logger.debug(`[queueService] Aguardando ${actualDelay}ms antes do próximo lote...`);
          await new Promise(resolve => setTimeout(resolve, actualDelay));
        }
      }
      
      logger.info(`[queueService] Enfileiramento em lote concluído com sucesso. Total: ${messages.length} mensagens em ${batches.length} lotes`);
      
      return {
        success: true,
        total: messages.length,
        batches: batches.length
      };
    } catch (error) {
      logger.error(`[queueService] Erro ao enfileirar mensagens em lote: ${error.message}`);
      logger.error(`[queueService] Stack trace: ${error.stack}`);
      
      // Tentar reconectar se for um erro de conexão
      if (error.message.includes('connection') || error.message.includes('channel')) {
        logger.info('[queueService] Tentando reconectar ao RabbitMQ...');
        await this.connect();
      }
      
      throw error;
    }
  }

  /**
   * Configura uma fila com limites de processamento
   * @param {String} queueName Nome da fila
   * @param {Object} options Opções da fila
   */
  async setupThrottledQueue(queueName, options = {}) {
    if (!this.channel) {
      await this.connect();
    }
    
    await this.channel.assertQueue(queueName, {
      durable: true,
      messageTtl: options.messageTtl || 3600000,
      maxPriority: options.maxPriority || 10
    });
    
    // Configurar QoS para limitar número de mensagens por consumidor
    const prefetchCount = options.prefetchCount || 10;
    await this.channel.prefetch(prefetchCount);
    
    logger.info(`Fila ${queueName} configurada com limite de ${prefetchCount} mensagens por vez`);
    
    return {
      queueName,
      prefetchCount
    };
  }

  /**
   * Obtém estatísticas de uma fila
   * @param {String} queueName Nome da fila
   */
  async getQueueStats(queueName) {
    if (!this.channel) {
      await this.connect();
    }
    
    try {
      const stats = await this.channel.assertQueue(queueName);
      return {
        name: queueName,
        messageCount: stats.messageCount,
        consumerCount: stats.consumerCount
      };
    } catch (error) {
      logger.error(`Erro ao obter estatísticas da fila ${queueName}:`, error);
      throw error;
    }
  }
}

module.exports = new QueueService(); 