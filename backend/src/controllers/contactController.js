const { Contact } = require('../models');
const logger = require('../utils/logger');
const csv = require('csv-parser');
const fs = require('fs');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');

// Função para normalizar telefone sem o 9 para comparação
function getNormalizedPhoneForComparison(phone) {
  // Remove todos os caracteres não numéricos, inclusive o +
  const digitsOnly = phone.replace(/\D/g, '');
  
  // Para números brasileiros, faremos uma normalização especial
  if (digitsOnly.startsWith('55')) {
    const ddd = digitsOnly.substring(2, 4);
    
    // Tentaremos extrair os últimos 8 dígitos do número para comparação
    // para lidar com variações de formatação e número de dígitos
    if (digitsOnly.length >= 10) { // Pelo menos DDD + 8 dígitos
      // Extrair os últimos 8 dígitos (número base sem o 9)
      const last8Digits = digitsOnly.substring(digitsOnly.length - 8);
      // Normalizar como 55 + DDD + últimos 8 dígitos
      return '55' + ddd + last8Digits;
    }
  }
  
  return digitsOnly;
}

// Função utilitária para normalizar telefone
const normalizePhone = (phone) => {
  // Remove todos os caracteres não numéricos, exceto o sinal de +
  let normalizedPhone = phone.replace(/\s+/g, '').replace(/-/g, '').replace(/\(/g, '').replace(/\)/g, '');
  
  // Garantir formato internacional
  if (!normalizedPhone.startsWith('+')) {
    // Se começar apenas com números, presumir Brasil +55
    if (/^\d+$/.test(normalizedPhone)) {
      normalizedPhone = '+55' + normalizedPhone;
    }
  }
  
  // Garantir formato consistente
  return '+' + normalizedPhone.replace(/^\+/, '').replace(/\D/g, '');
};

