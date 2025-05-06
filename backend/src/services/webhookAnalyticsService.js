/**
 * Serviço para análise de eventos de webhook e otimização anti-spam
 * Implementa detecção proativa de bloqueios e ajustes automáticos nos parâmetros anti-spam
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { Instance, Campaign, Message } = require('../models');
const rateLimiterService = require('./rateLimiterService');

// Limite de falhas por instância antes de ações serem tomadas
const FAILURE_THRESHOLD = 5;
const BLOCK_SUSPICION_THRESHOLD = 3;

// Intervalo de tempo para análise de falhas (em milissegundos)
const ANALYSIS_WINDOW = 15 * 60 * 1000; // 15 minutos

// Registro temporário em memória de eventos de falha por instância
const instanceFailures = new Map();
const instanceBlocks = new Map();
const messageStatusUpdates = new Map();

/**
 * Registra falha de mensagem para análise de padrões
 * @param {string} instanceId ID da instância
 * @param {Object} message Informações da mensagem
 * @param {string} statusInfo Informações sobre o status
 */
const trackMessageFailure = async (instanceId, message, statusInfo) => {
  try {
    // Garantir que temos o registro para esta instância
    if (!instanceFailures.has(instanceId)) {
      instanceFailures.set(instanceId, []);
    }

    // Adicionar falha aos registros
    const failures = instanceFailures.get(instanceId);
    failures.push({
      timestamp: Date.now(),
      messageId: message.id || message._id,
      statusInfo,
      type: message.type || 'unknown'
    });
    
    // Limpar registros antigos fora da janela de análise
    const cutoffTime = Date.now() - ANALYSIS_WINDOW;
    const recentFailures = failures.filter(failure => failure.timestamp >= cutoffTime);
    instanceFailures.set(instanceId, recentFailures);
    
    // Se atingirmos o limite de falhas, analisar e tomar ações
    if (recentFailures.length >= FAILURE_THRESHOLD) {
      await analyzeFailurePatterns(instanceId, recentFailures);
    }
    
    // Registrar no banco de dados para análises históricas
    await logMessageFailure(instanceId, message, statusInfo);
  } catch (error) {
    logger.error(`Erro ao rastrear falha de mensagem: ${error.message}`, error);
  }
};

/**
 * Analisa padrões de falha e ajusta configurações anti-spam
 * @param {string} instanceId ID da instância
 * @param {Array} failures Lista de falhas recentes
 */
const analyzeFailurePatterns = async (instanceId, failures) => {
  try {
    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      logger.error(`Instância não encontrada: ${instanceId}`);
      return;
    }
    
    logger.warn(`Analisando padrões de falha para instância ${instance.instanceName} - ${failures.length} falhas recentes`);
    
    // Verificar padrões de bloqueio
    const blockSuspicion = detectBlockPatterns(failures);
    if (blockSuspicion >= BLOCK_SUSPICION_THRESHOLD) {
      logger.warn(`Possível bloqueio detectado na instância ${instance.instanceName} (pontuação: ${blockSuspicion})`);
      await handlePossibleBlock(instance, blockSuspicion);
      return;
    }
    
    // Verificar padrões de taxa de envio
    if (isRateLimitPattern(failures)) {
      logger.warn(`Padrão de limite de taxa detectado para ${instance.instanceName}`);
      await adjustThrottlingSettings(instance, failures);
      return;
    }
    
    // Verificar outros padrões de erro como mensagens muito longas, formato inválido, etc.
    const contentIssues = detectContentIssues(failures);
    if (contentIssues) {
      logger.warn(`Problemas de conteúdo detectados para ${instance.instanceName}: ${contentIssues}`);
      // Registrar para análise
    }
    
    logger.info(`Análise de padrões concluída para ${instance.instanceName}`);
  } catch (error) {
    logger.error(`Erro ao analisar padrões de falha: ${error.message}`, error);
  }
};

/**
 * Detecta padrões específicos de bloqueio nas falhas
 * @param {Array} failures Lista de falhas
 * @returns {number} Pontuação de suspeita de bloqueio
 */
