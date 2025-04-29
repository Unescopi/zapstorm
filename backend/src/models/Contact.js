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

// Middleware para normalizar número de telefone (remover espaços, traços, etc)
contactSchema.pre('save', function(next) {
  if (this.isModified('phone')) {
    this.phone = this.phone.replace(/\s+/g, '').replace(/-/g, '');
    
    // Garantir formato internacional
    if (!this.phone.startsWith('+')) {
      // Se começar apenas com números, presumir Brasil +55
      if (/^\d+$/.test(this.phone)) {
        this.phone = '+55' + this.phone;
      }
    }
  }
  next();
});

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact; 