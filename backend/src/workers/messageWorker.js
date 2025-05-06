const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const queueService = require('../services/queueService');
const logger = require('../utils/logger');

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

// Função para processar mensagem de texto
async function processTextMessage(message, instance, evolutionApi) {
  try {
    // Atualizar status da mensagem para 'enviando'
    await Message.findByIdAndUpdate(message._id, {
      status: 'queued',
      retries: message.retries + 1
    });
    
    // Enviar mensagem via API Evolution
    console.log(`Tentando enviar mensagem de texto para ${message.contact.phone}`);
    const response = await evolutionApi.sendText(instance.instanceName, message.contact.phone, message.content);
    
    console.log(`Resposta da API Evolution para envio de texto: ${JSON.stringify(response)}`);
    
    if (response && response.key) {
      // Mensagem enviada com sucesso
      logger.info(`Mensagem enviada com sucesso: ${message._id}`);
      console.log(`Mensagem enviada com sucesso: ${message._id}`);
      
      await Message.findByIdAndUpdate(message._id, {
        status: 'sent',
        messageId: response.key.id,
        sentAt: new Date()
      });
      
      // Atualizar métricas da campanha
      await Campaign.findByIdAndUpdate(message.campaignId, {
        $inc: { 'metrics.sent': 1, 'metrics.pending': -1 }
      });
      
      // Atualizar métricas da instância
      await Instance.findOneAndUpdate({ instanceName: instance.instanceName }, {
        $inc: { 'metrics.totalSent': 1 }
      });
      
      await checkAndCompleteCampaignIfNeeded(message.campaignId);
      
      return true;
    } else {
      throw new Error('Resposta inválida da API Evolution');
    }
  } catch (error) {
    logger.error(`Erro ao enviar mensagem ${message._id}:`, error);
    
    // Verificar se é um erro recuperável ou não
    const isRecoverable = !error.message.includes('not-whatsapp-user') && 
                          !error.message.includes('blocked') &&
                          message.retries < 3;
    
    if (isRecoverable) {
      // Agendar reenvio
      const retryDelay = Math.pow(2, message.retries) * 30000; // Backoff exponencial
      await Message.findByIdAndUpdate(message._id, {
        status: 'scheduled_retry',
        errorDetails: error.message,
        scheduledRetryAt: new Date(Date.now() + retryDelay),
        $inc: { retries: 1 }
      });
      // Atualizar objeto para retry
      message.retries = (message.retries || 0) + 1;
      // Enfileirar para retry
      await queueService.enqueueRetry(message, retryDelay);
    } else {
      // Falha permanente
      await Message.findByIdAndUpdate(message._id, {
        status: 'failed',
        errorDetails: error.message
      });
      
      // Atualizar métricas da campanha
      await Campaign.findByIdAndUpdate(message.campaignId, {
        $inc: { 'metrics.failed': 1, 'metrics.pending': -1 }
      });
      
      // Atualizar métricas da instância
      await Instance.findOneAndUpdate({ instanceName: instance.instanceName }, {
        $inc: { 'metrics.totalFailed': 1 }
      });
      
      // Enfileirar na fila de falhas
      logger.warn(`Mensagem ${message._id} enviada para DLQ (falha definitiva)`);
      await queueService.enqueueFailed(message);
    }
    
    await checkAndCompleteCampaignIfNeeded(message.campaignId);
    
    return false;
  }
}

// Função para processar mensagem com mídia
async function processMediaMessage(message, instance, evolutionApi) {
  try {
    const { mediaUrl, mediaType, content } = message;
    
    // Atualizar status da mensagem para 'enviando'
    await Message.findByIdAndUpdate(message._id, {
      status: 'queued',
      retries: message.retries + 1
    });
    
    // Enviar mensagem via API Evolution
    console.log(`Tentando enviar mensagem de mídia (${mediaType}) para ${message.contact.phone}, URL: ${mediaUrl}`);
    const response = await evolutionApi.sendMedia(
      instance.instanceName, 
      message.contact.phone, 
      mediaUrl, 
      content, 
      mediaType
    );
    
    console.log(`Resposta da API Evolution para envio de mídia: ${JSON.stringify(response)}`);
    
    if (response && response.key) {
      // Mensagem enviada com sucesso
      logger.info(`Mensagem com mídia enviada com sucesso: ${message._id}`);
      console.log(`Mensagem com mídia enviada com sucesso: ${message._id}`);
      
      await Message.findByIdAndUpdate(message._id, {
        status: 'sent',
        messageId: response.key.id,
        sentAt: new Date()
      });
      
      // Atualizar métricas da campanha
      await Campaign.findByIdAndUpdate(message.campaignId, {
        $inc: { 'metrics.sent': 1, 'metrics.pending': -1 }
      });
      
      // Atualizar métricas da instância
      await Instance.findOneAndUpdate({ instanceName: instance.instanceName }, {
        $inc: { 'metrics.totalSent': 1 }
      });
      
      await checkAndCompleteCampaignIfNeeded(message.campaignId);
      
      return true;
    } else {
      throw new Error('Resposta inválida da API Evolution');
    }
  } catch (error) {
    logger.error(`Erro ao enviar mensagem com mídia ${message._id}:`, error);
    
    // Verificar se é um erro recuperável ou não
    const isRecoverable = !error.message.includes('not-whatsapp-user') && 
                          !error.message.includes('blocked') &&
                          message.retries < 3;
    
    if (isRecoverable) {
      // Agendar reenvio
      const retryDelay = Math.pow(2, message.retries) * 30000; // Backoff exponencial
      await Message.findByIdAndUpdate(message._id, {
        status: 'scheduled_retry',
        errorDetails: error.message,
        scheduledRetryAt: new Date(Date.now() + retryDelay),
        $inc: { retries: 1 }
      });
      message.retries = (message.retries || 0) + 1;
      await queueService.enqueueRetry(message, retryDelay);
    } else {
      // Falha permanente
      await Message.findByIdAndUpdate(message._id, {
        status: 'failed',
        errorDetails: error.message
      });
      
      // Atualizar métricas da campanha
      await Campaign.findByIdAndUpdate(message.campaignId, {
        $inc: { 'metrics.failed': 1, 'metrics.pending': -1 }
      });
      
      // Atualizar métricas da instância
      await Instance.findOneAndUpdate({ instanceName: instance.instanceName }, {
        $inc: { 'metrics.totalFailed': 1 }
      });
      
      // Enfileirar na fila de falhas
      logger.warn(`Mensagem ${message._id} enviada para DLQ (falha definitiva)`);
      await queueService.enqueueFailed(message);
    }
    
    await checkAndCompleteCampaignIfNeeded(message.campaignId);
    
    return false;
  }
}