const detectBlockPatterns = (failures) => {
  let blockSuspicionScore = 0;
  
  // Verificar mensagens de erro específicas relacionadas a bloqueio
  const blockKeywords = [
    'blocked', 'ban', 'spam', 'restriction', 'action required', 'security',
    'unusual activity', 'verify', 'temporarily unavailable', 'not permitted'
  ];
  
  for (const failure of failures) {
    const status = (failure.statusInfo || '').toLowerCase();
    
    // Verificar por termos de bloqueio conhecidos
    for (const keyword of blockKeywords) {
      if (status.includes(keyword)) {
        blockSuspicionScore += 1;
        break;
      }
    }
    
    // Verificar por código de status específicos
    if (status.includes('403') || status.includes('401')) {
      blockSuspicionScore += 1;
    }
    
    // Verificar por falhas consecutivas rápidas
    if (failures.length > 3) {
      const timestamps = failures.map(f => f.timestamp).sort();
      if (timestamps[timestamps.length - 1] - timestamps[0] < 60000) { // Menos de 1 minuto
        blockSuspicionScore += 2;
      }
    }
  }
  
  return blockSuspicionScore;
};

/**
 * Detecta se falhas são relacionadas a limites de taxa
 * @param {Array} failures Lista de falhas
 * @returns {boolean} Se parece ser um problema de limite de taxa
 */
const isRateLimitPattern = (failures) => {
  // Verificar mensagens de erro relacionadas a limite de taxa
  const rateLimitKeywords = ['rate', 'limit', 'too many', 'flood', 'wait', 'try again'];
  
  let rateLimitCount = 0;
  for (const failure of failures) {
    const status = (failure.statusInfo || '').toLowerCase();
    for (const keyword of rateLimitKeywords) {
      if (status.includes(keyword)) {
        rateLimitCount++;
        break;
      }
    }
  }
  
  // Se mais de 30% das falhas parecem ser de limite de taxa
  return rateLimitCount / failures.length > 0.3;
};

/**
 * Ajusta configurações de throttling com base nas falhas
 * @param {Object} instance Instância do WhatsApp
 * @param {Array} failures Lista de falhas
 */
const adjustThrottlingSettings = async (instance, failures) => {
  try {
    // Calcular novos limites com base nas falhas
    const currentLimits = instance.throttling || {
      perMinute: 20,
      perHour: 300,
      batchSize: 10,
      batchDelay: 3000
    };
    
    // Reduzir o limite por minuto em 20% se não for muito baixo
    let newPerMinute = Math.max(5, Math.floor(currentLimits.perMinute * 0.8));
    
    // Reduzir o limite por hora proporcionalmente
    let newPerHour = Math.max(60, Math.floor(currentLimits.perHour * 0.8));
    
    // Aumentar o atraso entre lotes
    let newBatchDelay = Math.min(10000, currentLimits.batchDelay * 1.2);
    
    // Reduzir tamanho do lote se necessário
    let newBatchSize = Math.max(3, Math.floor(currentLimits.batchSize * 0.8));
    
    // Atualizar instância
    await Instance.findByIdAndUpdate(
      instance._id,
      {
        throttling: {
          perMinute: newPerMinute,
          perHour: newPerHour,
          batchSize: newBatchSize,
          batchDelay: newBatchDelay
        },
        lastAdjustment: {
          timestamp: Date.now(),
          reason: `Ajuste automático devido a ${failures.length} falhas de limite de taxa`
        }
      }
    );
    
    logger.info(`Limites de throttling ajustados para ${instance.instanceName}: ${newPerMinute}/min, ${newPerHour}/hora, batch=${newBatchSize}, delay=${newBatchDelay}ms`);
    
    // Notificar admin (futuro: implementar notificação)
  } catch (error) {
    logger.error(`Erro ao ajustar configurações de throttling: ${error.message}`, error);
  }
};

/**
 * Detecta problemas relacionados ao conteúdo nas falhas
 * @param {Array} failures Lista de falhas
 * @returns {string|null} Descrição dos problemas ou null se não houver
 */
const detectContentIssues = (failures) => {
  const contentIssueKeywords = [
    'invalid', 'format', 'unsupported', 'too long', 'media',
    'url', 'image', 'video', 'attachment', 'message'
  ];
  
  const issues = [];
  
  for (const failure of failures) {
    const status = (failure.statusInfo || '').toLowerCase();
    for (const keyword of contentIssueKeywords) {
      if (status.includes(keyword)) {
        issues.push(`${keyword} issue: ${status}`);
        break;
      }
    }
  }
  
  return issues.length > 0 ? issues.join('; ') : null;
};

