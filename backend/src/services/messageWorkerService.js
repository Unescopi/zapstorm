/**
 * Serviço de processamento de mensagens com proteção anti-spam avançada
 * Integra o sistema anti-spam com o processador de mensagens
 */

const logger = require('../utils/logger');
const { Instance, Message, Campaign } = require('../models');
const evolutionApiService = require('./evolutionApiService');
const messageVariationService = require('./messageVariationService');
const rateLimiterService = require('./rateLimiterService');
const queueService = require('./queueService');
const webhookAnalyticsService = require('./webhookAnalyticsService');

// Mapeamento de instâncias disponíveis para rotação
const availableInstances = new Map();

// Histórico de uso recente de instâncias
const instanceUsageHistory = new Map();

// Controle de reinicialização de instâncias
const instanceRestartSchedule = new Map();

/**
 * Envia uma mensagem aplicando todas as proteções anti-spam
 * @param {Object} message Objeto de mensagem com todas as informações
 * @returns {Object} Resultado do envio
 */
const sendMessageWithAntiSpam = async (message) => {
  try {
    // Buscar campanha para obter configurações
    const campaign = await Campaign.findById(message.campaignId);
    if (!campaign) {
      throw new Error(`Campanha não encontrada: ${message.campaignId}`);
    }
    
    // Buscar instância para envio
    const originalInstance = await Instance.findById(message.instanceId);
    if (!originalInstance) {
      throw new Error(`Instância não encontrada: ${message.instanceId}`);
    }
    
    // Verificar se devemos rotacionar a instância
    let instance = originalInstance;
    let isRotated = false;
    
    if (campaign.rotateInstances) {
      const rotatedInstance = await getOptimalInstance(campaign, message, originalInstance);
      if (rotatedInstance && rotatedInstance._id.toString() !== originalInstance._id.toString()) {
        instance = rotatedInstance;
        isRotated = true;
        logger.info(`Mensagem rotacionada para instância ${instance.instanceName} (originalmente ${originalInstance.instanceName})`);
      }
    }
    
    // Verificar saúde da instância antes de enviar
    if (!instance.isHealthy()) {
      logger.warn(`Instância ${instance.instanceName} não está saudável, status: ${instance.health?.status}`);
      
      // Se está em quarentena, pausar a campanha
      if (instance.status === 'quarantine') {
        logger.error(`Campanha ${campaign.name} pausada: instância ${instance.instanceName} está em quarentena`);
        await Campaign.findByIdAndUpdate(
          campaign._id,
          {
            status: 'paused',
            statusReason: `Instância ${instance.instanceName} está em quarentena. Motivo: ${instance.health?.quarantineReason || 'Desconhecido'}`
          }
        );
        throw new Error(`Instância em quarentena: ${instance.health?.quarantineReason || 'Motivo desconhecido'}`);
      }
      
      // Se estava rotacionando, tentar outra instância como fallback
      if (isRotated) {
        instance = originalInstance;
        logger.info(`Voltando para instância original ${originalInstance.instanceName} como fallback`);
      }
    }
    
    // Registrar uso da instância para análise futura
    trackInstanceUsage(instance._id.toString());
    
    // Aplicar variações anti-spam ao conteúdo se necessário
    let content = message.content;
    let contentVariation = 'original';
    
    if (campaign.antiSpam?.randomizeContent) {
      const variation = await messageVariationService.createContentVariation(content);
      content = variation.content;
      contentVariation = variation.type;
      logger.debug(`Variação de conteúdo aplicada: ${contentVariation}`);
    }
    
    // Aplicar throttling adaptativo
    const canSend = await rateLimiterService.checkRateLimit(instance._id);
    if (!canSend.allowed) {
      // Registrar informações de throttling
      const rateLimiterInfo = {
        isThrottled: true,
        throttleReason: canSend.reason,
        waitTime: canSend.waitTime
      };
      
      // Atualizar mensagem com informações de throttling
      await Message.findByIdAndUpdate(message._id, {
        rateLimiterInfo,
        status: 'scheduled_retry',
        scheduledRetryAt: new Date(Date.now() + canSend.waitTime),
        $inc: { retries: 1 }
      });
      
      logger.info(`Mensagem ${message._id} colocada em espera por ${Math.round(canSend.waitTime/1000)}s devido a throttling: ${canSend.reason}`);
      
      return {
        success: false,
        throttled: true,
        waitTime: canSend.waitTime,
        message: `Mensagem em espera devido a throttling: ${canSend.reason}`
      };
    }
    
    // Preparar informações anti-spam para o envio
    const antiSpamSettings = campaign.antiSpam || {};
    
    // Simular digitação se configurado
    if (antiSpamSettings.sendTyping) {
      const typingDuration = antiSpamSettings.typingTime || 3000;
      
      try {
        await evolutionApiService.sendTypingStatus(
          instance.instanceName,
          message.contactId.toString().includes('@') ? message.contactId : `${message.contactId}@s.whatsapp.net`,
          typingDuration
        );
        
        // Esperar o tempo de digitação
        await new Promise(resolve => setTimeout(resolve, typingDuration));
        
        // Registrar que o typing foi enviado
        message.antiSpamInfo = message.antiSpamInfo || {};
        message.antiSpamInfo.typingSent = true;
        message.antiSpamInfo.typingDuration = typingDuration;
      } catch (typingError) {
        logger.warn(`Erro ao enviar status de digitação: ${typingError.message}`);
      }
    }
    
    // Determinar intervalo entre mensagens (jitter)
    let messageInterval = 0;
    if (antiSpamSettings.messageInterval) {
      const minInterval = antiSpamSettings.messageInterval.min || 2000;
      const maxInterval = antiSpamSettings.messageInterval.max || 5000;
      messageInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
      
      // Registrar intervalo aplicado
      message.antiSpamInfo = message.antiSpamInfo || {};
      message.antiSpamInfo.appliedDelay = messageInterval;
      
      // Aplicar intervalo
      await new Promise(resolve => setTimeout(resolve, messageInterval));
    }
    
    // Enviar a mensagem
    const sendResult = await evolutionApiService.sendMessage(
      instance.instanceName,
      message.contactId.toString().includes('@') ? message.contactId : `${message.contactId}@s.whatsapp.net`,
      content,
      message.mediaUrl,
      message.mediaType
    );
    
    // Verificar resultado
    if (sendResult && sendResult.key && sendResult.key.id) {
      // Atualizar mensagem com ID retornado e marcar como enviada
      await Message.findByIdAndUpdate(message._id, {
        messageId: sendResult.key.id,
        status: 'sent',
        sentAt: new Date(),
        instanceId: instance._id, // Atualizar ID da instância se foi rotacionada
        antiSpamInfo: {
          ...(message.antiSpamInfo || {}),
          contentVariation
        },
        $push: {
          statusHistory: {
            status: 'sent',
            timestamp: new Date(),
            details: `Enviado via instância ${instance.instanceName}`
          }
        }
      });
      
      // Incrementar contadores da instância
      await Instance.findByIdAndUpdate(instance._id, {
        $inc: {
          'metrics.totalSent': 1,
          'metrics.messagesSentToday': 1
        }
      });
      
      // Verificar e aplicar pausa anti-spam após um número de mensagens
      await checkAndApplyPause(campaign, instance._id);
      
      return {
        success: true,
        messageId: sendResult.key.id,
        message: 'Mensagem enviada com sucesso'
      };
    } else {
      // Registrar falha
      await Message.findByIdAndUpdate(message._id, {
        status: 'failed',
        errorDetails: 'Falha no envio: Resposta inválida da API',
        $push: {
          statusHistory: {
            status: 'failed',
            timestamp: new Date(),
            details: `Falha no envio via ${instance.instanceName}: Resposta inválida da API`
          }
        }
      });
      
      // Registrar falha para análise de padrões
      await webhookAnalyticsService.trackMessageFailure(
        instance._id,
        message,
        'Resposta inválida da API de envio'
      );
      
      return {
        success: false,
        message: 'Falha no envio: Resposta inválida da API'
      };
    }
  } catch (error) {
    logger.error(`Erro ao enviar mensagem: ${error.message}`);
    
    // Atualizar status da mensagem para falha
    await Message.findByIdAndUpdate(message._id, {
      status: 'failed',
      errorDetails: `Erro: ${error.message}`,
      $push: {
        statusHistory: {
          status: 'failed',
          timestamp: new Date(),
          details: `Erro: ${error.message}`
        }
      }
    });
    
    return {
      success: false,
      message: `Erro ao enviar mensagem: ${error.message}`
    };
  }
};

