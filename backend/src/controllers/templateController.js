const { Template } = require('../models');
const logger = require('../utils/logger');

// Obter todos os templates com paginação e filtros
exports.getTemplates = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    
    // Construir query com filtros
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Contagem total para paginação
    const total = await Template.countDocuments(query);
    
    // Buscar templates com paginação
    const templates = await Template.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    
    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: templates
    });
  } catch (error) {
    logger.error('Erro ao obter templates:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter templates',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obter um template específico
exports.getTemplate = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template não encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('Erro ao obter template:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Criar novo template
exports.createTemplate = async (req, res) => {
  try {
    const { name, content, mediaUrl, mediaType } = req.body;
    
    // Verificar se o nome já existe
    const existingTemplate = await Template.findOne({ name });
    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        message: 'Nome de template já cadastrado'
      });
    }
    
    // Criar novo template
    const template = await Template.create({
      name,
      content,
      mediaUrl,
      mediaType: mediaType || 'none'
    });
    
    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('Erro ao criar template:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Atualizar template
exports.updateTemplate = async (req, res) => {
  try {
    const { name, content, mediaUrl, mediaType } = req.body;
    
    // Verificar se o nome já existe em outro template
    if (name) {
      const existingTemplate = await Template.findOne({ 
        name, 
        _id: { $ne: req.params.id } 
      });
      
      if (existingTemplate) {
        return res.status(400).json({
          success: false,
          message: 'Nome de template já cadastrado em outro template'
        });
      }
    }
    
    // Buscar e atualizar template
    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { 
        name,
        content,
        mediaUrl,
        mediaType,
        lastUpdated: Date.now()
      },
      { new: true, runValidators: true }
    );
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template não encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('Erro ao atualizar template:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Excluir template
exports.deleteTemplate = async (req, res) => {
  try {
    const template = await Template.findByIdAndDelete(req.params.id);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template não encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Template excluído com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao excluir template:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao excluir template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Pré-visualizar template com variáveis preenchidas
exports.previewTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;
    
    // Obter o template
    const template = await Template.findById(id);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template não encontrado'
      });
    }
    
    // Substituir variáveis no conteúdo
    let previewContent = template.content;
    
    if (variables && typeof variables === 'object') {
      Object.keys(variables).forEach(key => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        previewContent = previewContent.replace(regex, variables[key]);
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        preview: previewContent,
        original: template.content,
        mediaUrl: template.mediaUrl,
        mediaType: template.mediaType,
        variables: template.variables
      }
    });
  } catch (error) {
    logger.error('Erro ao pré-visualizar template:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao pré-visualizar template',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 