/**
 * Lida com possível bloqueio de instância
 * @param {Object} instance Instância do WhatsApp
 * @param {number} suspicionScore Pontuação de suspeita
 */
const handlePossibleBlock = async (instance, suspicionScore) => {
  try {
    // Importar o serviço de worker para agendar reinicializações
    const messageWorkerService = require('./messageWorkerService');
    
    // Registrar bloqueio suspeito
    if (!instanceBlocks.has(instance._id.toString())) {
      instanceBlocks.set(instance._id.toString(), []);
    }
    
    const blocks = instanceBlocks.get(instance._id.toString());
    blocks.push({
      timestamp: Date.now(),
      score: suspicionScore
    });
    
    // Limpar bloqueios antigos
    const recentBlocks = blocks.filter(block => block.timestamp > Date.now() - 24 * 60 * 60 * 1000);
    instanceBlocks.set(instance._id.toString(), recentBlocks);
    
    // Atualizar status da instância
    await Instance.findByIdAndUpdate(
      instance._id,
      {
        health: {
          status: 'warning',
          lastCheckTimestamp: Date.now(),
          blockSuspicion: true,
          suspicionScore,
          blockWarningCount: (instance.health?.blockWarningCount || 0) + 1
        }
      }
    );
    
    // Pausar campanhas ativas nesta instância
    const pausedCampaigns = await pauseActiveInstanceCampaigns(instance._id);
    
    // Se pontuação é muito alta, colocar em modo de quarentena
    if (suspicionScore >= 7 || recentBlocks.length >= 3) {
      await Instance.findByIdAndUpdate(
        instance._id,
        {
          status: 'quarantine',
          health: {
            status: 'critical',
            quarantineReason: `Possível bloqueio detectado (score: ${suspicionScore})`,
            quarantineTimestamp: Date.now()
          }
        }
      );
      
      logger.error(`Instância ${instance.instanceName} colocada em quarentena devido a suspeita de bloqueio!`);
      
      // Agendar reinicialização preventiva da instância
      messageWorkerService.scheduleInstanceRestart(
        instance._id.toString(),
        30 * 60 * 1000, // 30 minutos para deixar "esfriar"
        `Reinicialização automática após suspeita de bloqueio (score: ${suspicionScore})`
      );
    } 
    // Para pontuações médias, agendar reinicialização sem quarentena
    else if (suspicionScore >= 5) {
      // Agendar reinicialização preventiva, mesmo sem quarentena
      messageWorkerService.scheduleInstanceRestart(
        instance._id.toString(),
        15 * 60 * 1000, // 15 minutos 
        `Reinicialização preventiva por suspeita de limitação (score: ${suspicionScore})`
      );
      
      logger.warn(`Agendada reinicialização preventiva da instância ${instance.instanceName} devido a suspeita de limitação`);
    }
    
    logger.warn(`Possível bloqueio tratado para ${instance.instanceName}. ${pausedCampaigns} campanhas pausadas.`);
  } catch (error) {
    logger.error(`Erro ao lidar com possível bloqueio: ${error.message}`, error);
  }
};

/**
 * Pausa todas as campanhas ativas em uma instância
 * @param {string} instanceId ID da instância
 * @returns {number} Número de campanhas pausadas
 */
const pauseActiveInstanceCampaigns = async (instanceId) => {
  try {
    const result = await Campaign.updateMany(
      { 
        instanceId, 
        status: 'running'
      },
      {
        status: 'paused',
        lastUpdated: Date.now(),
        statusReason: 'Pausada automaticamente devido a suspeita de bloqueio'
      }
    );
    
    return result.modifiedCount || 0;
  } catch (error) {
    logger.error(`Erro ao pausar campanhas: ${error.message}`, error);
    return 0;
  }
};

/**
 * Registra falha de mensagem no banco de dados
 * @param {string} instanceId ID da instância
 * @param {Object} message Informações da mensagem
 * @param {string} statusInfo Informações sobre o status
 */
