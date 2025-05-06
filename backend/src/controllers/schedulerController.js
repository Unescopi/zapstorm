// Inicializar campanha a partir do agendamento
exports.executeCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const campaign = await Campaign.findById(campaignId);
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
    
    // Verificar se a campanha está agendada
    if (!['queued', 'draft'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: 'Campanha não está no estado adequado para execução'
      });
    }
    
    // Atualizar status da campanha
    campaign.status = 'running';
    await campaign.save();
    
    // Buscar contatos para a campanha
    let contacts = [];
    
    if (campaign.contacts && campaign.contacts.length > 0) {
      // Buscar contatos específicos
      contacts = await Contact.find({ _id: { $in: campaign.contacts } });
    } else if (campaign.contactFilter && Object.keys(campaign.contactFilter).length > 0) {
      // Aplicar filtro
      contacts = await Contact.find(campaign.contactFilter);
    }
    
    if (!contacts || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum contato encontrado para esta campanha'
      });
    }
    
    // Buscar template
    const template = await Template.findById(campaign.templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template não encontrado'
      });
    }
    
    // Buscar instância
    const instance = await Instance.findById(campaign.instanceId);
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Instância não encontrada'
      });
    }
    
    // Criar mensagens para cada contato
    const messages = [];
    
    // Usar o messageVariationService para variações se habilitado
    let messageVariationService = null;
    if (campaign.useMessageVariants || (campaign.antiSpam && campaign.antiSpam.randomizeContent)) {
      messageVariationService = require('../services/messageVariationService');
    }
    
    for (const contact of contacts) {
      // Preparar conteúdo da mensagem - com variáveis ou variantes
      let content = template.content;
      
      // Aplicar variáveis específicas do contato
      content = replaceTemplateVariables(content, contact, campaign.variableValues);
      
      // Usar uma variante aleatória se habilitado, ou gerar uma variação única para anti-spam
      if (campaign.useMessageVariants && campaign.messageVariants && campaign.messageVariants.length > 0) {
        // Selecionar uma variante aleatória
        const randomIndex = Math.floor(Math.random() * campaign.messageVariants.length);
        content = campaign.messageVariants[randomIndex];
        
        // Aplicar variáveis também na variante
        content = replaceTemplateVariables(content, contact, campaign.variableValues);
      } else if (campaign.antiSpam && campaign.antiSpam.randomizeContent && messageVariationService) {
        // Criar uma variação única para cada mensagem
        content = messageVariationService.createUniqueTemplate(content);
      }
      
      // Criar mensagem
      const message = new Message({
        campaignId: campaign._id,
        contactId: contact._id,
        content,
        status: 'pending',
        instanceId: campaign.instanceId
      });
      
      messages.push(message);
    }
    
    // Salvar mensagens no banco
    await Message.insertMany(messages);
    
    // Atualizar métricas da campanha
    campaign.metrics.total = contacts.length;
    campaign.metrics.pending = contacts.length;
    await campaign.save();
    
    // Enfileirar mensagens para envio com configurações anti-spam
    const queueService = require('../services/queueService');
    
    // Verificar se deve usar distribuição para evitar detecção de spam
    if (campaign.antiSpam && campaign.antiSpam.distributeDelivery) {
      // Usar o método de enfileiramento com distribuição
      await queueService.enqueueMessageBatchWithDistribution(messages, {
        campaign,
        batchSize: instance.throttling?.perBatch || 20,
        distributeDelivery: true,
        // Distribuir ao longo de 15 minutos a 1 hora, dependendo do tamanho
        distributionTimeMs: Math.min(60 * 60 * 1000, messages.length * 100)
      });
      
      logger.info(`Campanha ${campaign._id} iniciada com ${contacts.length} mensagens usando distribuição anti-spam`);
    } else {
      // Usar o método de enfileiramento em lote padrão
      await queueService.enqueueMessageBatch(messages, {
        batchSize: instance.throttling?.perBatch || 50,
        delay: instance.throttling?.batchDelay || 5000
      });
      
      logger.info(`Campanha ${campaign._id} iniciada com ${contacts.length} mensagens`);
    }
    
    res.status(200).json({
      success: true,
      message: `Campanha iniciada com ${contacts.length} mensagens`,
      data: {
        campaignId: campaign._id,
        total: contacts.length,
        status: campaign.status
      }
    });
  } catch (error) {
    logger.error('Erro ao executar campanha agendada:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao executar campanha agendada',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Função auxiliar para substituir variáveis no template
function replaceTemplateVariables(template, contact, variableValues) {
  let content = template;
  
  // Substituir variáveis específicas do contato
  if (contact) {
    content = content.replace(/{{nome}}/g, contact.name || '');
    content = content.replace(/{{telefone}}/g, contact.phone || '');
    
    // Substituir outros campos do contato
    if (contact.email) content = content.replace(/{{email}}/g, contact.email);
    if (contact.company) content = content.replace(/{{empresa}}/g, contact.company);
    
    // Substituir campos personalizados
    if (contact.customFields && typeof contact.customFields === 'object') {
      Object.keys(contact.customFields).forEach(key => {
        const value = contact.customFields[key] || '';
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });
    }
  }
  
  // Substituir variáveis globais da campanha
  if (variableValues && variableValues instanceof Map) {
    variableValues.forEach((value, key) => {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    });
  }
  
  return content;
} 