/**
 * Serviço para controle de taxa de envio de mensagens
 * Implementa limites por instância para evitar bloqueios do WhatsApp
 */

const logger = require('../utils/logger');
const { Instance } = require('../models');

// Rastrear limites de envio em memória (poderia usar Redis em produção)
const counters = {
  minutely: {}, // Contadores por minuto
  hourly: {},   // Contadores por hora
  daily: {}     // Contadores por dia
};

// Limpar contadores expirados
setInterval(() => {
  const now = Date.now();
  
  // Limpar contadores de minuto após 5 minutos
  Object.keys(counters.minutely).forEach(key => {
    const [instanceName, timestamp] = key.split(':');
    if (now - parseInt(timestamp) > 5 * 60 * 1000) {
      delete counters.minutely[key];
    }
  });
  
  // Limpar contadores de hora após 3 horas
  Object.keys(counters.hourly).forEach(key => {
    const [instanceName, timestamp] = key.split(':');
    if (now - parseInt(timestamp) > 3 * 60 * 60 * 1000) {
      delete counters.hourly[key];
    }
  });
  
  // Limpar contadores de dia após 2 dias
  Object.keys(counters.daily).forEach(key => {
    const [instanceName, timestamp] = key.split(':');
    if (now - parseInt(timestamp) > 2 * 24 * 60 * 60 * 1000) {
      delete counters.daily[key];
    }
  });
}, 30 * 60 * 1000); // Executar a cada 30 minutos

/**
 * Incrementa contadores de envio para uma instância
 * @param {string} instanceName Nome da instância
 * @returns {Object} Contadores atualizados
 */
const incrementCounters = (instanceName) => {
  const now = Date.now();
  const minute = Math.floor(now / (60 * 1000)) * 60 * 1000;
  const hour = Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;
  const day = Math.floor(now / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000;
  
  // Criar chaves
  const minuteKey = `${instanceName}:${minute}`;
  const hourKey = `${instanceName}:${hour}`;
  const dayKey = `${instanceName}:${day}`;
  
  // Incrementar contadores
  counters.minutely[minuteKey] = (counters.minutely[minuteKey] || 0) + 1;
  counters.hourly[hourKey] = (counters.hourly[hourKey] || 0) + 1;
  counters.daily[dayKey] = (counters.daily[dayKey] || 0) + 1;
  
  return {
    minute: counters.minutely[minuteKey],
    hour: counters.hourly[hourKey],
    day: counters.daily[dayKey]
  };
};

/**
 * Obtém contadores atuais para uma instância
 * @param {string} instanceName Nome da instância
 * @returns {Object} Contadores atuais
 */
const getCounters = (instanceName) => {
  const now = Date.now();
  const minute = Math.floor(now / (60 * 1000)) * 60 * 1000;
  const hour = Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;
  const day = Math.floor(now / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000;
  
  // Criar chaves
  const minuteKey = `${instanceName}:${minute}`;
  const hourKey = `${instanceName}:${hour}`;
  const dayKey = `${instanceName}:${day}`;
  
  return {
    minute: counters.minutely[minuteKey] || 0,
    hour: counters.hourly[hourKey] || 0,
    day: counters.daily[dayKey] || 0
  };
};

/**
 * Verifica se uma mensagem pode ser enviada respeitando os limites de taxa
 * @param {string} instanceName Nome da instância
 * @returns {Promise<Object>} Resultado da verificação
 */
const checkRateLimit = async (instanceName) => {
  try {
    // Obter limites da instância
    const instance = await Instance.findOne({ instanceName });
    if (!instance) {
      logger.error(`Instância não encontrada: ${instanceName}`);
      return {
        allowed: false,
        reason: 'Instância não encontrada'
      };
    }
    
    // Obter limites das configurações da instância
    const limits = {
      perMinute: instance.throttling?.perMinute || 20,
      perHour: instance.throttling?.perHour || 1000,
      perDay: 5000 // Limite diário fixo ou configurável
    };
    
    // Obter contadores atuais
    const current = getCounters(instanceName);
    
    // Verificar limites
    if (current.minute >= limits.perMinute) {
      return {
        allowed: false,
        reason: `Limite por minuto excedido (${current.minute}/${limits.perMinute})`,
        waitTime: 60 * 1000 // 60 segundos
      };
    }
    
    if (current.hour >= limits.perHour) {
      return {
        allowed: false,
        reason: `Limite por hora excedido (${current.hour}/${limits.perHour})`,
        waitTime: 10 * 60 * 1000 // 10 minutos
      };
    }
    
    if (current.day >= limits.perDay) {
      return {
        allowed: false,
        reason: `Limite diário excedido (${current.day}/${limits.perDay})`,
        waitTime: 60 * 60 * 1000 // 1 hora
      };
    }
    
    // Incrementar contadores e permitir envio
    const updated = incrementCounters(instanceName);
    
    return {
      allowed: true,
      counters: updated
    };
  } catch (error) {
    logger.error(`Erro ao verificar limite de taxa para ${instanceName}:`, error);
    
    // Em caso de erro, permitir o envio mas logar o problema
    return {
      allowed: true,
      warning: 'Erro ao verificar limites de taxa, permitindo envio'
    };
  }
};

/**
 * Calcula um intervalo aleatório entre mensagens baseado nas configurações da campanha
 * @param {Object} campaign Objeto da campanha
 * @returns {number} Intervalo em milissegundos
 */
const getRandomMessageInterval = (campaign) => {
  const defaultMin = 2000;
  const defaultMax = 5000;
  
  if (!campaign.antiSpam || !campaign.antiSpam.messageInterval) {
    return Math.floor(Math.random() * (defaultMax - defaultMin + 1)) + defaultMin;
  }
  
  const min = campaign.antiSpam.messageInterval.min || defaultMin;
  const max = campaign.antiSpam.messageInterval.max || defaultMax;
  
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Calcula uma pausa aleatória baseada nas configurações da campanha
 * @param {Object} campaign Objeto da campanha
 * @returns {number} Intervalo de pausa em milissegundos
 */
const getRandomPauseDuration = (campaign) => {
  const defaultMin = 15000;
  const defaultMax = 45000;
  
  if (!campaign.antiSpam || !campaign.antiSpam.pauseAfter) {
    return Math.floor(Math.random() * (defaultMax - defaultMin + 1)) + defaultMin;
  }
  
  const min = campaign.antiSpam.pauseAfter.duration?.min || defaultMin;
  const max = campaign.antiSpam.pauseAfter.duration?.max || defaultMax;
  
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Verifica se é hora de fazer uma pausa após N mensagens
 * @param {Object} campaign Objeto da campanha
 * @param {number} messageCount Contador atual de mensagens
 * @returns {boolean} Se deve fazer pausa
 */
const shouldPause = (campaign, messageCount) => {
  const defaultCount = 20;
  
  if (!campaign.antiSpam || !campaign.antiSpam.pauseAfter) {
    return messageCount > 0 && messageCount % defaultCount === 0;
  }
  
  const count = campaign.antiSpam.pauseAfter.count || defaultCount;
  return messageCount > 0 && messageCount % count === 0;
};

module.exports = {
  checkRateLimit,
  getCounters,
  incrementCounters,
  getRandomMessageInterval,
  getRandomPauseDuration,
  shouldPause
}; 