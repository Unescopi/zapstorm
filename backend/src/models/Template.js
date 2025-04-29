const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nome do template é obrigatório'],
    trim: true,
    unique: true
  },
  content: {
    type: String,
    required: [true, 'Conteúdo da mensagem é obrigatório'],
    trim: true
  },
  mediaUrl: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Validação URL simples
        return !v || /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/.test(v);
      },
      message: props => `${props.value} não é uma URL válida!`
    }
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'audio', 'document', 'none'],
    default: 'none'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  // Campos para permitir personalização da mensagem
  variables: [{
    type: String,
    trim: true
  }]
});

// Middleware para atualizar lastUpdated quando template for modificado
templateSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastUpdated = Date.now();
  }
  
  // Detecta variáveis na string do conteúdo (formato: {{nome_variavel}})
  if (this.isModified('content')) {
    const varMatches = this.content.match(/\{\{([^}]+)\}\}/g) || [];
    this.variables = varMatches.map(v => v.replace(/\{\{|\}\}/g, ''));
  }
  
  next();
});

const Template = mongoose.model('Template', templateSchema);

module.exports = Template; 