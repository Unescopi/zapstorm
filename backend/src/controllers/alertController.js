const { Alert } = require('../models');
const logger = require('../utils/logger');
const alertService = require('../services/alertService');

/**
 * Retorna a lista de alertas com filtros
 */
exports.getAlerts = async (req, res) => {
  try {
    const { 
      type, 
      level, 
      isRead, 
      page = 1, 
      limit = 20,
      sort = 'createdAt'
    } = req.query;
    
    // Construir o filtro com base nos parâmetros
    const filter = {};
    
    if (type) filter.type = type;
    if (level) filter.level = level;
    if (isRead !== undefined) filter.isRead = isRead === 'true';
    
    // Ordenação
    const sortDirection = sort.startsWith('-') ? -1 : 1;
    const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
    
    // Calcular paginação
    const skip = (page - 1) * limit;
    
    // Buscar alertas
    const alerts = await Alert.find(filter)
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(Number(limit));
    
    // Contar total de resultados para paginação
    const total = await Alert.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao buscar alertas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar alertas',
      error: error.message
    });
  }
};

/**
 * Retorna os detalhes de um alerta específico
 */
exports.getAlert = async (req, res) => {
  try {
    const { id } = req.params;
    
    const alert = await Alert.findById(id);
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alerta não encontrado'
      });
    }
    
    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    logger.error(`Erro ao buscar alerta ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar alerta',
      error: error.message
    });
  }
};

/**
 * Marca um alerta como lido
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const alert = await Alert.findById(id);
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alerta não encontrado'
      });
    }
    
    await alertService.markAsRead(id);
    
    res.json({
      success: true,
      message: 'Alerta marcado como lido'
    });
  } catch (error) {
    logger.error(`Erro ao marcar alerta ${req.params.id} como lido:`, error);
    res.status(500).json({
      success: false,
      message: 'Erro ao marcar alerta como lido',
      error: error.message
    });
  }
};

/**
 * Marca todos os alertas como lidos
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const filter = {};
    
    // Filtros opcionais
    if (req.query.type) filter.type = req.query.type;
    if (req.query.level) filter.level = req.query.level;
    
    // Atualizar todos os alertas não lidos que correspondem ao filtro
    const result = await Alert.updateMany(
      { ...filter, isRead: false },
      { $set: { isRead: true } }
    );
    
    res.json({
      success: true,
      message: `${result.modifiedCount} alertas marcados como lidos`
    });
  } catch (error) {
    logger.error('Erro ao marcar todos alertas como lidos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao marcar alertas como lidos',
      error: error.message
    });
  }
};

/**
 * Retorna um resumo dos alertas não lidos
 */
exports.getUnreadSummary = async (req, res) => {
  try {
    // Contar total de alertas não lidos
    const total = await Alert.countDocuments({ isRead: false });
    
    // Contar por nível de criticidade
    const critical = await Alert.countDocuments({ isRead: false, level: 'critical' });
    const warning = await Alert.countDocuments({ isRead: false, level: 'warning' });
    const info = await Alert.countDocuments({ isRead: false, level: 'info' });
    
    // Buscar os últimos 5 alertas não lidos
    const recentAlerts = await Alert.find({ isRead: false })
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.json({
      success: true,
      data: {
        total,
        byLevel: {
          critical,
          warning,
          info
        },
        recentAlerts
      }
    });
  } catch (error) {
    logger.error('Erro ao buscar resumo de alertas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar resumo de alertas',
      error: error.message
    });
  }
}; 