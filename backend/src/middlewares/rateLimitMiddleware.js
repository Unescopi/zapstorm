const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Middleware para limitar taxa de requisições à API
 */

// Limiter padrão para todas as rotas da API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300, // Limite de 300 requisições por IP por janela
  standardHeaders: true,
  legacyHeaders: false,
  // Configuração customizada para trust proxy
  trustProxy: true,
  // Gerador de chave personalizado para tratar diferentes configurações de proxy
  keyGenerator: (req) => {
    // Usar IP "real" quando por trás de um proxy
    return req.ip || req.connection.remoteAddress;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit excedido para IP ${req.ip}`);
    return res.status(429).json({
      success: false,
      message: 'Muitas requisições deste IP, por favor tente novamente mais tarde.'
    });
  }
});

// Limiter específico para rotas de autenticação
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20, // Limite de 20 tentativas de login por IP por hora
  standardHeaders: true,
  legacyHeaders: false,
  // Configuração customizada para trust proxy
  trustProxy: true,
  // Gerador de chave personalizado para tratar diferentes configurações de proxy
  keyGenerator: (req) => {
    // Usar IP "real" quando por trás de um proxy
    return req.ip || req.connection.remoteAddress;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit de autenticação excedido para IP ${req.ip}`);
    return res.status(429).json({
      success: false,
      message: 'Muitas tentativas de login. Por favor, tente novamente mais tarde.'
    });
  }
});

// Limiter para webhooks
const webhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 500, // Limite de 500 webhooks por minuto
  standardHeaders: true,
  legacyHeaders: false,
  // Configuração customizada para trust proxy
  trustProxy: true,
  // Gerador de chave personalizado para tratar diferentes configurações de proxy
  keyGenerator: (req) => {
    // Para webhooks, podemos limitar por instância em vez de IP
    const instanceName = req.body?.instanceName || 'unknown';
    return `webhook:${instanceName}`;
  },
  handler: (req, res) => {
    const instanceName = req.body?.instanceName || 'unknown';
    logger.warn(`Rate limit de webhook excedido para instância ${instanceName}`);
    
    // Ainda retornamos 200 para não fazer a API externa reenviar
    return res.status(200).json({
      success: false,
      message: 'Muitos webhooks recebidos. Alguns podem ser ignorados.'
    });
  },
  skipFailedRequests: true // não contar requisições que resultam em erro
});

module.exports = {
  apiLimiter,
  authLimiter,
  webhookRateLimit
};