/**
 * Registra o uso de uma instância para análise de rotação
 * @param {string} instanceId ID da instância usada
 */
const trackInstanceUsage = (instanceId) => {
  if (!instanceUsageHistory.has(instanceId)) {
    instanceUsageHistory.set(instanceId, []);
  }
  
  const usageHistory = instanceUsageHistory.get(instanceId);
  
  // Adicionar timestamp atual
  usageHistory.push(Date.now());
  
  // Limpar registros mais antigos que 24 horas
  const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
  const recentUsage = usageHistory.filter(timestamp => timestamp >= cutoffTime);
  
  instanceUsageHistory.set(instanceId, recentUsage);
};

/**
 * Busca a instância mais adequada para envio baseada em métricas
 * @param {Object} campaign Campanha
 * @param {Object} message Mensagem a ser enviada
 * @param {Object} originalInstance Instância original
 * @returns {Object} Instância otimizada para uso
 */
const getOptimalInstance = async (campaign, message, originalInstance) => {
  try {
    // Se rotação não estiver habilitada, retornar a instância original
    if (!campaign.rotateInstances) {
      return originalInstance;
    }
    
    // Buscar instâncias disponíveis
    const allInstances = await Instance.find({
      status: 'connected',
      'health.status': { $ne: 'critical' }
    });
    
    if (allInstances.length <= 1) {
      return originalInstance; // Não há outras instâncias para rotação
    }
    
    // Remover a instância original e instâncias em quarentena ou com saúde crítica
    const candidateInstances = allInstances.filter(instance => 
      instance._id.toString() !== originalInstance._id.toString() &&
      instance.status !== 'quarantine' &&
      (!instance.health?.status || instance.health.status !== 'critical') &&
      !instance.health?.blockSuspicion
    );
    
    if (candidateInstances.length === 0) {
      return originalInstance; // Não há alternativas viáveis
    }
    
    // Calcular pontuação para cada instância com base em:
    // 1. Taxa de sucesso recente
    // 2. Volume de uso nas últimas 24h
    // 3. Tempo desde o último uso
    const scoredInstances = candidateInstances.map(instance => {
      // Fator 1: Taxa de sucesso (0.0-1.0, maior é melhor)
      const successRate = instance.health?.successRate || 0.95;
      
      // Fator 2: Volume de uso (inversamente proporcional ao uso)
      const usageHistory = instanceUsageHistory.get(instance._id.toString()) || [];
      const usage24h = usageHistory.length;
      const usageFactor = Math.max(0.1, 1 - (usage24h / 1000)); // Normalizado, menor uso é melhor
      
      // Fator 3: Tempo desde último uso (maior é melhor)
      const lastUsedTimestamp = usageHistory.length > 0 ? 
        Math.max(...usageHistory) : 
        Date.now() - (24 * 60 * 60 * 1000);
      
      const timeSinceLastUse = Date.now() - lastUsedTimestamp;
      const timeFactor = Math.min(1, timeSinceLastUse / (60 * 60 * 1000)); // Normalizado para 1h
      
      // Pontuação final (0-10)
      const finalScore = (successRate * 5) + (usageFactor * 3) + (timeFactor * 2);
      
      return {
        instance,
        score: finalScore
      };
    });
    
    // Ordenar por pontuação (maior primeiro)
    scoredInstances.sort((a, b) => b.score - a.score);
    
    // Escolher a melhor instância
    return scoredInstances[0].instance;
  } catch (error) {
    logger.error(`Erro ao selecionar instância ótima: ${error.message}`);
    return originalInstance; // Fallback para instância original em caso de erro
  }
};