const logMessageFailure = async (instanceId, message, statusInfo) => {
  try {
    // Atualizar mensagem no banco de dados
    if (message._id || message.id) {
      await Message.findByIdAndUpdate(
        message._id || message.id,
        {
          $push: {
            statusHistory: {
              status: 'failed',
              timestamp: Date.now(),
              details: statusInfo
            }
          }
        }
      );
    }
    
    // Incrementar contador de falhas na instância
    await Instance.findByIdAndUpdate(
      instanceId,
      {
        $inc: { 'metrics.totalFailed': 1 }
      }
    );
  } catch (error) {
    logger.error(`Erro ao registrar falha de mensagem: ${error.message}`, error);
  }
};

/**
 * Processa atualização de status de mensagem recebida via webhook
 * @param {Object} event Evento do webhook
 */
const processMessageStatusUpdate = async (event) => {
  try {
    if (!event || !event.data) return;
    
    const { instanceName, data } = event;
    
    // Buscar instância pelo nome
    const instance = await Instance.findOne({ instanceName });
    if (!instance) {
      logger.error(`Instância não encontrada para webhook: ${instanceName}`);
      return;
    }
    
    // Extrair IDs de mensagem e status
    const messageId = data.id || data.key?.id;
    if (!messageId) {
      logger.debug('Evento sem ID de mensagem, ignorando');
      return;
    }
    
    // Rastrear atualizações para cada mensagem
    if (!messageStatusUpdates.has(messageId)) {
      messageStatusUpdates.set(messageId, []);
    }
    
    const updates = messageStatusUpdates.get(messageId);
    updates.push({
      timestamp: Date.now(),
      status: data.status || data.type,
      updateType: event.type,
      instanceId: instance._id
    });
    
    // Limpar mensagens antigas (mais de 24h)
    setTimeout(() => {
      if (messageStatusUpdates.has(messageId)) {
        messageStatusUpdates.delete(messageId);
      }
    }, 24 * 60 * 60 * 1000);
    
    // Processar baseado no tipo de evento
    switch (event.type) {
      case 'MESSAGES_UPDATE':
        await processMessageUpdate(instance, messageId, data);
        break;
      case 'MESSAGE_ACK_UPDATE':
        await processAckUpdate(instance, messageId, data);
        break;
      default:
        // Outros tipos de eventos
        break;
    }
  } catch (error) {
    logger.error(`Erro ao processar atualização de status: ${error.message}`, error);
  }
};

/**
 * Processa atualização de mensagem
 * @param {Object} instance Instância
 * @param {string} messageId ID da mensagem
 * @param {Object} data Dados do evento
 */
const processMessageUpdate = async (instance, messageId, data) => {
  try {
    // Verificar se é uma atualização de falha
    const isFailure = data.status === 'ERROR' || 
                      data.status === 'FAIL' || 
                      data.status === 'PENDING';
    
    if (isFailure) {
      await trackMessageFailure(
        instance._id, 
        { id: messageId, type: data.type }, 
        data.body || JSON.stringify(data)
      );
    }
    
    // Atualizar status da mensagem no banco de dados
    const message = await Message.findOne({ messageId });
    if (message) {
      message.status = isFailure ? 'failed' : data.status || message.status;
      message.errorDetails = isFailure ? (data.body || JSON.stringify(data)) : message.errorDetails;
      message.statusHistory = message.statusHistory || [];
      message.statusHistory.push({
        status: message.status,
        timestamp: Date.now(),
        details: data.body || JSON.stringify(data)
      });
      
      await message.save();
    }
  } catch (error) {
    logger.error(`Erro ao processar atualização de mensagem: ${error.message}`, error);
  }
};

/**
 * Processa atualização de confirmação de mensagem (ACK)
 * @param {Object} instance Instância
 * @param {string} messageId ID da mensagem
 * @param {Object} data Dados do evento
 */
