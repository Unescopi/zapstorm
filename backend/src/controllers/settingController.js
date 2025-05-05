const { Setting } = require('../models');
const logger = require('../utils/logger');
const axios = require('axios');

/**
 * Obter configurações do sistema
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await Setting.findOneOrCreate();

    return res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Erro ao obter configurações:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao obter configurações',
      error: error.message
    });
  }
};

/**
 * Atualizar configurações do sistema
 */
exports.updateSettings = async (req, res) => {
  try {
    const settings = await Setting.findOneOrCreate();
    const updateData = req.body;

    // Atualizar propriedades
    Object.keys(updateData).forEach(key => {
      // Verificar se a propriedade existe no modelo antes de atualizar
      if (key in settings.schema.paths) {
        settings[key] = updateData[key];
      }
    });

    // Manipular campos aninhados especiais como webhookSettings
    if (updateData.webhookSettings) {
      settings.webhookSettings = {
        ...settings.webhookSettings,
        ...updateData.webhookSettings
      };
    }

    settings.lastUpdated = Date.now();
    await settings.save();

    // Se o webhook estiver habilitado e a URL estiver definida, 
    // configura o webhook no Evolution API para cada instância
    if (settings.webhookEnabled && settings.webhookUrl) {
      try {
        await configureEvolutionWebhook(settings);
      } catch (webhookError) {
        logger.error('Erro ao configurar webhook no Evolution API:', webhookError);
        // Continuamos mesmo com erro para retornar as configurações salvas
      }
    }

    return res.json({
      success: true,
      data: settings,
      message: 'Configurações atualizadas com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao atualizar configurações:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar configurações',
      error: error.message
    });
  }
};

/**
 * Configurar webhook no Evolution API para cada instância
 */
async function configureEvolutionWebhook(settings) {
  try {
    // Verificar se temos as credenciais necessárias
    if (!settings.evolutionApiUrl || !settings.evolutionApiKey) {
      throw new Error('URL da API ou chave da API não configuradas');
    }

    // Obter a lista de instâncias
    const { Instance } = require('../models');
    const instances = await Instance.find({ status: 'connected' });

    logger.info(`Configurando webhook para ${instances.length} instâncias conectadas`);

    // Criar cliente axios para comunicação com a Evolution API
    const api = axios.create({
      baseURL: settings.evolutionApiUrl,
      headers: {
        'Content-Type': 'application/json',
        'apikey': settings.evolutionApiKey
      },
      timeout: 30000
    });

    // Preparar payload de webhook
    const webhookPayload = {
      enabled: true,
      url: settings.webhookUrl,
      webhook_by_events: settings.webhookSettings?.webhook_by_events || false,
      webhook_base64: settings.webhookSettings?.webhook_base64 || false,
      events: settings.webhookSettings?.events?.length > 0 
        ? settings.webhookSettings.events 
        : settings.webhookSettings?.defaultEvents || [
            'QRCODE_UPDATED',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'MESSAGES_DELETE',
            'SEND_MESSAGE',
            'CONNECTION_UPDATE'
          ]
    };

    logger.info(`Payload de webhook a ser enviado: ${JSON.stringify(webhookPayload)}`);

    // Configurar webhook para cada instância
    for (const instance of instances) {
      try {
        const response = await api.post(`/webhook/set/${instance.instanceName}`, webhookPayload);
        
        logger.info(`Webhook configurado para instância ${instance.instanceName}`);
        logger.info(`Resposta: ${JSON.stringify(response.data)}`);
      } catch (instanceError) {
        logger.error(`Erro ao configurar webhook para instância ${instance.instanceName}:`, instanceError);
        // Continuar para próxima instância mesmo com erro
      }
    }
  } catch (error) {
    logger.error('Erro ao configurar webhooks:', error);
    throw error;
  }
}

/**
 * Obter status dos webhooks configurados
 */
exports.getWebhookStatus = async (req, res) => {
  try {
    const settings = await Setting.findOneOrCreate();

    // Verificar se temos as credenciais necessárias
    if (!settings.evolutionApiUrl || !settings.evolutionApiKey) {
      return res.status(400).json({
        success: false,
        message: 'URL da API ou chave da API não configuradas'
      });
    }

    // Obter a lista de instâncias
    const { Instance } = require('../models');
    const instances = await Instance.find();

    // Criar cliente axios para comunicação com a Evolution API
    const api = axios.create({
      baseURL: settings.evolutionApiUrl,
      headers: {
        'Content-Type': 'application/json',
        'apikey': settings.evolutionApiKey
      },
      timeout: 30000
    });

    // Obter status dos webhooks para cada instância
    const webhookStatus = [];
    
    for (const instance of instances) {
      try {
        const response = await api.get(`/webhook/find/${instance.instanceName}`);
        
        webhookStatus.push({
          instanceName: instance.instanceName,
          status: response.data,
          error: null
        });
      } catch (instanceError) {
        webhookStatus.push({
          instanceName: instance.instanceName,
          status: null,
          error: instanceError.message
        });
      }
    }

    return res.json({
      success: true,
      data: webhookStatus
    });
  } catch (error) {
    logger.error('Erro ao obter status dos webhooks:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao obter status dos webhooks',
      error: error.message
    });
  }
}; 