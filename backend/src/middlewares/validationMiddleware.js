const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Middleware para validação de dados de entrada
 * Este middleware verifica os resultados das validações aplicadas nas rotas
 * e retorna os erros encontrados
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn(`Erro de validação: ${JSON.stringify(errors.array())}`);
    return res.status(400).json({
      success: false,
      message: 'Erro de validação dos dados de entrada',
      errors: errors.array()
    });
  }
  next();
};

// Validações comuns para reutilização
const contactValidations = {
  phone: {
    notEmpty: { 
      errorMessage: 'Número de telefone é obrigatório'
    },
    matches: {
      options: /^\+[1-9]\d{1,14}$/,
      errorMessage: 'Formato de telefone inválido. Use o formato internacional (+XXXXXXXXXXXX)'
    }
  },
  name: {
    optional: true,
    isString: { 
      errorMessage: 'Nome deve ser um texto'
    }
  }
};

const templateValidations = {
  name: {
    notEmpty: { 
      errorMessage: 'Nome do template é obrigatório'
    },
    isString: { 
      errorMessage: 'Nome deve ser um texto'
    }
  },
  content: {
    notEmpty: { 
      errorMessage: 'Conteúdo da mensagem é obrigatório'
    },
    isString: { 
      errorMessage: 'Conteúdo deve ser um texto'
    }
  }
};

const instanceValidations = {
  instanceName: {
    notEmpty: { 
      errorMessage: 'Nome da instância é obrigatório'
    },
    isString: { 
      errorMessage: 'Nome deve ser um texto'
    }
  },
  serverUrl: {
    notEmpty: { 
      errorMessage: 'URL do servidor é obrigatória'
    },
    isURL: { 
      errorMessage: 'URL do servidor inválida'
    }
  },
  apiKey: {
    notEmpty: { 
      errorMessage: 'Chave da API é obrigatória'
    }
  }
};

module.exports = {
  validate,
  contactValidations,
  templateValidations,
  instanceValidations
}; 