const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    // Log para depuração
    logger.info(`Verificando autenticação para ${req.method} ${req.originalUrl}`);
    logger.info(`Headers disponíveis: ${JSON.stringify(Object.keys(req.headers))}`);
    
    // Verificar se o token existe no header (verifica ambos os formatos de cabeçalho)
    let authHeader = req.headers.Authorization || req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn(`Acesso não autorizado para ${req.method} ${req.originalUrl}. Token não fornecido ou formato inválido.`);
      return res.status(401).json({
        success: false,
        message: 'Acesso não autorizado. Token não fornecido'
      });
    }

    // Extrair o token
    const token = authHeader.split(' ')[1];
    logger.info(`Token recebido para autenticação (primeiros 10 caracteres): ${token.substring(0, 10)}...`);

    // Verificar e decodificar o token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sua_chave_secreta');
    logger.info(`Token verificado com sucesso para usuário ID: ${decoded.id}`);

    // Buscar usuário no banco
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado ou token inválido'
      });
    }

    // Verificar se o usuário está ativo
    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: 'Usuário desativado'
      });
    }

    // Adicionar o usuário ao objeto req
    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erro de autenticação',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Middleware para verificar permissões de admin
const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  
  return res.status(403).json({
    success: false,
    message: 'Acesso restrito ao administrador'
  });
};

module.exports = {
  authMiddleware,
  adminMiddleware
}; 