const processAckUpdate = async (instance, messageId, data) => {
  try {
    // Mapear códigos ACK para status
    const ackMap = {
      '-1': 'error',
      '0': 'pending',
      '1': 'sent',
      '2': 'delivered',
      '3': 'read',
      '4': 'played'
    };
    
    const ackStatus = ackMap[data.ack?.toString()] || 'unknown';
    
    // Buscar e atualizar a mensagem
    const message = await Message.findOne({ messageId });
    if (message) {
      // Verificar se é uma degradação de status (possível erro)
      const isDegrade = ackStatus === 'error' || 
                        (message.status === 'delivered' && ackStatus === 'sent') ||
                        (message.status === 'read' && ['sent', 'delivered'].includes(ackStatus));
      
      if (isDegrade) {
        await trackMessageFailure(
          instance._id,
          message,
          `Degradação de status ACK: ${message.status} -> ${ackStatus}`
        );
      }
      
      // Atualizar apenas se o status for "melhor" que o anterior
      // (ou se for um erro)
      if (ackStatus === 'error' || shouldUpdateMessageStatus(message.status, ackStatus)) {
        message.status = ackStatus;
        message.statusHistory = message.statusHistory || [];
        message.statusHistory.push({
          status: ackStatus,
          timestamp: Date.now(),
          details: `ACK code: ${data.ack}`
        });
        
        await message.save();
        
        // Atualizar métricas da campanha
        if (message.campaignId) {
          await updateCampaignMetrics(message.campaignId, message.status);
        }
      }
    }
  } catch (error) {
    logger.error(`Erro ao processar ACK: ${error.message}`, error);
  }
};

/**
 * Determina se o status da mensagem deve ser atualizado
 * @param {string} currentStatus Status atual
 * @param {string} newStatus Novo status
 * @returns {boolean} Se deve atualizar
 */
const shouldUpdateMessageStatus = (currentStatus, newStatus) => {
  const statusHierarchy = {
    'error': 0,
    'pending': 1,
    'queued': 2,
    'sent': 3,
    'delivered': 4,
    'read': 5,
    'played': 6
  };
  
  const currentValue = statusHierarchy[currentStatus] || 0;
  const newValue = statusHierarchy[newStatus] || 0;
  
  // Atualizar se o novo status for de hierarquia superior
  return newValue > currentValue;
};

/**
 * Atualiza métricas da campanha com base em atualizações de status
 * @param {string} campaignId ID da campanha
 * @param {string} status Novo status
 */
const updateCampaignMetrics = async (campaignId, status) => {
  try {
    const updateField = {
      'sent': 'metrics.sent',
      'delivered': 'metrics.delivered',
      'read': 'metrics.read',
      'error': 'metrics.failed'
    }[status];
    
    if (updateField) {
      const update = { $inc: {} };
      update.$inc[updateField] = 1;
      
      await Campaign.findByIdAndUpdate(campaignId, update);
    }
  } catch (error) {
    logger.error(`Erro ao atualizar métricas da campanha: ${error.message}`, error);
  }
};

/**
 * Analisa a saúde geral de todas as instâncias
 */
