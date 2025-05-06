const { Campaign, Template, Contact, Message, Instance } = require('../models');
const logger = require('../utils/logger');
const queueService = require('../services/queueService');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

// Obter todas as campanhas com paginação e filtros
exports.getCampaigns = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const status = req.query.status || '';
    
    // Construir query com filtros
    const query = {};
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    if (status) {
      query.status = status;
    }
    
    // Contagem total para paginação
    const total = await Campaign.countDocuments(query);
    
    // Buscar campanhas com paginação
    const campaigns = await Campaign.find(query)
      .populate('templateId', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    
    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: campaigns
    });
  } catch (error) {
    logger.error('Erro ao obter campanhas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter campanhas',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obter uma campanha específica
exports.getCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate('templateId')
      .populate('contacts', 'phone name');
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }
    
    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    logger.error('Erro ao obter campanha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter campanha',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Criar nova campanha
exports.createCampaign = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const {
      name,
      templateId,
      instanceId,
      schedule,
      contactFilter,
      contacts,
      variables,
      messageVariants,
      useMessageVariants,
      antiSpam
    } = req.body;
    
    // Validar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    // Validar template
    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template não encontrado'
      });
    }
    
    // Converter variáveis recebidas para o formato Map
    const variableValues = new Map();
    if (variables && typeof variables === 'object') {
      Object.keys(variables).forEach(key => {
        variableValues.set(key, variables[key]);
      });
    }
    
    // Criar campanha com valores padrão para métricas
    const campaign = new Campaign({
      name,
      templateId,
      instanceId,
      schedule: schedule || { type: 'immediate' },
      contactFilter,
      contacts,
      variableValues,
      createdBy: req.user.id,
      messageVariants: messageVariants || [],
      useMessageVariants: useMessageVariants || false,
      antiSpam: antiSpam || {
        sendTyping: true,
        typingTime: 3000,
        messageInterval: {
          min: 2000,
          max: 5000
        },
        pauseAfter: {
          count: 20,
          duration: {
            min: 15000,
            max: 45000
          }
        },
        distributeDelivery: true,
        randomizeContent: false
      }
    });
    
    // Se for uma campanha imediata, iniciar execução
    if (schedule && schedule.type === 'immediate') {
      campaign.status = 'queued';
    } else {
      campaign.status = 'draft';
    }
    
    // Salvar campanha
    await campaign.save();
    
    // Gerar variantes automáticas se habilitado e não fornecidas manualmente
    if (campaign.useMessageVariants && (!campaign.messageVariants || campaign.messageVariants.length === 0)) {
      // Importar o serviço de variação de mensagens
      const messageVariationService = require('../services/messageVariationService');
      
      // Gerar variantes baseadas no template
      const templateText = template.content;
      const generatedVariants = messageVariationService.createVariations(templateText, 5);
      
      // Atualizar campanha com as variantes geradas
      campaign.messageVariants = generatedVariants;
      await campaign.save();
      
      logger.info(`Variantes automáticas geradas para campanha ${campaign._id}`);
    }
    
    res.status(201).json({
      success: true,
      data: campaign
    });
    
    // Se for imediata, iniciar processamento sem aguardar resposta
    if (schedule && schedule.type === 'immediate') {
      try {
        await this.startCampaign({ params: { id: campaign._id } }, { status: () => ({ json: () => {} }) });
        logger.info(`Campanha imediata ${campaign._id} iniciada automaticamente`);
      } catch (startError) {
        logger.error(`Erro ao iniciar campanha imediata ${campaign._id}:`, startError);
      }
    }
  } catch (error) {
    logger.error('Erro ao criar campanha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar campanha',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Atualizar campanha
exports.updateCampaign = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const {
      name,
      templateId,
      instanceId,
      schedule,
      contactFilter,
      contacts,
      variables,
      messageVariants,
      useMessageVariants, 
      antiSpam
    } = req.body;
    
    // Verificar se campanha existe
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }
    
    // Verificar se campanha pode ser atualizada
    if (['running', 'completed'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: 'Campanha em execução ou completa não pode ser alterada'
      });
    }
    
    // Atualizar variáveis
    const variableValues = new Map();
    if (variables && typeof variables === 'object') {
      Object.keys(variables).forEach(key => {
        variableValues.set(key, variables[key]);
      });
    }
    
    // Montar objeto de atualização
    const updateData = {
      name: name || campaign.name,
      templateId: templateId || campaign.templateId,
      instanceId: instanceId || campaign.instanceId,
      schedule: schedule || campaign.schedule,
      contactFilter: contactFilter || campaign.contactFilter,
      variableValues,
      lastUpdated: Date.now()
    };
    
    // Atualizar contatos se fornecidos
    if (contacts) {
      updateData.contacts = contacts;
    }
    
    // Atualizar configurações de variantes de mensagem
    if (typeof useMessageVariants === 'boolean') {
      updateData.useMessageVariants = useMessageVariants;
    }
    
    if (messageVariants && Array.isArray(messageVariants)) {
      updateData.messageVariants = messageVariants;
    }
    
    // Atualizar configurações anti-spam
    if (antiSpam) {
      updateData.antiSpam = {
        ...campaign.antiSpam,
        ...antiSpam
      };
    }
    
    // Atualizar campanha
    const updatedCampaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    // Gerar variantes automáticas se habilitado e não fornecidas
    if (updatedCampaign.useMessageVariants && 
        (!updatedCampaign.messageVariants || updatedCampaign.messageVariants.length === 0)) {
      // Importar o serviço de variação de mensagens
      const messageVariationService = require('../services/messageVariationService');
      
      // Buscar template
      const template = await Template.findById(updatedCampaign.templateId);
      if (template) {
        // Gerar variantes baseadas no template
        const templateText = template.content;
        const generatedVariants = messageVariationService.createVariations(templateText, 5);
        
        // Atualizar campanha com as variantes geradas
        updatedCampaign.messageVariants = generatedVariants;
        await updatedCampaign.save();
        
        logger.info(`Variantes automáticas geradas para campanha ${updatedCampaign._id}`);
      }
    }
    
    res.status(200).json({
      success: true,
      data: updatedCampaign
    });
  } catch (error) {
    logger.error('Erro ao atualizar campanha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar campanha',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Excluir campanha
exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }
    
    // Verificar se a campanha pode ser excluída
    if (campaign.status === 'running') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível excluir uma campanha em execução'
      });
    }
    
    // Excluir mensagens associadas à campanha
    await Message.deleteMany({ campaignId: campaign._id });
    
    // Excluir campanha
    await Campaign.findByIdAndDelete(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'Campanha excluída com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao excluir campanha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao excluir campanha',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Função auxiliar para verificar e garantir que haja contatos selecionados
const verificarContatos = async (req, res, next) => {
  try {
    // Verificar se o ID da campanha está presente
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da campanha não fornecido'
      });
    }
    
    // Buscar a campanha
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }
    
    // Verificar contatos diretos
    if (campaign.contacts && campaign.contacts.length > 0) {
      const contatos = await Contact.countDocuments({
        _id: { $in: campaign.contacts }
      });
      
      if (contatos === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum contato válido encontrado entre os selecionados'
        });
      }
      
      // Se temos contatos, podemos prosseguir
      req.campaign = campaign;
      return next();
    }
    
    // Verificar filtro de contatos
    if (campaign.contactFilter && Object.keys(campaign.contactFilter).length > 0) {
      const contatos = await Contact.countDocuments(campaign.contactFilter);
      
      if (contatos === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum contato corresponde aos critérios do filtro'
        });
      }
      
      // Se temos contatos via filtro, podemos prosseguir
      req.campaign = campaign;
      return next();
    }
    
    // Se chegamos aqui, não há contatos ou filtro
    return res.status(400).json({
      success: false,
      message: 'Nenhum contato selecionado para a campanha. Edite a campanha para adicionar contatos.'
    });
  } catch (error) {
    console.error('Erro ao verificar contatos:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao verificar contatos da campanha',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Iniciar campanha
exports.startCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }
    
    // Verificar se a campanha já está em execução
    if (campaign.status === 'running') {
      return res.status(400).json({
        success: false,
        message: 'Campanha já está em execução'
      });
    }
    
    // Verificar se a campanha já foi concluída
    if (campaign.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Campanha já foi concluída'
      });
    }
    
    console.log(`Tipo da instanceId: ${typeof campaign.instanceId}, Valor: ${campaign.instanceId}`);
    logger.info(`Tipo da instanceId: ${typeof campaign.instanceId}, Valor: ${campaign.instanceId}`);
    
    // Verificar se é um ObjectId válido
    const isValidObjectId = mongoose.Types.ObjectId.isValid(campaign.instanceId);
    console.log(`É um ObjectId válido? ${isValidObjectId}`);
    logger.info(`É um ObjectId válido? ${isValidObjectId}`);

    // Buscar template
    const template = await Template.findById(campaign.templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template não encontrado'
      });
    }
    
    // Buscar contatos
    const contacts = await Contact.find({ _id: { $in: campaign.contacts } });
    if (contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum contato encontrado para esta campanha'
      });
    }
    
    // Tentativa de buscar instância
    console.log(`Buscando instância: ${campaign.instanceId}`);
    logger.info(`Buscando instância: ${campaign.instanceId}`);
    
    let instance = null;
    
    // Primeiro tentamos buscar pelo ID
    if (isValidObjectId) {
      instance = await Instance.findById(campaign.instanceId);
      console.log(`Busca por ObjectId: ${instance ? 'Encontrado' : 'Não encontrado'}`);
      logger.info(`Busca por ObjectId: ${instance ? 'Encontrado' : 'Não encontrado'}`);
    }
    
    // Se não for encontrado e for uma string, pode ser que seja o nome da instância
    if (!instance && typeof campaign.instanceId === 'string') {
      instance = await Instance.findOne({ instanceName: campaign.instanceId });
      console.log(`Busca por instanceName: ${instance ? 'Encontrado' : 'Não encontrado'}`);
      logger.info(`Busca por instanceName: ${instance ? 'Encontrado' : 'Não encontrado'}`);
      
      // Se encontrou pelo nome, atualiza o ID na campanha para o futuro
      if (instance) {
        console.log(`Atualizando campanha com o ObjectId correto: ${instance._id}`);
        logger.info(`Atualizando campanha com o ObjectId correto: ${instance._id}`);
        
        await Campaign.findByIdAndUpdate(
          campaign._id,
          { instanceId: instance._id }
        );
      }
    }
    
    // Verificar se a instância foi encontrada
    if (!instance) {
      return res.status(400).json({
        success: false,
        message: 'Instância associada não encontrada'
      });
    }
    
    // Verificar se a instância está conectada
    if (instance.status !== 'connected') {
      return res.status(400).json({
        success: false,
        message: 'Instância não está conectada'
      });
    }
    
    logger.info(`Criando ${contacts.length} mensagens para a campanha ${campaign.name}`);
    console.log(`Criando ${contacts.length} mensagens para a campanha ${campaign.name}`);
    
    // Criar mensagens para cada contato
    const messages = [];
    const variableValues = campaign.variableValues || {};
    
    for (const contact of contacts) {
      // Criar conteúdo personalizado substituindo variáveis
      let content = template.content;
      
      // Substituir variáveis no template
      if (template.variables && template.variables.length > 0) {
        for (const variable of template.variables) {
          const value = variableValues[variable] || '';
          const regex = new RegExp(`\\{\\{${variable}\\}\\}`, 'g');
          content = content.replace(regex, value);
        }
      }
      
      // Substituir nome do contato se existir
      if (contact.name) {
        content = content.replace(/\{\{nome\}\}/g, contact.name);
      }
      
      // Criar mensagem
      const message = new Message({
        campaignId: campaign._id,
        contactId: contact._id,
        status: 'pending',
        content,
        mediaUrl: template.mediaUrl,
        mediaType: template.mediaType === 'none' ? null : template.mediaType,
        instanceId: instance._id,
        retries: 0
      });
      
      // Log para debug
      if (template.mediaUrl && template.mediaType && template.mediaType !== 'none') {
        console.log(`Mensagem de mídia criada: tipo=${template.mediaType}, url=${template.mediaUrl}`);
        logger.info(`Mensagem de mídia criada: tipo=${template.mediaType}, url=${template.mediaUrl}`);
      } else {
        console.log(`Mensagem de texto criada: ${content.substring(0, 50)}...`);
        logger.info(`Mensagem de texto criada`);
      }
      
      messages.push(message);
    }
    
    // Salvar mensagens no banco em lotes para evitar sobrecarga
    const batchSize = 100;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      await Message.insertMany(batch);
    }
    
    // Atualizar métricas da campanha
    await Campaign.findByIdAndUpdate(
      campaign._id,
      {
        status: campaign.schedule.type === 'immediate' ? 'running' : 'queued',
        'metrics.total': contacts.length,
        'metrics.pending': contacts.length,
        lastUpdated: Date.now()
      }
    );
    
    // Enfileirar mensagens para envio imediato ou agendar
    if (campaign.schedule.type === 'immediate') {
      logger.info(`Enfileirando ${messages.length} mensagens para envio imediato`);
      console.log(`Enfileirando ${messages.length} mensagens para envio imediato`);
      
      // Enfileirar em lotes para não sobrecarregar
      let enfileiradas = 0;
      let falhas = 0;
      
      try {
        // Verificar canal e conexão
        if (!queueService.channel || !queueService.connection) {
          logger.error('Erro: RabbitMQ não está conectado');
          console.error('Erro: RabbitMQ não está conectado');
          await queueService.connect();
        }
        
        // Enfileirar mensagens em lotes menores
        const batchSize = 10; // Reduzir tamanho do lote 
        for (let i = 0; i < messages.length; i += batchSize) {
          const batch = messages.slice(i, Math.min(i + batchSize, messages.length));
          
          for (const message of batch) {
            try {
              const resultado = await queueService.enqueueMessage(message);
              if (resultado) {
                enfileiradas++;
              } else {
                falhas++;
                logger.error(`Falha ao enfileirar mensagem ${i+1}/${messages.length}`);
              }
            } catch (queueError) {
              falhas++;
              logger.error(`Erro ao enfileirar mensagem ${i+1}/${messages.length}:`, queueError);
              console.error(`Erro ao enfileirar mensagem ${i+1}/${messages.length}:`, queueError.message);
            }
          }
          
          // Pequena pausa entre lotes para evitar sobrecarga
          if (i + batchSize < messages.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } catch (error) {
        logger.error('Erro ao processar lote de mensagens:', error);
        console.error('Erro ao processar lote de mensagens:', error.message);
      }
      
      logger.info(`Total de mensagens enfileiradas: ${enfileiradas}, falhas: ${falhas}`);
      console.log(`Total de mensagens enfileiradas: ${enfileiradas}, falhas: ${falhas}`);
      
      // Se todas as mensagens falharam, retornar erro
      if (enfileiradas === 0 && messages.length > 0) {
        return res.status(500).json({
          success: false,
          message: 'Não foi possível enfileirar nenhuma mensagem. Serviço de fila indisponível.'
        });
      }
    }
    
    logger.info(`Campanha ${campaign.name} iniciada com sucesso`);
    console.log(`Campanha ${campaign.name} iniciada com sucesso`);
    
    res.status(200).json({
      success: true,
      message: campaign.schedule.type === 'immediate' ? 
        'Campanha iniciada com sucesso' : 
        'Campanha agendada com sucesso',
      data: {
        totalMessages: contacts.length
      }
    });
  } catch (error) {
    logger.error('Erro ao iniciar campanha:', error);
    console.error('Erro ao iniciar campanha:', error.message);
    
    // Log detalhado para diagnóstico
    if (error.name === 'ValidationError') {
      logger.error('Erro de validação:', JSON.stringify(error.errors));
      console.error('Erro de validação:', JSON.stringify(error.errors));
    }
    
    if (error.name === 'CastError') {
      logger.error('Erro de tipo:', error.path, error.value);
      console.error('Erro de tipo:', error.path, error.value);
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro ao iniciar campanha',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Pausar campanha
exports.pauseCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }
    
    // Verificar se a campanha está em execução
    if (campaign.status !== 'running') {
      return res.status(400).json({
        success: false,
        message: 'Somente campanhas em execução podem ser pausadas'
      });
    }
    
    // Pausar campanha
    await Campaign.findByIdAndUpdate(
      req.params.id,
      {
        status: 'paused',
        lastUpdated: Date.now()
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Campanha pausada com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao pausar campanha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao pausar campanha',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Retomar campanha
exports.resumeCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }
    
    // Verificar se a campanha está pausada
    if (campaign.status !== 'paused') {
      return res.status(400).json({
        success: false,
        message: 'Somente campanhas pausadas podem ser retomadas'
      });
    }
    
    // Retomar campanha
    await Campaign.findByIdAndUpdate(
      req.params.id,
      {
        status: 'running',
        lastUpdated: Date.now()
      }
    );
    
    // Buscar mensagens pendentes
    const pendingMessages = await Message.find({
      campaignId: campaign._id,
      status: 'pending'
    });
    
    // Enfileirar mensagens pendentes
    for (const message of pendingMessages) {
      await queueService.enqueueMessage(message);
    }
    
    res.status(200).json({
      success: true,
      message: 'Campanha retomada com sucesso',
      data: {
        pendingMessages: pendingMessages.length
      }
    });
  } catch (error) {
    logger.error('Erro ao retomar campanha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao retomar campanha',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Cancelar campanha
exports.cancelCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }
    
    // Verificar se a campanha pode ser cancelada
    if (campaign.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Campanha já foi concluída'
      });
    }
    
    if (campaign.status === 'canceled') {
      return res.status(400).json({
        success: false,
        message: 'Campanha já foi cancelada'
      });
    }
    
    // Cancelar campanha
    await Campaign.findByIdAndUpdate(
      req.params.id,
      {
        status: 'canceled',
        lastUpdated: Date.now()
      }
    );
    
    // Atualizar status das mensagens pendentes
    await Message.updateMany(
      {
        campaignId: campaign._id,
        status: 'pending'
      },
      {
        status: 'canceled',
        errorDetails: 'Campanha cancelada pelo usuário'
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Campanha cancelada com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao cancelar campanha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao cancelar campanha',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obter relatório da campanha
exports.getCampaignReport = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate('templateId', 'name');
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }
    
    // Buscar métricas detalhadas por status
    const messagesByStatus = await Message.aggregate([
      { $match: { campaignId: mongoose.Types.ObjectId(campaign._id) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Formatar resultado
    const statusCounts = {};
    messagesByStatus.forEach(item => {
      statusCounts[item._id] = item.count;
    });
    
    // Calcular taxa de entrega e leitura
    const total = campaign.metrics.total || 0;
    const deliveryRate = total > 0 ? ((statusCounts.sent || 0) / total) * 100 : 0;
    const readRate = statusCounts.sent > 0 ? ((statusCounts.read || 0) / statusCounts.sent) * 100 : 0;
    
    res.status(200).json({
      success: true,
      data: {
        campaign: {
          id: campaign._id,
          name: campaign.name,
          status: campaign.status,
          template: campaign.templateId ? campaign.templateId.name : 'N/A',
          createdAt: campaign.createdAt,
          startedAt: campaign.startedAt,
          completedAt: campaign.completedAt
        },
        metrics: {
          total,
          pending: statusCounts.pending || 0,
          sent: statusCounts.sent || 0,
          delivered: statusCounts.delivered || 0,
          read: statusCounts.read || 0,
          failed: statusCounts.failed || 0,
          canceled: statusCounts.canceled || 0,
          deliveryRate: deliveryRate.toFixed(2),
          readRate: readRate.toFixed(2)
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao obter relatório da campanha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter relatório da campanha',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Reenvia mensagens com falha de uma campanha
 */
exports.resendFailedMessages = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar a campanha
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }
    
    // Verificar se a campanha está em um estado válido para reenvio
    if (!['running', 'paused', 'completed', 'failed'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: 'Esta campanha não pode ter mensagens reenviadas no momento'
      });
    }
    
    // Buscar mensagens com falha
    const failedMessages = await Message.find({
      campaignId: id,
      status: 'failed'
    });
    
    if (failedMessages.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Não há mensagens com falha para reenviar'
      });
    }
    
    // Atualizar status das mensagens e enfileirar para reenvio
    let reenqueuedCount = 0;
    
    for (const message of failedMessages) {
      // Resetar status e contadores de tentativas
      await Message.findByIdAndUpdate(message._id, {
        status: 'pending',
        retries: 0,
        errorDetails: null,
        scheduledRetryAt: null
      });
      
      // Enfileirar para reenvio
      await queueService.enqueueMessage(message);
      reenqueuedCount++;
    }
    
    // Atualizar status da campanha se estiver falha ou completa
    if (['failed', 'completed'].includes(campaign.status)) {
      await Campaign.findByIdAndUpdate(id, {
        status: 'running',
        'metrics.pending': reenqueuedCount,
        'metrics.failed': campaign.metrics.failed - reenqueuedCount
      });
    } else {
      // Apenas atualizar contadores se campanha já estiver em andamento
      await Campaign.findByIdAndUpdate(id, {
        $inc: {
          'metrics.pending': reenqueuedCount,
          'metrics.failed': -reenqueuedCount
        }
      });
    }
    
    res.json({
      success: true,
      message: `${reenqueuedCount} mensagens reenviadas com sucesso`
    });
  } catch (error) {
    logger.error(`Erro ao reenviar mensagens da campanha ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Erro ao reenviar mensagens',
      error: error.message
    });
  }
};

/**
 * Reenvia uma mensagem específica que falhou
 */
exports.resendMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    // Buscar a mensagem
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Mensagem não encontrada'
      });
    }
    
    // Verificar se a mensagem está com falha
    if (message.status !== 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Apenas mensagens com falha podem ser reenviadas'
      });
    }
    
    // Resetar status e contadores
    await Message.findByIdAndUpdate(messageId, {
      status: 'pending',
      retries: 0,
      errorDetails: null,
      scheduledRetryAt: null
    });
    
    // Enfileirar para reenvio
    await queueService.enqueueMessage(message);
    
    // Atualizar métricas da campanha
    await Campaign.findByIdAndUpdate(message.campaignId, {
      $inc: {
        'metrics.pending': 1,
        'metrics.failed': -1
      }
    });
    
    res.json({
      success: true,
      message: 'Mensagem reenviada com sucesso'
    });
  } catch (error) {
    logger.error(`Erro ao reenviar mensagem ${req.params.messageId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Erro ao reenviar mensagem',
      error: error.message
    });
  }
};

// Exportar a função verificarContatos
exports.verificarContatos = verificarContatos;

// Função simples para verificar permissões (substitui a necessidade do módulo permissions)
const checkPermission = (permission) => {
  return (req, res, next) => {
    // Como não temos um módulo de permissões, apenas deixamos passar
    next();
  };
}; 