/**
 * Verifica e aplica pausa anti-spam após envio de mensagens
 * @param {Object} campaign Campanha
 * @param {string} instanceId ID da instância
 */
const checkAndApplyPause = async (campaign, instanceId) => {
  try {
    // Verificar configurações de pausa
    const antiSpam = campaign.antiSpam || {};
    if (!antiSpam.pauseAfter || !antiSpam.pauseAfter.count) {
      return; // Pausa não configurada
    }
    
    // Incrementar contador de mensagens enviadas
    const instanceKey = `${campaign._id}-${instanceId}`;
    let sentCount = (availableInstances.get(instanceKey)?.sentCount || 0) + 1;
    
    // Atualizar contador
    availableInstances.set(instanceKey, {
      ...(availableInstances.get(instanceKey) || {}),
      sentCount
    });
    
    // Verificar se atingiu o limite para pausa
    if (sentCount >= antiSpam.pauseAfter.count) {
      // Gerar duração da pausa aleatória dentro do intervalo configurado
      const minDuration = antiSpam.pauseAfter.duration?.min || 10000;
      const maxDuration = antiSpam.pauseAfter.duration?.max || 30000;
      const pauseDuration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
      
      logger.info(`Aplicando pausa anti-spam de ${pauseDuration/1000}s para campanha ${campaign.name} na instância ${instanceId}`);
      
      // Marcar instância como indisponível temporariamente para esta campanha
      availableInstances.set(instanceKey, {
        sentCount: 0, // Reiniciar contador
        pausedUntil: Date.now() + pauseDuration,
        pauseDuration
      });
      
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`Erro ao verificar/aplicar pausa anti-spam: ${error.message}`);
    return false;
  }
};

/**
 * Verifica se uma instância está em pausa para uma campanha
 * @param {string} campaignId ID da campanha
 * @param {string} instanceId ID da instância
 * @returns {boolean} Se a instância está em pausa
 */
