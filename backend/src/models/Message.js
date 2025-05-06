const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  instanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instance',
    required: true
  },
  messageId: {
    type: String,
    index: true
  },
  content: {
    type: String
  },
  mediaUrl: {
    type: String
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'audio', 'document', null]
  },
  status: {
    type: String,
    enum: ['pending', 'queued', 'scheduled_retry', 'sent', 'delivered', 'read', 'failed', 'canceled', 'error'],
    default: 'pending'
  },
  errorDetails: {
    type: String
  },
  retries: {
    type: Number,
    default: 0
  },
  scheduledRetryAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  sentAt: {
    type: Date
  },
  deliveredAt: {
    type: Date
  },
  readAt: {
    type: Date
  },
  // Histórico completo de mudanças de status
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'queued', 'scheduled_retry', 'sent', 'delivered', 'read', 'failed', 'canceled', 'error']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: {
      type: String
    },
    ackCode: {
      type: Number
    }
  }],
  // Informações de controle anti-spam
  antiSpamInfo: {
    // Versão do texto usada (se variações foram aplicadas)
    contentVariation: {
      type: String,
      enum: ['original', 'unique_chars', 'phrase_variant', 'custom'],
      default: 'original'
    },
    // Atraso aplicado antes do envio
    appliedDelay: {
      type: Number
    },
    // Se typing foi enviado
    typingSent: {
      type: Boolean,
      default: false
    },
    // Duração do typing
    typingDuration: {
      type: Number
    },
    // Tempo entre mensagens no lote
    batchInterval: {
      type: Number
    },
    // Se está em pausa anti-spam
    pausedForAntiSpam: {
      type: Boolean,
      default: false
    },
    // Duração da pausa anti-spam
    pauseDuration: {
      type: Number
    }
  },
  // Dados da resposta do WhatsApp
  webhookEvents: [{
    eventType: {
      type: String
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    data: {
      type: Object
    }
  }],
  // Para mensagens recebidas (respostas)
  isReply: {
    type: Boolean,
    default: false
  },
  replyToMessageId: {
    type: String
  },
  // Dados de rastreamento de taxa de envio
  rateLimiterInfo: {
    isThrottled: {
      type: Boolean,
      default: false
    },
    throttleReason: {
      type: String
    },
    waitTime: {
      type: Number
    },
    counters: {
      type: Object
    }
  }
});

// Índices para consultas comuns
messageSchema.index({ campaignId: 1, status: 1 });
messageSchema.index({ contactId: 1 });
messageSchema.index({ instanceId: 1, createdAt: -1 });
messageSchema.index({ messageId: 1 }, { sparse: true });
messageSchema.index({ status: 1, scheduledRetryAt: 1 }, { sparse: true });

// Método para adicionar evento de webhook
messageSchema.methods.addWebhookEvent = function(eventType, data) {
  this.webhookEvents = this.webhookEvents || [];
  this.webhookEvents.push({
    eventType,
    timestamp: Date.now(),
    data
  });
};

// Método para adicionar evento de status
messageSchema.methods.addStatusHistory = function(status, details, ackCode) {
  this.statusHistory = this.statusHistory || [];
  this.statusHistory.push({
    status,
    timestamp: Date.now(),
    details,
    ackCode
  });
  
  // Atualizar status atual apenas se for um progresso
  const statusHierarchy = {
    'error': 0,
    'failed': 1,
    'canceled': 2,
    'pending': 3,
    'queued': 4,
    'scheduled_retry': 5,
    'sent': 6,
    'delivered': 7,
    'read': 8
  };
  
  const currentValue = statusHierarchy[this.status] || 0;
  const newValue = statusHierarchy[status] || 0;
  
  // Atualizar apenas se for erro ou progresso no status
  if (status === 'error' || status === 'failed' || newValue > currentValue) {
    this.status = status;
    
    // Atualizar timestamps relevantes
    if (status === 'sent') this.sentAt = Date.now();
    if (status === 'delivered') this.deliveredAt = Date.now();
    if (status === 'read') this.readAt = Date.now();
  }
  
  return this;
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 