// Obter todos os contatos com paginação e filtros
exports.getContacts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const tag = req.query.tag || '';
    
    // Parâmetros de ordenação
    const sortField = req.query.sortField || 'name'; // campo padrão é nome
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1; // asc (crescente, 1) ou desc (decrescente, -1)
    
    // Mapear campos de ordenação permitidos
    const allowedSortFields = {
      'name': 'name',
      'phone': 'phone',
      'createdAt': 'createdAt',
      'lastUpdated': 'lastUpdated'
    };
    
    // Verificar se o campo de ordenação é válido
    const actualSortField = allowedSortFields[sortField] || 'name';
    
    // Construir objeto de ordenação
    const sort = {};
    sort[actualSortField] = sortOrder;
    
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
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);
    
    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      sortField: actualSortField,
      sortOrder: sortOrder === 1 ? 'asc' : 'desc',
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
    
    // Normalizar número do telefone
    const normalizedPhone = normalizePhone(phone);
    
    // Verificar se o telefone já existe (usando método estático)
    const existingContact = await Contact.phoneExists(normalizedPhone);
    if (existingContact) {
      return res.status(400).json({
        success: false,
        message: 'Telefone já cadastrado'
      });
    }
    
    // Calcular phoneNormalized para comparação
    const phoneNormalized = getNormalizedPhoneForComparison(normalizedPhone);
    
    // Criar novo contato
    const contact = await Contact.create({
      phone: normalizedPhone,
      phoneNormalized: phoneNormalized,
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
    
    let normalizedPhone;
    let phoneNormalized;
    
    // Verificar se o telefone já existe em outro contato
    if (phone) {
      normalizedPhone = normalizePhone(phone);
      phoneNormalized = getNormalizedPhoneForComparison(normalizedPhone);
      
      const existingContact = await Contact.findOne({ 
        phone: normalizedPhone, 
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
        phone: normalizedPhone,
        phoneNormalized: phoneNormalized,
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

// Excluir múltiplos contatos
exports.deleteMultipleContacts = async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Lista de IDs inválida'
      });
    }
    
    const result = await Contact.deleteMany({ _id: { $in: ids } });
    
    res.status(200).json({
      success: true,
      message: `${result.deletedCount} contatos excluídos com sucesso`
    });
  } catch (error) {
    logger.error('Erro ao excluir múltiplos contatos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao excluir contatos',
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
          // Normalizar o telefone
          const normalizedPhone = normalizePhone(phone);
          
          // Verificar se o contato já existe
          const existingContact = await Contact.phoneExists(normalizedPhone);
          
          if (existingContact) {
            duplicates++;
            return;
          }
          
          // Calcular phoneNormalized para comparação
          const phoneNormalized = getNormalizedPhoneForComparison(normalizedPhone);
          
          // Adicionar à lista de resultados
          results.push({
            phone: normalizedPhone,
            phoneNormalized: phoneNormalized,
            name: name || '',
            tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : []
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

// Exportar contatos para CSV
exports.exportCSV = async (req, res) => {
  try {
    const { search, tag, sortField, sortOrder } = req.query;
    
    // Parâmetros de ordenação
    const orderDirection = sortOrder === 'desc' ? -1 : 1; // asc (crescente, 1) ou desc (decrescente, -1)
    
    // Mapear campos de ordenação permitidos
    const allowedSortFields = {
      'name': 'name',
      'phone': 'phone',
      'createdAt': 'createdAt',
      'lastUpdated': 'lastUpdated'
    };
    
    // Verificar se o campo de ordenação é válido
    const actualSortField = allowedSortFields[sortField] || 'name';
    
    // Construir objeto de ordenação
    const sort = {};
    sort[actualSortField] = orderDirection;
    
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
    
    // Buscar todos os contatos que correspondem aos filtros
    const contacts = await Contact.find(query).sort(sort);
    
    if (contacts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum contato encontrado para exportar'
      });
    }
    
    // Criar diretório de exportação se não existir
    const exportDir = path.join(__dirname, '../../exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    // Gerar nome de arquivo único
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `contatos_${timestamp}.csv`;
    const filepath = path.join(exportDir, filename);
    
    // Configurar escritor CSV
    const csvWriter = createObjectCsvWriter({
      path: filepath,
      header: [
        { id: 'name', title: 'Nome' },
        { id: 'phone', title: 'Telefone' },
        { id: 'tags', title: 'Tags' },
        { id: 'createdAt', title: 'Data de Criação' }
      ]
    });
    
    // Formatar dados para CSV
    const records = contacts.map(contact => ({
      name: contact.name || '',
      phone: contact.phone || '',
      tags: contact.tags ? contact.tags.join(', ') : '',
      createdAt: new Date(contact.createdAt).toLocaleString('pt-BR')
    }));
    
    // Escrever arquivo CSV
    await csvWriter.writeRecords(records);
    
    // Enviar arquivo como resposta
    res.download(filepath, filename, (err) => {
      if (err) {
        logger.error('Erro ao enviar arquivo CSV:', err);
        return res.status(500).json({
          success: false,
          message: 'Erro ao baixar o arquivo CSV',
          error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
      // Remover arquivo após download
      fs.unlinkSync(filepath);
    });
  } catch (error) {
    logger.error('Erro ao exportar contatos para CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao exportar contatos',
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

// Função para encontrar e remover contatos duplicados
exports.findAndRemoveDuplicates = async (req, res) => {
  try {
    // Buscar todos os contatos
    const allContacts = await Contact.find({}).lean();
    
    // Arrays para acompanhar duplicados
    const duplicatesFound = {};
    const processedPhones = {};
    let totalDuplicates = 0;
    
    // Função para extrair apenas os dígitos de um número
    const extractDigits = (phone) => phone.replace(/\D/g, '');
    
    // Para cada contato, verificar se é duplicado de algum outro
    for (let i = 0; i < allContacts.length; i++) {
      const contact = allContacts[i];
      const phoneDigits = extractDigits(contact.phone);
      
      // Ignorar telefones muito curtos (menos de 5 dígitos)
      if (phoneDigits.length < 5) continue;
      
      // Pegar os últimos 8 dígitos (parte significativa do número)
      const lastDigits = phoneDigits.slice(-8);
      
      // Se já processamos este número, adicionar à lista de duplicados
      if (processedPhones[lastDigits]) {
        if (!duplicatesFound[lastDigits]) {
          duplicatesFound[lastDigits] = [processedPhones[lastDigits]];
          totalDuplicates++;
        }
        duplicatesFound[lastDigits].push(contact);
        totalDuplicates++;
      } else {
        // Registrar o primeiro contato com estes últimos dígitos
        processedPhones[lastDigits] = contact;
      }
    }
    
    // Verificar se encontramos duplicados
    if (Object.keys(duplicatesFound).length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Não foram encontrados contatos com números duplicados',
        data: {
          duplicatesFound: 0
        }
      });
    }
    
    // Modo de visualização (sem remoção)
    if (req.query.dryRun === 'true') {
      return res.status(200).json({
        success: true,
        message: `Encontrados ${Object.keys(duplicatesFound).length} números com duplicatas (${totalDuplicates} contatos duplicados)`,
        data: {
          duplicatesFound: Object.keys(duplicatesFound).length,
          totalDuplicates,
          duplicates: duplicatesFound
        }
      });
    }
    
    // Array para armazenar IDs a serem removidos
    const idsToRemove = [];
    
    // Para cada grupo de duplicados, manter apenas o mais antigo
    Object.values(duplicatesFound).forEach(contacts => {
      // Ordenar por data de criação (do mais antigo para o mais recente)
      const sortedContacts = [...contacts].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      // Manter o primeiro (mais antigo) e remover os demais
      for (let i = 1; i < sortedContacts.length; i++) {
        idsToRemove.push(sortedContacts[i]._id);
      }
    });
    
    // Remover contatos duplicados
    const result = await Contact.deleteMany({ _id: { $in: idsToRemove } });
    
    res.status(200).json({
      success: true,
      message: `Foram removidos ${result.deletedCount} contatos duplicados`,
      data: {
        duplicatesFound: Object.keys(duplicatesFound).length,
        removed: result.deletedCount
      }
    });
  } catch (error) {
    logger.error('Erro ao encontrar e remover duplicados:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao encontrar e remover duplicados',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 