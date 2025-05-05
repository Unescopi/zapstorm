const { Instance } = require('../models');
const logger = require('../utils/logger');
const EvolutionApiService = require('../services/evolutionApiService');

// Obter todas as instâncias
exports.getInstances = async (req, res) => {
  try {
    const instances = await Instance.find().select('-apiKey');
    
    res.status(200).json({
      success: true,
      data: instances
    });
  } catch (error) {
    logger.error('Erro ao obter instâncias:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter instâncias',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Sincronizar instâncias da Evolution API
exports.syncFromEvolution = async (req, res) => {
  try {
    logger.info('Iniciando sincronização de instâncias da Evolution API');
    logger.info(`URL da Evolution API: ${process.env.EVOLUTION_API_URL}`);
    logger.info(`Token da Evolution API: ${process.env.EVOLUTION_API_TOKEN ? process.env.EVOLUTION_API_TOKEN.substring(0, 8) + '...' : 'Não configurado'}`);
    
    // Buscar instâncias da Evolution API
    const evolutionData = await EvolutionApiService.getAllInstances();
    
    logger.info(`Dados recebidos da Evolution API: ${JSON.stringify(evolutionData, null, 2)}`);
    
    if (!evolutionData || !evolutionData.instances || !Array.isArray(evolutionData.instances)) {
      logger.error('Resposta inválida da Evolution API:', evolutionData);
      return res.status(400).json({
        success: false,
        message: 'Não foi possível obter instâncias da Evolution API'
      });
    }
    
    const evolutionInstances = evolutionData.instances;
    let syncedCount = 0;
    
    logger.info(`Sincronizando ${evolutionInstances.length} instâncias da Evolution API`);
    console.log(`Sincronizando ${evolutionInstances.length} instâncias da Evolution API`);
    
    // Para cada instância na Evolution API
    for (const evolutionInstance of evolutionInstances) {
      logger.info(`Analisando instância: ${JSON.stringify(evolutionInstance, null, 2)}`);
      console.log(`Analisando instância: ${JSON.stringify(evolutionInstance, null, 2)}`);
      
      // Mapear os campos da API Evolution para o nosso modelo
      // A Evolution API v1 retorna um formato diferente da v2
      let instanceName, connectionState, owner, profileName, profilePictureUrl;
      
      // Formato Evolution API v2 (formato atual)
      instanceName = evolutionInstance.name;
      connectionState = evolutionInstance.connectionStatus || 'disconnected';
      owner = evolutionInstance.ownerJid || '';
      profileName = evolutionInstance.profileName || '';
      profilePictureUrl = evolutionInstance.profilePicUrl || '';
      
      logger.info(`Processando instância: ${instanceName}, estado: ${connectionState}`);
      console.log(`Processando instância: ${instanceName}, estado: ${connectionState}`);
      
      // Verificar se já existe no banco
      const existingInstance = await Instance.findOne({ instanceName });
      
      if (!existingInstance) {
        // Criar nova instância local com os dados da Evolution
        const newInstance = await Instance.create({
          instanceName,
          serverUrl: process.env.EVOLUTION_API_URL,
          apiKey: process.env.EVOLUTION_API_TOKEN,
          status: connectionState === 'open' ? 'connected' : 'disconnected',
          owner,
          profileName,
          profilePictureUrl,
          lastConnection: Date.now()
        });
        
        logger.info(`Nova instância criada: ${instanceName} (${newInstance._id})`);
        console.log(`Nova instância criada: ${instanceName} (${newInstance._id})`);
        syncedCount++;
      } else {
        // Atualizar instância existente
        await Instance.findByIdAndUpdate(
          existingInstance._id,
          {
            status: connectionState === 'open' ? 'connected' : 'disconnected',
            owner: owner || existingInstance.owner || '',
            profileName: profileName || existingInstance.profileName || '',
            profilePictureUrl: profilePictureUrl || existingInstance.profilePictureUrl || '',
            lastConnection: Date.now()
          }
        );
        
        logger.info(`Instância atualizada: ${instanceName} (${existingInstance._id})`);
        console.log(`Instância atualizada: ${instanceName} (${existingInstance._id})`);
        syncedCount++;
      }
    }
    
    logger.info(`Sincronização concluída: ${syncedCount} instâncias processadas`);
    console.log(`Sincronização concluída: ${syncedCount} instâncias processadas`);
    
    res.status(200).json({
      success: true,
      message: `${syncedCount} instâncias sincronizadas com sucesso`
    });
  } catch (error) {
    logger.error('Erro ao sincronizar instâncias:', error);
    console.error('Erro ao sincronizar instâncias:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao sincronizar instâncias da Evolution API',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obter uma instância específica
exports.getInstance = async (req, res) => {
  try {
    const instance = await Instance.findById(req.params.id).select('-apiKey');
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    res.status(200).json({
      success: true,
      data: instance
    });
  } catch (error) {
    logger.error('Erro ao obter instância:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter instância',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Criar nova instância
exports.createInstance = async (req, res) => {
  try {
    const { instanceName, serverUrl, apiKey } = req.body;
    
    // Verificar se a instância já existe
    const existingInstance = await Instance.findOne({ instanceName });
    if (existingInstance) {
      return res.status(400).json({
        success: false,
        message: 'Nome de instância já cadastrado'
      });
    }
    
    // Criar nova instância no sistema ZapStorm
    const instance = await Instance.create({
      instanceName,
      serverUrl,
      apiKey,
      status: 'disconnected'
    });
    
    // Criar instância na API Evolution
    try {
      const evolutionApi = new EvolutionApiService(serverUrl, apiKey);
      const response = await evolutionApi.createInstance(instanceName);
      
      if (response) {
        await Instance.findByIdAndUpdate(
          instance._id,
          { 
            instanceId: response.instanceId || response.instance?.instanceId,
            status: 'disconnected'
          }
        );
      }
    } catch (apiError) {
      logger.error(`Erro ao criar instância na API Evolution: ${apiError.message}`);
      // Continuar mesmo se a API falhar, permitindo configuração manual depois
    }
    
    res.status(201).json({
      success: true,
      data: {
        _id: instance._id,
        instanceName: instance.instanceName,
        serverUrl: instance.serverUrl,
        status: instance.status
      }
    });
  } catch (error) {
    logger.error('Erro ao criar instância:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar instância',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Atualizar instância
exports.updateInstance = async (req, res) => {
  try {
    const { serverUrl, apiKey, throttling } = req.body;
    
    // Atualizar instância
    const instance = await Instance.findByIdAndUpdate(
      req.params.id,
      { 
        serverUrl,
        apiKey,
        throttling,
        lastUpdated: Date.now()
      },
      { new: true, runValidators: true }
    ).select('-apiKey');
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    res.status(200).json({
      success: true,
      data: instance
    });
  } catch (error) {
    logger.error('Erro ao atualizar instância:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar instância',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Excluir instância
exports.deleteInstance = async (req, res) => {
  try {
    const instance = await Instance.findById(req.params.id);
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    // Tentar excluir a instância na API Evolution
    try {
      const evolutionApi = new EvolutionApiService(instance.serverUrl, instance.apiKey);
      await evolutionApi.deleteInstance(instance.instanceName);
    } catch (apiError) {
      logger.error(`Erro ao excluir instância na API Evolution: ${apiError.message}`);
      // Continuar mesmo se a API falhar
    }
    
    // Excluir do banco de dados
    await Instance.findByIdAndDelete(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'Instância excluída com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao excluir instância:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao excluir instância',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Conectar instância (gerar QR Code)
exports.connectInstance = async (req, res) => {
  try {
    const instance = await Instance.findById(req.params.id);
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    // Atualizar status
    await Instance.findByIdAndUpdate(
      req.params.id,
      { status: 'connecting' }
    );
    
    // Chamar API Evolution para gerar QR Code
    try {
      const evolutionApi = new EvolutionApiService(instance.serverUrl, instance.apiKey);
      const response = await evolutionApi.connectInstance(instance.instanceName);
      
      res.status(200).json({
        success: true,
        data: response
      });
    } catch (apiError) {
      logger.error(`Erro ao conectar instância na API Evolution: ${apiError.message}`);
      
      // Atualizar status para falha
      await Instance.findByIdAndUpdate(
        req.params.id,
        { status: 'failed' }
      );
      
      return res.status(500).json({
        success: false,
        message: 'Erro ao conectar instância na API Evolution',
        error: apiError.message
      });
    }
  } catch (error) {
    logger.error('Erro ao conectar instância:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao conectar instância',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verificar estado da conexão
exports.connectionState = async (req, res) => {
  try {
    const instance = await Instance.findById(req.params.id);
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    // Chamar API Evolution para verificar estado
    try {
      const evolutionApi = new EvolutionApiService(instance.serverUrl, instance.apiKey);
      const response = await evolutionApi.connectionState(instance.instanceName);
      
      // Atualizar estado da instância no banco
      const connectionState = response.instance.state;
      let status = 'disconnected';
      
      if (connectionState === 'open') {
        status = 'connected';
      } else if (connectionState === 'connecting') {
        status = 'connecting';
      }
      
      // Atualizar informações do perfil se conectado
      if (status === 'connected' && response.instance.owner) {
        await Instance.findByIdAndUpdate(
          req.params.id,
          { 
            status,
            owner: response.instance.owner,
            profileName: response.instance.profileName,
            profilePictureUrl: response.instance.profilePictureUrl,
            profileStatus: response.instance.profileStatus,
            lastConnection: Date.now()
          }
        );
      } else {
        await Instance.findByIdAndUpdate(
          req.params.id,
          { status }
        );
      }
      
      res.status(200).json({
        success: true,
        data: response
      });
    } catch (apiError) {
      logger.error(`Erro ao verificar estado da instância na API Evolution: ${apiError.message}`);
      
      // Definir status como falha
      await Instance.findByIdAndUpdate(
        req.params.id,
        { status: 'failed' }
      );
      
      return res.status(500).json({
        success: false,
        message: 'Erro ao verificar estado da instância na API Evolution',
        error: apiError.message
      });
    }
  } catch (error) {
    logger.error('Erro ao verificar estado da instância:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar estado da instância',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Desconectar instância
exports.logoutInstance = async (req, res) => {
  try {
    const instance = await Instance.findById(req.params.id);
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    // Chamar API Evolution para desconectar
    try {
      const evolutionApi = new EvolutionApiService(instance.serverUrl, instance.apiKey);
      const response = await evolutionApi.logoutInstance(instance.instanceName);
      
      // Atualizar status no banco
      await Instance.findByIdAndUpdate(
        req.params.id,
        { status: 'disconnected' }
      );
      
      res.status(200).json({
        success: true,
        data: response
      });
    } catch (apiError) {
      logger.error(`Erro ao desconectar instância na API Evolution: ${apiError.message}`);
      return res.status(500).json({
        success: false,
        message: 'Erro ao desconectar instância na API Evolution',
        error: apiError.message
      });
    }
  } catch (error) {
    logger.error('Erro ao desconectar instância:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao desconectar instância',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Reiniciar instância
exports.restartInstance = async (req, res) => {
  try {
    const instance = await Instance.findById(req.params.id);
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    // Chamar API Evolution para reiniciar
    try {
      const evolutionApi = new EvolutionApiService(instance.serverUrl, instance.apiKey);
      const response = await evolutionApi.restartInstance(instance.instanceName);
      
      // Atualizar status no banco
      await Instance.findByIdAndUpdate(
        req.params.id,
        { status: 'connecting' }
      );
      
      res.status(200).json({
        success: true,
        data: response
      });
    } catch (apiError) {
      logger.error(`Erro ao reiniciar instância na API Evolution: ${apiError.message}`);
      return res.status(500).json({
        success: false,
        message: 'Erro ao reiniciar instância na API Evolution',
        error: apiError.message
      });
    }
  } catch (error) {
    logger.error('Erro ao reiniciar instância:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao reiniciar instância',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Configurar webhook para uma instância
exports.configureWebhook = async (req, res) => {
  try {
    const instance = await Instance.findById(req.params.id);
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    const { webhookUrl, webhookByEvents, webhookBase64, events } = req.body;
    
    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        message: 'URL do webhook é obrigatória'
      });
    }
    
    try {
      // Importar serviço de webhook
      const webhookService = require('../services/webhookService');
      
      // Chamar o serviço para configurar o webhook
      const response = await webhookService.configureWebhook(
        instance.instanceName,
        instance.serverUrl,
        instance.apiKey,
        webhookUrl,
        webhookByEvents || false,
        webhookBase64 || false,
        events || []
      );
      
      logger.info(`Webhook configurado com sucesso para instância ${instance.instanceName}`);
      
      res.status(200).json({
        success: true,
        message: 'Webhook configurado com sucesso',
        data: response
      });
    } catch (apiError) {
      logger.error(`Erro ao configurar webhook para instância ${instance.instanceName}:`, apiError);
      
      return res.status(500).json({
        success: false,
        message: 'Erro ao configurar webhook',
        error: apiError.message
      });
    }
  } catch (error) {
    logger.error('Erro ao configurar webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao configurar webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Remover webhook de uma instância
exports.removeWebhook = async (req, res) => {
  try {
    const instance = await Instance.findById(req.params.id);
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    try {
      // Importar serviço de webhook
      const webhookService = require('../services/webhookService');
      
      // Chamar o serviço para remover o webhook
      const response = await webhookService.removeWebhook(
        instance.instanceName,
        instance.serverUrl,
        instance.apiKey
      );
      
      logger.info(`Webhook removido com sucesso para instância ${instance.instanceName}`);
      
      res.status(200).json({
        success: true,
        message: 'Webhook removido com sucesso',
        data: response
      });
    } catch (apiError) {
      logger.error(`Erro ao remover webhook para instância ${instance.instanceName}:`, apiError);
      
      return res.status(500).json({
        success: false,
        message: 'Erro ao remover webhook',
        error: apiError.message
      });
    }
  } catch (error) {
    logger.error('Erro ao remover webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verificar status do webhook
exports.getWebhookStatus = async (req, res) => {
  try {
    const instance = await Instance.findById(req.params.id);
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    try {
      // Importar serviço de webhook
      const webhookService = require('../services/webhookService');
      
      // Chamar o serviço para verificar o webhook
      const webhookDetails = await webhookService.getWebhookDetails(
        instance.instanceName,
        instance.serverUrl,
        instance.apiKey
      );
      
      logger.info(`Detalhes do webhook obtidos com sucesso para instância ${instance.instanceName}`);
      
      res.status(200).json({
        success: true,
        data: webhookDetails
      });
    } catch (apiError) {
      logger.error(`Erro ao obter detalhes do webhook para instância ${instance.instanceName}:`, apiError);
      
      return res.status(500).json({
        success: false,
        message: 'Erro ao obter detalhes do webhook',
        error: apiError.message
      });
    }
  } catch (error) {
    logger.error('Erro ao obter detalhes do webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter detalhes do webhook',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 