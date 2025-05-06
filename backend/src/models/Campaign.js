const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nome da campanha é obrigatório'],
    trim: true
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template',
    required: [true, 'Um template deve ser associado à campanha']
  },
  status: {
    type: String,
    enum: ['draft', 'queued', 'running', 'paused', 'completed', 'failed', 'canceled'],
    default: 'draft'
  },
  schedule: {
    type: {
      type: String,
      enum: ['immediate', 'scheduled', 'recurring'],
      default: 'immediate'
    },
    startAt: {
      type: Date
    },
    endAt: {
      type: Date
    },
    recurrencePattern: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', ''],
      default: ''
    },
    recurrenceDays: [{
      type: Number,
      min: 0,
      max: 6
    }],
    recurrenceTime: {
      type: String,
      default: '09:00'
    }
  },
  contactFilter: {
    type: Object,
    default: {}
  },
  contacts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact'
  }],
  metrics: {
    total: {
      type: Number,
      default: 0
    },
    sent: {
      type: Number,
      default: 0
    },
    delivered: {
      type: Number,
      default: 0
    },
    read: {
      type: Number,
      default: 0
    },
    failed: {
      type: Number,
      default: 0
    },
    replies: {
      type: Number,
      default: 0
    },
    blockedDetected: {
      type: Number,
      default: 0
    },
    healthScore: {
      type: Number,
      default: 100
    },
    deliveryRate: {
      type: Number
    },
    readRate: {
      type: Number
    },
    failureRate: {
      type: Number
    },
    lastCalculated: {
      type: Date
    }
  },
  variableValues: {
    type: Map,
    of: String
  },
  // Variantes de mensagem para evitar detecção de spam
  messageVariants: [{
    type: String,
    trim: true
  }],
  useMessageVariants: {
    type: Boolean,
    default: false
  },
  // Configurações anti-spam
  antiSpam: {
    // Simular digitação antes de enviar mensagem
    sendTyping: {
      type: Boolean,
      default: true
    },
    // Tempo mínimo de digitação (ms)
    typingTime: {
      type: Number,
      default: 3000
    },
    // Intervalo variável entre mensagens (ms)
    messageInterval: {
      min: {
        type: Number,
        default: 2000
      },
      max: {
        type: Number,
        default: 5000
      }
    },
    // Pausa a cada N mensagens
    pauseAfter: {
      count: {
        type: Number,
        default: 20
      },
      duration: {
        min: {
          type: Number,
          default: 15000
        },
        max: {
          type: Number,
          default: 45000
        }
      }
    },
    // Distribuição de lotes
    distributeDelivery: {
      type: Boolean,
      default: true
    },
    // Variação de conteúdo (pequenas diferenças para evitar mensagens idênticas)
    randomizeContent: {
      type: Boolean,
      default: true
    },
    // Novas configurações anti-spam
    avoidSimilarMessages: {
      type: Boolean,
      default: true
    },
    adaptiveThrottling: {
      type: Boolean,
      default: true
    }
  },
  // Rotação de instâncias para campanhas
  rotateInstances: {
    type: Boolean,
    default: false
  },
  rotationStrategy: {
    type: String,
    enum: ['round-robin', 'health-based', 'load-balanced', 'none'],
    default: 'health-based'
  },
  // Histórico de rotações
  rotationHistory: [{
    fromInstance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Instance'
    },
    toInstance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Instance'
    },
    reason: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  instanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instance',
    required: [true, 'Uma instância deve ser associada à campanha']
  }
});

// Middleware para atualizar lastUpdated quando campanha for modificada
campaignSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastUpdated = Date.now();
  }
  next();
});

// Método para gerar uma variante aleatória
campaignSchema.methods.getRandomVariant = function() {
  if (!this.useMessageVariants || !this.messageVariants || this.messageVariants.length === 0) {
    return null;
  }
  
  const randomIndex = Math.floor(Math.random() * this.messageVariants.length);
  return this.messageVariants[randomIndex];
};

// Índice para otimizar consultas
campaignSchema.index({ status: 1 });
campaignSchema.index({ 'schedule.startAt': 1 });
campaignSchema.index({ 'schedule.type': 1, status: 1 });

const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = Campaign; 