const isInstancePaused = (campaignId, instanceId) => {
  const key = `${campaignId}-${instanceId}`;
  const info = availableInstances.get(key);
  
  if (!info || !info.pausedUntil) {
    return false;
  }
  
  // Verificar se a pausa já expirou
  if (info.pausedUntil < Date.now()) {
    // Pausa expirou, atualizar e liberar
    availableInstances.set(key, {
      sentCount: 0,
      pausedUntil: null
    });
    return false;
  }
  
  // Instância ainda está em pausa
  return true;
};

/**
 * Agenda reinicialização preventiva de uma instância
 * @param {string} instanceId ID da instância
 * @param {number} delay Atraso em ms até reinicialização
 * @param {string} reason Motivo da reinicialização
 */
const scheduleInstanceRestart = async (instanceId, delay = 3600000, reason = 'Reinicialização preventiva') => {
  try {
    // Verificar se já há uma reinicialização agendada
    if (instanceRestartSchedule.has(instanceId)) {
      return;
    }
    
    logger.info(`Agendando reinicialização da instância ${instanceId} em ${delay/60000} minutos. Motivo: ${reason}`);
    
    // Agendar
    const timeoutId = setTimeout(async () => {
      try {
        // Remover do agendamento
        instanceRestartSchedule.delete(instanceId);
        
        // Buscar instância
        const instance = await Instance.findById(instanceId);
        if (!instance) {
          logger.warn(`Instância ${instanceId} não encontrada para reinicialização agendada`);
          return;
        }
        
        // Pausar campanhas ativas
        const pausedCount = await webhookAnalyticsService.pauseActiveInstanceCampaigns(instanceId);
        
        // Registrar ação
        logger.info(`Executando reinicialização preventiva da instância ${instance.instanceName}. ${pausedCount} campanhas pausadas temporariamente.`);
        
        // Atualizar status
        await Instance.findByIdAndUpdate(instanceId, {
          status: 'disconnected',
          health: {
            ...instance.health,
            details: `Reinicialização preventiva: ${reason}`,
            lastCheckTimestamp: new Date()
          }
        });
        
        // Reiniciar instância via Evolution API
        await evolutionApiService.restartInstance(instance.instanceName);
        
        // Agendar verificação de reconexão após 2 minutos
        setTimeout(async () => {
          try {
            // Verificar status atual
            const updatedInstance = await Instance.findById(instanceId);
            if (updatedInstance && updatedInstance.status === 'disconnected') {
              // Tentar reconectar
              await evolutionApiService.connectInstance(updatedInstance.instanceName);
              logger.info(`Tentativa de reconexão automática para ${updatedInstance.instanceName} após reinicialização preventiva`);
            }
          } catch (error) {
            logger.error(`Erro na verificação pós-reinicialização: ${error.message}`);
          }
        }, 120000); // 2 minutos
        
      } catch (error) {
        logger.error(`Erro ao executar reinicialização agendada: ${error.message}`);
        // Limpar do agendamento mesmo em caso de erro
        instanceRestartSchedule.delete(instanceId);
      }
    }, delay);
    
    // Registrar no mapa de agendamentos
    instanceRestartSchedule.set(instanceId, {
      timeoutId,
      scheduledTime: Date.now() + delay,
      reason
    });
    
  } catch (error) {
    logger.error(`Erro ao agendar reinicialização: ${error.message}`);
  }
};

// Inicializar job para restaurar campanhas pausadas automaticamente
const initializeAutoRecovery = () => {
  // A cada 5 minutos, verificar campanhas pausadas por motivos anti-spam e tentar restaurar
  setInterval(async () => {
    try {
      // Buscar campanhas pausadas por motivos de anti-spam
      const pausedCampaigns = await Campaign.find({
        status: 'paused',
        statusReason: { $regex: /quarentena|bloqueio|anti-?spam/i }
      });
      
      for (const campaign of pausedCampaigns) {
        // Verificar se a instância já está recuperada
        if (campaign.instanceId) {
          const instance = await Instance.findById(campaign.instanceId);
          
          // Se a instância está saudável novamente, reativar campanha
          if (instance && instance.isHealthy()) {
            logger.info(`Reativando automaticamente campanha ${campaign.name} após recuperação da instância ${instance.instanceName}`);
            
            await Campaign.findByIdAndUpdate(campaign._id, {
              status: 'running',
              statusReason: `Reativada automaticamente após recuperação da instância ${instance.instanceName}`
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Erro na verificação de recuperação automática: ${error.message}`);
    }
  }, 5 * 60 * 1000); // 5 minutos
};

// Inicializar recuperação automática
initializeAutoRecovery();

module.exports = {
  sendMessageWithAntiSpam,
  isInstancePaused,
  scheduleInstanceRestart,
  getOptimalInstance
}; 