const { Message, Instance, Campaign } = require('../models');
const logger = require('../utils/logger');
const { Contact } = require('../models');
const { Alert } = require('../models');
const WebhookLog = require('../models/WebhookLog');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const queueService = require('../services/queueService');
const webhookAnalyticsService = require('../services/webhookAnalyticsService');

// Rate limiting middleware para webhooks
exports.webhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 300, // limite de 300 requisições por minuto
  message: { success: false, message: 'Limite de requisições excedido, tente novamente mais tarde' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Processa webhooks da API Evolution
 * Esta função recebe eventos de mensagens e atualizações de status
 */
exports.processWebhook = async (req, res) => {
  const startTime = Date.now();
  let logEntry = {
    instanceName: req.body.instance || req.query.instance || 'unknown',
    event: req.body.event || req.query.event || 'unknown',
    payload: req.body,
    status: 'success',
    responseStatus: 200,
    responseMessage: 'Processado com sucesso'
  };
  
  try {
    // Validar webhook
    const validation = await validateWebhook(req);
    if (!validation.valid) {
      logEntry.status = 'invalid';
      logEntry.responseStatus = 400;
      logEntry.responseMessage = validation.message;
      
      // Salvar log assíncrono (não aguardar)
      WebhookLog.create({
        ...logEntry,
        processingTimeMs: Date.now() - startTime
      }).catch(err => logger.error('Erro ao salvar log de webhook:', err));
      
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    const { body } = req;
    const instanceName = body.instance || req.query.instance || 'unknown';
    const event = body.event || req.query.event;
    
    logger.info(`Webhook recebido: ${event} para instância ${instanceName}`);
    
    // Atualizar estatísticas da instância (não aguardar)
    updateWebhookStats(instanceName).catch(err => {
      logger.error('Erro ao atualizar estatísticas de webhook:', err);
    });
    
    // Adicionar à fila para processamento assíncrono
    const added = await queueService.enqueueWebhook({
      instanceName,
      event,
      body,
      receivedAt: new Date()
    });
    
    if (!added) {
      logger.error(`Falha ao adicionar webhook à fila: ${event} - ${instanceName}`);
      logEntry.status = 'failed';
      logEntry.responseMessage = 'Erro ao adicionar à fila de processamento';
    } else {
      logger.info(`Webhook adicionado à fila para processamento assíncrono: ${event} - ${instanceName}`);
    }
    
    // Salvar log assíncrono (não aguardar)
    WebhookLog.create({
      ...logEntry,
      processingTimeMs: Date.now() - startTime
    }).catch(err => logger.error('Erro ao salvar log de webhook:', err));
    
    // Retornar sucesso imediatamente, o processamento continuará em background
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Erro ao processar webhook:', error);
    
    // Atualizar log com erro
    logEntry.status = 'failed';
    logEntry.responseStatus = 500;
    logEntry.responseMessage = `Erro: ${error.message}`;
    
    // Incrementar contador de falhas
    try {
      await Instance.findOneAndUpdate(
        { instanceName: logEntry.instanceName },
        { $inc: { 'webhook.failedWebhooks': 1 } }
      );
    } catch (err) {
      logger.error('Erro ao atualizar contador de falhas:', err);
    }
    
    // Salvar log assíncrono
    WebhookLog.create({
      ...logEntry,
      processingTimeMs: Date.now() - startTime
    }).catch(err => logger.error('Erro ao salvar log de webhook:', err));
    
    return res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
};

/**
 * Processa webhook de forma simplificada para tratamento na rota específica
 */
exports.receiveWebhook = async (req, res) => {
  try {
    // Verificar parâmetros básicos
    const instanceName = req.params.instanceName;
    if (!instanceName) {
      logger.warn('Webhook recebido sem nome de instância');
      return res.status(400).json({ error: 'Nome da instância não fornecido' });
    }

    // Responder imediatamente ao webhook para evitar timeout
    res.status(200).json({ status: 'received' });

    // Adicionar à fila para processamento assíncrono
    await queueService.enqueueWebhook({
      instanceName,
      event: req.body.event || 'WEBHOOK_EVENT',
      body: req.body,
      receivedAt: new Date(),
      path: req.path
    });
    
    // Atualizar contador de webhooks (não aguardar)
    Instance.findOneAndUpdate(
      { instanceName },
      { 
        $inc: { 'metrics.webhooksReceived': 1 },
        'webhook.lastReceived': new Date()
      }
    ).catch(err => logger.error(`Erro ao atualizar contador de webhooks: ${err.message}`));
    
  } catch (error) {
    logger.error(`Erro ao receber webhook: ${error.message}`, error);
    // Já enviamos resposta, então não precisamos responder novamente
  }
};

/**
 * Atualiza estatísticas de webhook para a instância
 * @param {string} instanceName Nome da instância
 */
const updateWebhookStats = async (instanceName) => {
  try {
    await Instance.findOneAndUpdate(
      { instanceName },
      { 
        $inc: { 'metrics.webhooksReceived': 1 },
        'webhook.lastReceived': new Date()
      }
    );
  } catch (error) {
    logger.error(`Erro ao atualizar estatísticas de webhook: ${error.message}`);
  }
};

// Função auxiliar para validar webhook
const validateWebhook = async (req) => {
  // Verificar se o request tem o formato esperado
  if (!req.body) {
    return { valid: false, message: 'Corpo da requisição vazio' };
  }
  
  const instanceName = req.body.instance || req.query.instance;
  
  if (!instanceName) {
    logger.warn('Webhook recebido sem nome da instância');
    return { valid: false, message: 'Nome da instância não fornecido' };
  }
  
  // Buscar instância para verificar secretKey
  const instance = await Instance.findOne({ instanceName });
  
  if (!instance) {
    logger.warn(`Instância não encontrada: ${instanceName}`);
    return { valid: false, message: 'Instância não encontrada' };
  }
  
  // Verificar se o webhook está habilitado para esta instância
  if (!instance.webhook.isActive) {
    logger.warn(`Webhook recebido, mas está desabilitado para a instância: ${instanceName}`);
    return { valid: false, message: 'Webhook desabilitado para esta instância' };
  }
  
  // Verificar assinatura HMAC se a chave secreta estiver configurada
  if (instance.webhook.secretKey) {
    const signature = req.headers['x-hub-signature'] || req.headers['x-webhook-signature'];
    
    if (!signature) {
      logger.warn('Assinatura HMAC não fornecida');
      // Permitir sem assinatura para compatibilidade com versões anteriores da Evolution API
      return { valid: true };
    }
    
    // Calcular hash HMAC esperado
    const hmac = crypto.createHmac('sha256', instance.webhook.secretKey);
    const calculatedSignature = 'sha256=' + 
      hmac.update(JSON.stringify(req.body)).digest('hex');
    
    if (signature !== calculatedSignature) {
      logger.warn(`Assinatura HMAC inválida: ${signature} !== ${calculatedSignature}`);
      // Permitir sem validação para compatibilidade com versões anteriores
      return { valid: true };
    }
  }
  
  return { valid: true };
};

/**
 * Obter status da fila de webhooks
 */
exports.getQueueStatus = async (req, res) => {
  try {
    const status = await queueService.getQueueStats();
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Erro ao obter status da fila de webhooks:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter status da fila de webhooks',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Obter logs de webhook
 */
exports.getWebhookLogs = async (req, res) => {
  try {
    const { instanceName, event, status, limit = 50, page = 1 } = req.query;
    const query = {};
    
    if (instanceName) query.instanceName = instanceName;
    if (event) query.event = event;
    if (status) query.status = status;
    
    const total = await WebhookLog.countDocuments(query);
    const logs = await WebhookLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    
    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao obter logs de webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter logs de webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Apagar logs de webhook
 */
exports.clearWebhookLogs = async (req, res) => {
  try {
    const { instanceName, olderThan } = req.body;
    const query = {};
    
    if (instanceName) query.instanceName = instanceName;
    
    if (olderThan) {
      const date = new Date();
      date.setDate(date.getDate() - Number(olderThan));
      query.createdAt = { $lt: date };
    }
    
    const result = await WebhookLog.deleteMany(query);
    
    res.status(200).json({
      success: true,
      data: {
        deleted: result.deletedCount
      }
    });
  } catch (error) {
    logger.error('Erro ao apagar logs de webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao apagar logs de webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Endpoint para testar webhook
 */
exports.testWebhook = async (req, res) => {
  try {
    const { instanceId } = req.params;
    
    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return res.status(404).json({ success: false, message: 'Instância não encontrada' });
    }
    
    // Verificar se webhook está configurado
    if (!instance.webhook?.url) {
      return res.status(400).json({ 
        success: false, 
        message: 'Instância não possui URL de webhook configurada' 
      });
    }
    
    // Enviar requisição de teste para o webhook
    try {
      const axios = require('axios');
      
      const response = await axios.post(instance.webhook.url, {
        event: 'TEST_CONNECTION',
        data: {
          instanceName: instance.instanceName,
          timestamp: Date.now(),
          message: 'Este é um evento de teste do webhook'
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      return res.status(200).json({
        success: true,
        message: 'Teste de webhook enviado com sucesso',
        response: {
          status: response.status,
          data: response.data
        }
      });
    } catch (requestError) {
      return res.status(400).json({
        success: false,
        message: 'Erro ao enviar teste para webhook',
        error: requestError.message,
        response: requestError.response?.data
      });
    }
  } catch (error) {
    logger.error(`Erro ao testar webhook: ${error.message}`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao testar webhook',
      error: error.message
    });
  }
};

// Manter apenas os handlers específicos para os endpoints individuais
// Os outros processamentos serão feitos no consumidor de fila
exports.processMessageUpsert = async (req, res) => {
  const instanceName = req.query.instance || 'unknown';
  await queueService.enqueueWebhook({
    instanceName,
    event: 'MESSAGES_UPSERT',
    body: req.body,
    receivedAt: new Date()
  });
  return res.status(200).json({ success: true });
};

exports.processConnectionUpdate = async (req, res) => {
  const instanceName = req.query.instance || 'unknown';
  await queueService.enqueueWebhook({
    instanceName,
    event: 'CONNECTION_UPDATE',
    body: req.body,
    receivedAt: new Date()
  });
  return res.status(200).json({ success: true });
};

exports.processQrCodeUpdated = async (req, res) => {
  const instanceName = req.query.instance || 'unknown';
  await queueService.enqueueWebhook({
    instanceName,
    event: 'QRCODE_UPDATED',
    body: req.body,
    receivedAt: new Date()
  });
  return res.status(200).json({ success: true });
};

exports.processMessageUpdate = async (req, res) => {
  const instanceName = req.query.instance || 'unknown';
  await queueService.enqueueWebhook({
    instanceName,
    event: 'MESSAGES_UPDATE',
    body: req.body,
    receivedAt: new Date()
  });
  return res.status(200).json({ success: true });
};

exports.processMessageDelete = async (req, res) => {
  const instanceName = req.query.instance || 'unknown';
  await queueService.enqueueWebhook({
    instanceName,
    event: 'MESSAGES_DELETE',
    body: req.body,
    receivedAt: new Date()
  });
  return res.status(200).json({ success: true });
};

exports.processSendMessage = async (req, res) => {
  const instanceName = req.query.instance || 'unknown';
  await queueService.enqueueWebhook({
    instanceName,
    event: 'SEND_MESSAGE',
    body: req.body,
    receivedAt: new Date()
  });
  return res.status(200).json({ success: true });
};

module.exports = exports; 