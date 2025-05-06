/**
 * Serviço para criar variações de mensagens
 * Ajuda a evitar detecção de spam por mensagens idênticas
 */

const logger = require('../utils/logger');

// Variações para início de mensagens
const GREETINGS = [
  'Olá', 
  'Oi', 
  'E aí', 
  'Opa', 
  'Oii', 
  'Bom dia', 
  'Boa tarde', 
  'Boa noite', 
  'Hey'
];

// Variações para pontuação
const PUNCTUATION = [
  '!',
  '!!',
  '.',
  '...',
  ' :)',
  ' :D',
  ' 👍',
  ' ✨',
  ''
];

// Variações para frases de transição
const TRANSITIONS = [
  'Estou entrando em contato para', 
  'Gostaria de',
  'Passando aqui para', 
  'Vim aqui para',
  'Queria'
];

// Caracteres invisíveis para inserir pequenas diferenças nas mensagens
const INVISIBLE_CHARS = [
  '\u200B', // Zero width space
  '\u200C', // Zero width non-joiner
  '\u200D', // Zero width joiner
  '\u2060'  // Word joiner
];

/**
 * Cria uma variação de uma mensagem original
 * @param {string} originalMessage Mensagem original
 * @param {Object} options Opções de variação
 * @returns {string} Mensagem variada
 */
const createVariation = (originalMessage, options = {}) => {
  if (!originalMessage || typeof originalMessage !== 'string' || originalMessage.trim() === '') {
    return originalMessage;
  }
  
  try {
    let message = originalMessage;
    
    // Se a mensagem começar com uma saudação, possivelmente trocar
    if (Math.random() < 0.5) {
      for (const greeting of GREETINGS) {
        if (message.startsWith(greeting)) {
          const randomGreeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
          message = message.replace(greeting, randomGreeting);
          break;
        }
      }
    }
    
    // Possivelmente adicionar/remover espaços extras
    if (Math.random() < 0.3) {
      message = message.replace(/\s{2,}/g, ' '); // Remover espaços extras
    } else if (Math.random() < 0.2) {
      // Adicionar espaço extra em algum lugar
      const words = message.split(' ');
      if (words.length > 2) {
        const position = Math.floor(Math.random() * (words.length - 1)) + 1;
        words[position] = ' ' + words[position];
        message = words.join(' ');
      }
    }
    
    // Possivelmente alterar a pontuação final
    if (message.endsWith('.') || message.endsWith('!')) {
      if (Math.random() < 0.4) {
        message = message.slice(0, -1) + PUNCTUATION[Math.floor(Math.random() * PUNCTUATION.length)];
      }
    } else if (Math.random() < 0.3) {
      // Adicionar pontuação se não tiver
      message += PUNCTUATION[Math.floor(Math.random() * PUNCTUATION.length)];
    }
    
    // Adicionar caractere invisível para tornar mensagem única, mas mantendo aparência idêntica
    // Isso é especialmente útil quando precisamos manter o texto exato mas evitar duplicação
    if (options.addInvisibleChar !== false) {
      const invisibleChar = INVISIBLE_CHARS[Math.floor(Math.random() * INVISIBLE_CHARS.length)];
      const position = Math.floor(Math.random() * message.length);
      message = message.slice(0, position) + invisibleChar + message.slice(position);
    }
    
    return message;
  } catch (error) {
    logger.error('Erro ao criar variação de mensagem:', error);
    // Em caso de erro, retornar mensagem original
    return originalMessage;
  }
};

/**
 * Gera uma versão alternativa da mensagem com pequenas diferenças
 * @param {string} text Texto base
 * @param {Object} options Opções de variação
 * @returns {string} Texto com variações
 */
const generateAlternativeMessage = (text, options = {}) => {
  // Dividir a mensagem em parágrafos
  const paragraphs = text.split(/\n\s*\n/);
  
  // Aplicar variações em cada parágrafo
  const variedParagraphs = paragraphs.map(paragraph => {
    // Se for um parágrafo muito curto, apenas adicionar caractere invisível
    if (paragraph.length < 20) {
      return createVariation(paragraph, { minimal: true });
    }
    
    // Para parágrafos maiores, fazer variações mais significativas
    return createVariation(paragraph, options);
  });
  
  return variedParagraphs.join('\n\n');
};

/**
 * Cria variações de template inserindo caracteres invisíveis
 * Ideal para garantir que a mensagem pareça idêntica, mas seja única
 * @param {string} template Template com ou sem variáveis
 * @returns {string} Template com caracteres invisíveis
 */
const createUniqueTemplate = (template) => {
  if (!template) return template;
  
  // Adicionar caracteres invisíveis em locais estratégicos
  let result = template;
  
  // Adicionar 1-3 caracteres invisíveis distribuídos pelo texto
  const count = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const invisibleChar = INVISIBLE_CHARS[Math.floor(Math.random() * INVISIBLE_CHARS.length)];
    const position = Math.floor(Math.random() * result.length);
    result = result.slice(0, position) + invisibleChar + result.slice(position);
  }
  
  return result;
};

/**
 * Cria um conjunto de variações de uma mensagem
 * @param {string} baseMessage Mensagem base
 * @param {number} count Número de variações a serem criadas
 * @returns {string[]} Array de variações
 */
const createVariations = (baseMessage, count = 5) => {
  const variations = [];
  
  // Sempre incluir a mensagem original
  variations.push(baseMessage);
  
  // Adicionar variações
  for (let i = 1; i < count; i++) {
    variations.push(generateAlternativeMessage(baseMessage));
  }
  
  return variations;
};

module.exports = {
  createVariation,
  generateAlternativeMessage,
  createUniqueTemplate,
  createVariations
}; 