const { Settings } = require('../models');
const logger = require('../utils/logger');

/**
 * Retorna as configurações do sistema
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    // Não enviar a chave de API da Evolution para o frontend por segurança
    const safeSettings = settings.toObject();
    if (safeSettings.evolutionApiKey) {
      safeSettings.evolutionApiKey = '********';
    }
    
    res.json({
      success: true,
      data: safeSettings
    });
  } catch (error) {
    logger.error('Erro ao buscar configurações do sistema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar configurações do sistema',
      error: error.message
    });
  }
};

/**
 * Atualiza as configurações do sistema
 */
exports.updateSettings = async (req, res) => {
  try {
    const settingsData = req.body;
    const userId = req.user.id;
    
    // Validar campos obrigatórios
    if (!settingsData.evolutionApiUrl) {
      return res.status(400).json({
        success: false,
        message: 'A URL da API Evolution é obrigatória'
      });
    }
    
    // Atualizar configurações
    const updatedSettings = await Settings.updateSettings(settingsData, userId);
    
    // Não enviar a chave de API da Evolution para o frontend por segurança
    const safeSettings = updatedSettings.toObject();
    if (safeSettings.evolutionApiKey) {
      safeSettings.evolutionApiKey = '********';
    }
    
    res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso',
      data: safeSettings
    });
  } catch (error) {
    logger.error('Erro ao atualizar configurações do sistema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar configurações do sistema',
      error: error.message
    });
  }
}; 