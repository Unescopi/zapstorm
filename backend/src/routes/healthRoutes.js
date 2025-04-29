const express = require('express');
const router = express.Router();
const queueService = require('../services/queueService');
const { Instance } = require('../models');
const logger = require('../utils/logger');

// Rota básica de health check
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Serviço online',
    timestamp: new Date().toISOString()
  });
});

// Verificar status do RabbitMQ
router.get('/rabbitmq', async (req, res) => {
  try {
    // Verificar se está conectado
    const isConnected = queueService.connection && queueService.channel;
    
    let queuesInfo = {};
    let offlineCache = null;
    
    if (isConnected) {
      // Tentar obter estatísticas das filas
      try {
        const messagesQueue = await queueService.getQueueStats(queueService.queues.MESSAGES);
        const retryQueue = await queueService.getQueueStats(queueService.queues.RETRY);
        const failedQueue = await queueService.getQueueStats(queueService.queues.FAILED);
        
        queuesInfo = {
          messages: messagesQueue,
          retry: retryQueue,
          failed: failedQueue
        };
      } catch (error) {
        logger.error('Erro ao obter estatísticas das filas:', error);
        queuesInfo = { error: 'Não foi possível obter estatísticas das filas' };
      }
    } else {
      // Se não estiver conectado, mostrar informações do cache offline
      offlineCache = {
        messages: queueService.offlineCache.messages.length,
        retry: queueService.offlineCache.retry.length,
        failed: queueService.offlineCache.failed.length
      };
      
      // Tentar conectar ao RabbitMQ em background
      queueService.tryReconnect().catch(err => {
        logger.error('Falha ao tentar reconectar ao RabbitMQ:', err);
      });
    }
    
    res.status(200).json({
      success: true,
      status: isConnected ? 'connected' : 'disconnected',
      offlineMode: queueService.isOfflineMode,
      connectionUrl: queueService.url,
      queues: queuesInfo,
      offlineCache,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao verificar status do RabbitMQ:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar status do RabbitMQ',
      error: error.message
    });
  }
});

// Verificar status das instâncias
router.get('/instances', async (req, res) => {
  try {
    const instances = await Instance.find({}, 'instanceName status createdAt lastActive');
    
    // Contar instâncias conectadas vs desconectadas
    const connected = instances.filter(i => i.status === 'connected').length;
    const disconnected = instances.filter(i => i.status !== 'connected').length;
    
    res.status(200).json({
      success: true,
      total: instances.length,
      connected,
      disconnected,
      instances: instances.map(i => ({
        name: i.instanceName,
        status: i.status,
        lastActive: i.lastActive
      })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao verificar status das instâncias:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar status das instâncias',
      error: error.message
    });
  }
});

// Rota para forçar o processamento do cache offline
router.post('/process-offline-cache', async (req, res) => {
  try {
    if (!queueService.isOfflineMode && queueService.connection && queueService.channel) {
      const cacheStats = {
        messages: queueService.offlineCache.messages.length,
        retry: queueService.offlineCache.retry.length,
        failed: queueService.offlineCache.failed.length
      };
      
      // Processar cache offline
      await queueService.processOfflineCache();
      
      // Obter estatísticas após processamento
      const afterStats = {
        messages: queueService.offlineCache.messages.length,
        retry: queueService.offlineCache.retry.length,
        failed: queueService.offlineCache.failed.length
      };
      
      res.json({
        status: 'success',
        message: 'Cache offline processado com sucesso',
        before: cacheStats,
        after: afterStats,
        processed: {
          messages: cacheStats.messages - afterStats.messages,
          retry: cacheStats.retry - afterStats.retry,
          failed: cacheStats.failed - afterStats.failed
        }
      });
    } else {
      // Tentar conectar primeiro
      try {
        await queueService.connect();
        
        if (queueService.connection && queueService.channel) {
          // Agora processar o cache
          const cacheStats = {
            messages: queueService.offlineCache.messages.length,
            retry: queueService.offlineCache.retry.length,
            failed: queueService.offlineCache.failed.length
          };
          
          await queueService.processOfflineCache();
          
          const afterStats = {
            messages: queueService.offlineCache.messages.length,
            retry: queueService.offlineCache.retry.length,
            failed: queueService.offlineCache.failed.length
          };
          
          res.json({
            status: 'success',
            message: 'Conectado ao RabbitMQ e cache processado com sucesso',
            before: cacheStats,
            after: afterStats,
            processed: {
              messages: cacheStats.messages - afterStats.messages,
              retry: cacheStats.retry - afterStats.retry,
              failed: cacheStats.failed - afterStats.failed
            }
          });
        } else {
          res.status(503).json({
            status: 'error',
            message: 'Não foi possível conectar ao RabbitMQ para processar o cache',
            offlineCache: {
              messages: queueService.offlineCache.messages.length,
              retry: queueService.offlineCache.retry.length,
              failed: queueService.offlineCache.failed.length
            }
          });
        }
      } catch (error) {
        res.status(503).json({
          status: 'error',
          message: 'Erro ao conectar ao RabbitMQ',
          error: error.message,
          offlineCache: {
            messages: queueService.offlineCache.messages.length,
            retry: queueService.offlineCache.retry.length,
            failed: queueService.offlineCache.failed.length
          }
        });
      }
    }
  } catch (error) {
    logger.error('Erro ao processar cache offline:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erro ao processar cache offline',
      error: error.message
    });
  }
});

module.exports = router; 