const analyzeInstancesHealth = async () => {
  try {
    // Importar serviço de worker para agendar reinicializações
    const messageWorkerService = require('./messageWorkerService');
    
    // Buscar todas as instâncias ativas
    const instances = await Instance.find({ 
      status: { $in: ['connected', 'warning', 'quarantine'] } 
    });
    
    for (const instance of instances) {
      // Pular instâncias já em quarentena
      if (instance.status === 'quarantine') {
        continue;
      }
      
      // Buscar métricas recentes
      const recentMessages = await Message.find({
        instanceId: instance._id,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      
      if (recentMessages.length === 0) {
        continue; // Nenhuma mensagem recente
      }
      
      // Calcular taxa de sucesso
      const total = recentMessages.length;
      const successful = recentMessages.filter(m => 
        ['sent', 'delivered', 'read'].includes(m.status)
      ).length;
      
      const successRate = successful / total;
      
      // Atualizar saúde da instância
      let healthStatus = 'healthy';
      let healthDetails = null;
      
      if (successRate < 0.7) {
        healthStatus = 'critical';
        healthDetails = `Taxa de sucesso baixa: ${(successRate * 100).toFixed(1)}%`;
      } else if (successRate < 0.85) {
        healthStatus = 'warning';
        healthDetails = `Taxa de sucesso abaixo do ideal: ${(successRate * 100).toFixed(1)}%`;
      }
      
      await Instance.findByIdAndUpdate(
        instance._id,
        {
          health: {
            status: healthStatus,
            successRate: successRate,
            lastCheckTimestamp: Date.now(),
            details: healthDetails,
            messageVolume24h: total
          }
        }
      );
      
      // Se status for crítico, verificar se deve entrar em quarentena
      if (healthStatus === 'critical' && instance.health?.status === 'critical') {
        // Já estava em estado crítico, verificar tempo
        const lastCheck = new Date(instance.health.lastCheckTimestamp || 0);
        const hoursSinceCritical = (Date.now() - lastCheck.getTime()) / (60 * 60 * 1000);
        
        if (hoursSinceCritical > 2) {
          // Em estado crítico por mais de 2 horas, colocar em quarentena
          await Instance.findByIdAndUpdate(
            instance._id,
            {
              status: 'quarantine',
              health: {
                status: 'critical',
                quarantineReason: `Taxa de sucesso criticamente baixa por mais de 2 horas: ${(successRate * 100).toFixed(1)}%`,
                quarantineTimestamp: Date.now()
              }
            }
          );
          
          // Pausar campanhas
          await pauseActiveInstanceCampaigns(instance._id);
          
          // Agendar reinicialização
          messageWorkerService.scheduleInstanceRestart(
            instance._id.toString(),
            60 * 60 * 1000, // 1 hora
            `Reinicialização automática após quarentena por taxa de sucesso crítica: ${(successRate * 100).toFixed(1)}%`
          );
          
          logger.error(`Instância ${instance.instanceName} colocada em quarentena devido a taxa de sucesso crítica!`);
        }
      }
      // Se status for de alerta mas tem volume alto de mensagens e taxa de sucesso baixa, agendar reinicialização preventiva
      else if (healthStatus === 'warning' && total > 100 && successRate < 0.8) {
        // Verificar se já foi agendada uma reinicialização recentemente
        const lastRestart = instance.health?.lastRestartScheduled || 0;
        const hoursSinceLastRestart = (Date.now() - lastRestart) / (60 * 60 * 1000);
        
        // Só agendar nova reinicialização se a última foi há mais de 8 horas
        if (hoursSinceLastRestart > 8) {
          logger.warn(`Agendando reinicialização preventiva para instância ${instance.instanceName} devido a taxa de sucesso baixa contínua`);
          
          // Registrar que agendamos uma reinicialização
          await Instance.findByIdAndUpdate(
            instance._id,
            { 'health.lastRestartScheduled': Date.now() }
          );
          
          // Agendar reinicialização para um horário de menor uso
          messageWorkerService.scheduleInstanceRestart(
            instance._id.toString(),
            3 * 60 * 60 * 1000, // 3 horas (para tentar pegar um horário de menor uso)
            `Reinicialização preventiva por taxa de sucesso abaixo do ideal: ${(successRate * 100).toFixed(1)}%`
          );
        }
      }
    }
    
    logger.info(`Análise de saúde concluída para ${instances.length} instâncias`);
  } catch (error) {
    logger.error(`Erro ao analisar saúde das instâncias: ${error.message}`, error);
  }
};

/**
 * Verifica instâncias em quarentena para possível recuperação
 */
const checkQuarantinedInstances = async () => {
  try {
    // Buscar instâncias em quarentena
    const instances = await Instance.find({ status: 'quarantine' });
    
    for (const instance of instances) {
      // Verificar tempo de quarentena
      const quarantineTime = new Date(instance.health?.quarantineTimestamp || 0);
      const hoursInQuarantine = (Date.now() - quarantineTime.getTime()) / (60 * 60 * 1000);
      
      // Recuperar após 24 horas em quarentena automaticamente
      if (hoursInQuarantine >= 24) {
        await Instance.findByIdAndUpdate(
          instance._id,
          {
            status: 'warning', // Recupera, mas mantém em warning
            health: {
              status: 'warning',
              details: 'Recuperado automaticamente após período de quarentena',
              recoveryTimestamp: Date.now(),
              previousQuarantineReason: instance.health?.quarantineReason
            }
          }
        );
        
        logger.info(`Instância ${instance.instanceName} recuperada automaticamente após ${hoursInQuarantine.toFixed(1)} horas em quarentena`);
      }
    }
  } catch (error) {
    logger.error(`Erro ao verificar instâncias em quarentena: ${error.message}`, error);
  }
};

// Iniciar análise periódica de saúde (a cada 3 horas)
setInterval(analyzeInstancesHealth, 3 * 60 * 60 * 1000);

// Verificar instâncias em quarentena (a cada 6 horas)
setInterval(checkQuarantinedInstances, 6 * 60 * 60 * 1000);

module.exports = {
  processMessageStatusUpdate,
  trackMessageFailure,
  analyzeInstancesHealth,
  checkQuarantinedInstances,
  handlePossibleBlock
}; 