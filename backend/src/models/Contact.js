const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: [true, 'Número de telefone é obrigatório'],
    trim: true,
    unique: true,
    validate: {
      validator: function(v) {
        // Validação formato internacional: +55DDDNNNNNNNNN
        return /^\+[1-9]\d{1,14}$/.test(v);
      },
      message: props => `${props.value} não é um número de telefone válido no formato internacional!`
    }
  },
  // Adicionamos um campo para armazenar a versão normalizada para comparação
  phoneNormalized: {
    type: String,
    required: true
  },
  name: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Middleware para atualizar lastUpdated quando contato for modificado
contactSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastUpdated = Date.now();
  }
  next();
});

// Função para normalizar telefone sem o 9 para comparação
function getNormalizedPhoneForComparison(phone) {
  // Remove todos os caracteres não numéricos, inclusive o +
  const digitsOnly = phone.replace(/\D/g, '');
  
  // Para números brasileiros, faremos uma normalização especial
  if (digitsOnly.startsWith('55')) {
    const ddd = digitsOnly.substring(2, 4);
    
    // Tentaremos extrair os últimos 8 dígitos do número para comparação
    if (digitsOnly.length >= 10) { // Pelo menos DDD + 8 dígitos
      // Extrair os últimos 8 dígitos (número base sem o 9)
      const last8Digits = digitsOnly.substring(digitsOnly.length - 8);
      // Normalizar como 55 + DDD + últimos 8 dígitos
      return '55' + ddd + last8Digits;
    }
  }
  
  return digitsOnly;
}

// Middleware para normalizar número de telefone (remover espaços, traços, etc)
contactSchema.pre('save', function(next) {
  if (this.isModified('phone')) {
    // Remove todos os caracteres não numéricos, exceto o sinal de +
    this.phone = this.phone.replace(/\s+/g, '').replace(/-/g, '').replace(/\(/g, '').replace(/\)/g, '');
    
    // Garantir formato internacional
    if (!this.phone.startsWith('+')) {
      // Se começar apenas com números, presumir Brasil +55
      if (/^\d+$/.test(this.phone)) {
        this.phone = '+55' + this.phone;
      }
    }
    
    // Remover o + e quaisquer outros caracteres não-numéricos
    const digitsOnly = this.phone.replace(/\D/g, '');
    
    // Adicionar o + de volta para o formato final
    this.phone = '+' + digitsOnly;
    
    // Armazenar versão normalizada para comparação (sem o 9 extra)
    this.phoneNormalized = getNormalizedPhoneForComparison(this.phone);
  }
  next();
});

// Método estático para verificar se um telefone já existe (considerando diferentes formatos)
contactSchema.statics.phoneExists = async function(phone) {
  // Normaliza o telefone
  const digitsOnly = phone.replace(/\D/g, '');
  const formattedPhone = '+' + digitsOnly;
  
  // Versão normalizada para comparação (usando os últimos 8 dígitos)
  const normalizedPhone = getNormalizedPhoneForComparison(formattedPhone);
  
  // Buscar contato com o número exato
  const exactMatch = await this.findOne({ phone: formattedPhone });
  if (exactMatch) return exactMatch;
  
  // Buscar contato com o número normalizado - usando regex para encontrar correspondências com final igual
  const phoneQuery = {
    $or: [
      { phoneNormalized: normalizedPhone },
      { 
        // Buscar por números que terminem com os mesmos últimos 8 dígitos
        phone: { 
          $regex: new RegExp(normalizedPhone.substring(normalizedPhone.length - 8) + '$') 
        } 
      }
    ]
  };
  
  return await this.findOne(phoneQuery);
};

// Método estático para verificar e atualizar um número antigo para formato com 9 dígitos
contactSchema.statics.updateToImprovedFormat = async function(newContact) {
  // Verificar se é número brasileiro de celular com 9 dígitos
  const digitsOnly = newContact.phone.replace(/\D/g, '');
  const normalizedPhone = getNormalizedPhoneForComparison(newContact.phone);
  
  // Verificar se formatos são diferentes (um tem 9 e outro não)
  if (digitsOnly !== normalizedPhone && digitsOnly.startsWith('55')) {
    // O número tem 9 a mais, procurar versão anterior sem 9
    const existingContact = await this.findOne({ phoneNormalized: normalizedPhone });
    
    if (existingContact) {
      if (existingContact.phone.length < newContact.phone.length) {
        // O novo contato tem formato mais completo (tem o 9), atualizar o existente
        existingContact.phone = newContact.phone;
        existingContact.lastUpdated = Date.now();
        
        // Se tiver nome ou outras informações, atualizar também
        if (newContact.name && !existingContact.name) {
          existingContact.name = newContact.name;
        }
        
        // Atualizar tags se necessário
        if (newContact.tags && newContact.tags.length > 0) {
          // Unir tags existentes com novas, sem duplicação
          const allTags = [...new Set([...existingContact.tags, ...newContact.tags])];
          existingContact.tags = allTags;
        }
        
        // Salvar contato atualizado
        await existingContact.save();
        return { updated: true, contact: existingContact };
      }
      
      // Contato existente já tem o formato mais atualizado
      return { updated: false, contact: existingContact };
    }
  }
  
  // Não encontrou contato para atualizar
  return { updated: false, contact: null };
};

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact; 