// Processador principal de mensagens
async function processMessage(message) {
  logger.info(`[messageWorker] Recebida mensagem para processamento - ID: ${message._id}`);
  console.log(`[messageWorker] Recebida mensagem para processamento - ID: ${message._id}`);
  
  try {
    // Buscar dados completos da mensagem se não estiverem presentes
    if (!message.contact || !message.contact.phone) {
      logger.info(`[messageWorker] Buscando dados completos da mensagem ${message._id}`);
      const messageData = await Message.findById(message._id)
        .populate('contactId', 'phone name')
        .populate('campaignId');
      
      if (!messageData) {
        logger.error(`[messageWorker] Mensagem não encontrada no banco: ${message._id}`);
        return false;
      }
      
      message = messageData;
      message.contact = message.contactId;
      logger.info(`[messageWorker] Dados da mensagem recuperados: contato=${message.contact?.phone}, campanha=${message.campaignId?._id}`);
    }
    
    // Buscar a campanha se não estiver nos dados da mensagem
    if (!message.instanceId) {
      logger.info(`[messageWorker] Buscando dados da campanha ${message.campaignId}`);
      const campaign = await Campaign.findById(message.campaignId);
      if (!campaign) {
        logger.error(`[messageWorker] Campanha não encontrada: ${message.campaignId}`);
        return false;
      }
      message.instanceId = campaign.instanceId;
      logger.info(`[messageWorker] ID da instância obtido: ${message.instanceId}`);
    }
    
    // Buscar instância
    const instance = await Instance.findById(message.instanceId);
    if (!instance) {
      logger.error(`Instância não encontrada: ${message.instanceId}`);
      return false;
    }
    
    // Verificar estado da conexão
    const evolutionApi = new EvolutionApiService(instance.serverUrl, instance.apiKey);
    const connectionState = await evolutionApi.connectionState(instance.instanceName);
    
    if (!connectionState || connectionState.instance.state !== 'open') {
      logger.error(`Instância ${instance.instanceName} não está conectada`);
      
      // Tentar reconectar e falhar se não for possível
      try {
        await evolutionApi.connectInstance(instance.instanceName);
        logger.info(`Reconexão de instância ${instance.instanceName} iniciada`);
      } catch (error) {
        logger.error(`Falha ao reconectar instância ${instance.instanceName}:`, error);
        
        // Enfileirar para retry após 5 minutos
        await queueService.enqueueRetry(message, 300000);
        return false;
      }
    }
    
    // Log detalhado para diagnóstico
    logger.info(`Processando mensagem ${message._id}, tipo: ${message.mediaType || 'texto'}, URL: ${message.mediaUrl || 'N/A'}`);
    console.log(`Processando mensagem ${message._id}, tipo: ${message.mediaType || 'texto'}, URL: ${message.mediaUrl || 'N/A'}`);
    
    // Verificar tipo de mensagem (texto ou mídia)
    if (message.mediaUrl && message.mediaType) {
      logger.info(`Mensagem ${message._id} identificada como mídia (${message.mediaType})`);
      return await processMediaMessage(message, instance, evolutionApi);
    } else {
      // Verificar se tem conteúdo textual válido
      if (!message.content || typeof message.content !== 'string' || message.content.trim() === '') {
        logger.error(`Mensagem ${message._id} não possui conteúdo textual válido`);
        await Message.findByIdAndUpdate(message._id, {
          status: 'failed',
          errorDetails: 'Mensagem sem conteúdo textual válido'
        });
        return false;
      }
      
      logger.info(`Enviando mensagem para ${message.contact.phone} com conteúdo: ${message.content.substring(0, 50)}...`);
      console.log(`Enviando mensagem para ${message.contact.phone} com conteúdo: ${message.content.substring(0, 50)}...`);
      return await processTextMessage(message, instance, evolutionApi);
    }
  } catch (error) {
    logger.error(`[messageWorker] Erro ao processar mensagem ${message._id || 'desconhecida'}:`, error);
    logger.error(`[messageWorker] Stack trace: ${error.stack}`);
    return false;
  }
}

