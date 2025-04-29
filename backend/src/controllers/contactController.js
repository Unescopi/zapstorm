const { Contact } = require('../models');
const logger = require('../utils/logger');
const csv = require('csv-parser');
const fs = require('fs');

// Obter todos os contatos com paginação e filtros
exports.getContacts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const tag = req.query.tag || '';
    
    // Construir query com filtros
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (tag) {
      query.tags = tag;
    }
    
    // Contagem total para paginação
    const total = await Contact.countDocuments(query);
    
    // Buscar contatos com paginação
    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    
    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: contacts
    });
  } catch (error) {
    logger.error('Erro ao obter contatos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter contatos',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obter um contato específico
exports.getContact = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contato não encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    logger.error('Erro ao obter contato:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter contato',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Criar novo contato
exports.createContact = async (req, res) => {
  try {
    const { phone, name, tags } = req.body;
    
    // Verificar se o telefone já existe
    const existingContact = await Contact.findOne({ phone });
    if (existingContact) {
      return res.status(400).json({
        success: false,
        message: 'Telefone já cadastrado'
      });
    }
    
    // Criar novo contato
    const contact = await Contact.create({
      phone,
      name,
      tags: tags || []
    });
    
    res.status(201).json({
      success: true,
      data: contact
    });
  } catch (error) {
    logger.error('Erro ao criar contato:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar contato',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Atualizar contato
exports.updateContact = async (req, res) => {
  try {
    const { phone, name, tags } = req.body;
    
    // Verificar se o telefone já existe em outro contato
    if (phone) {
      const existingContact = await Contact.findOne({ 
        phone, 
        _id: { $ne: req.params.id } 
      });
      
      if (existingContact) {
        return res.status(400).json({
          success: false,
          message: 'Telefone já cadastrado em outro contato'
        });
      }
    }
    
    // Buscar e atualizar contato
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { 
        phone,
        name,
        tags,
        lastUpdated: Date.now()
      },
      { new: true, runValidators: true }
    );
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contato não encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    logger.error('Erro ao atualizar contato:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar contato',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Excluir contato
exports.deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contato não encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Contato excluído com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao excluir contato:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao excluir contato',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Importar contatos de CSV
exports.importCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo enviado'
      });
    }
    
    const results = [];
    const errors = [];
    let imported = 0;
    let duplicates = 0;
    
    // Processar arquivo CSV
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', async (data) => {
        // Verificar se os campos necessários existem
        const phone = data.phone || data.telefone || data.celular;
        const name = data.name || data.nome;
        
        if (!phone) {
          errors.push({
            row: results.length + 1,
            message: 'Telefone não encontrado na linha'
          });
          return;
        }
        
        try {
          // Verificar se o contato já existe
          const existingContact = await Contact.findOne({ phone });
          
          if (existingContact) {
            duplicates++;
            return;
          }
          
          // Adicionar à lista de resultados
          results.push({
            phone,
            name: name || '',
            tags: req.body.tags ? req.body.tags.split(',') : []
          });
        } catch (error) {
          errors.push({
            row: results.length + 1,
            message: error.message
          });
        }
      })
      .on('end', async () => {
        // Inserir contatos em lote
        if (results.length > 0) {
          try {
            await Contact.insertMany(results);
            imported = results.length;
          } catch (error) {
            logger.error('Erro ao inserir contatos em lote:', error);
            return res.status(500).json({
              success: false,
              message: 'Erro ao importar contatos',
              error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
          }
        }
        
        // Remover arquivo temporário
        fs.unlinkSync(req.file.path);
        
        res.status(200).json({
          success: true,
          message: `Importação concluída. ${imported} contatos importados, ${duplicates} duplicados ignorados, ${errors.length} erros.`,
          data: {
            imported,
            duplicates,
            errors
          }
        });
      });
  } catch (error) {
    // Remover arquivo temporário se existir
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    
    logger.error('Erro ao importar contatos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao importar contatos',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Obter todas as tags distintas
exports.getTags = async (req, res) => {
  try {
    const tags = await Contact.distinct('tags');
    
    res.status(200).json({
      success: true,
      data: tags
    });
  } catch (error) {
    logger.error('Erro ao obter tags:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter tags',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 