// Iniciar consumo de mensagens
let retryInterval = null;
let messageCheckInterval = null;
async function startWorker() {
  try {
    logger.info('[messageWorker] Conectando ao serviço de filas...');
    await queueService.connect();
    logger.info('[messageWorker] Conexão com serviço de filas estabelecida com sucesso');
    
    // Consumir da fila principal
    logger.info('[messageWorker] Iniciando consumo da fila principal de mensagens...');
    await queueService.consumeMessages(processMessage);
    logger.info('[messageWorker] Consumidor da fila de mensagens iniciado com sucesso');
    
    // Consumir da fila de retentativas
    logger.info('[messageWorker] Iniciando consumo da fila de retentativas...');
    await queueService.consumeRetry(processMessage);
    logger.info('[messageWorker] Consumidor da fila de retentativas iniciado com sucesso');
    
    // Verificar mensagens que foram agendadas para reenvio
    retryInterval = setInterval(async () => {
      try {
        const retryMessages = await Message.find({
          status: 'scheduled_retry',
          scheduledRetryAt: { $lte: new Date() }
        }).limit(50);
        
        logger.info(`[messageWorker] Verificando mensagens agendadas para retry: ${retryMessages.length} encontradas`);
        
        for (const message of retryMessages) {
          await queueService.enqueueMessage(message);
          await Message.findByIdAndUpdate(message._id, {
            scheduledRetryAt: null,
            status: 'queued'
          });
          logger.info(`[messageWorker] Mensagem ${message._id} re-enfileirada para retry`);
        }
      } catch (error) {
        logger.error('[messageWorker] Erro ao processar mensagens agendadas para retry:', error);
      }
    }, 60000); // Verificar a cada 1 minuto
    
    // NOVO: Verificar mensagens pendentes diretamente no banco
    messageCheckInterval = setInterval(async () => {
      try {
        // Buscar campanhas com status running
        const runningCampaigns = await Campaign.find({ status: 'running' }).limit(10);
        
        logger.info(`[messageWorker] Verificando mensagens pendentes de ${runningCampaigns.length} campanhas em execução`);
        
        for (const campaign of runningCampaigns) {
          // Buscar mensagens pendentes desta campanha
          const pendingMessages = await Message.find({
            campaignId: campaign._id,
            status: 'pending'
          }).limit(50);
          
          if (pendingMessages.length > 0) {
            logger.info(`[messageWorker] Encontradas ${pendingMessages.length} mensagens pendentes para campanha ${campaign._id}`);
            
            // Processar cada mensagem diretamente
            for (const message of pendingMessages) {
              // Atualizar status para queued
              await Message.findByIdAndUpdate(message._id, {
                status: 'queued',
                retries: (message.retries || 0) + 1
              });
              
              // Enfileirar mensagem
              await queueService.enqueueMessage(message);
              logger.info(`[messageWorker] Mensagem ${message._id} enfileirada manualmente`);
            }
          }
        }
      } catch (error) {
        logger.error('[messageWorker] Erro ao verificar mensagens pendentes:', error);
      }
    }, 120000); // Verificar a cada 2 minutos
    
    logger.info('[messageWorker] Worker de mensagens iniciado e pronto para processar');
    
  } catch (error) {
    logger.error('[messageWorker] Erro crítico ao iniciar worker:', error);
    logger.error(`[messageWorker] Stack trace: ${error.stack}`);
    process.exit(1);
  }
}

// Gerenciamento de processo
process.on('SIGTERM', async () => {
  logger.info('Worker de mensagens recebeu SIGTERM, encerrando graciosamente...');
  if (retryInterval) clearInterval(retryInterval);
  if (messageCheckInterval) clearInterval(messageCheckInterval);
  await queueService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Worker de mensagens recebeu SIGINT, encerrando graciosamente...');
  if (retryInterval) clearInterval(retryInterval);
  if (messageCheckInterval) clearInterval(messageCheckInterval);
  await queueService.close();
  process.exit(0);
});

// Iniciar worker
startWorker();

// Função utilitária para finalizar campanha immediate ou scheduled
async function checkAndCompleteCampaignIfNeeded(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (campaign && ['immediate', 'scheduled'].includes(campaign.schedule.type)) {
    if (campaign.metrics.pending === 0 && campaign.status === 'running') {
      await Campaign.findByIdAndUpdate(campaignId, {
        status: 'completed',
        lastUpdated: Date.now()
      });
      logger.info(`Campanha ${campaign.schedule.type} ${campaignId} concluída automaticamente pelo worker de mensagens.`);
    }
  }
} 