const mongoose = require('mongoose');

const instanceSchema = new mongoose.Schema({
  instanceName: {
    type: String,
    required: [true, 'Nome da instância é obrigatório'],
    trim: true,
    unique: true
  },
  instanceId: {
    type: String,
  },
  status: {
    type: String,
    enum: ['disconnected', 'connecting', 'connected', 'failed'],
    default: 'disconnected'
  },
  serverUrl: {
    type: String,
    required: [true, 'URL do servidor da API Evolution é obrigatória'],
    trim: true
  },
  apiKey: {
    type: String,
    required: [true, 'Chave da API Evolution é obrigatória'],
    trim: true
  },
  profileName: {
    type: String,
    trim: true
  },
  profilePictureUrl: {
    type: String,
    trim: true
  },
  profileStatus: {
    type: String,
    trim: true
  },
  owner: {
    type: String,
    trim: true
  },
  lastConnection: {
    type: Date
  },
  webhook: {
    enabled: {
      type: Boolean,
      default: false
    },
    url: {
      type: String,
      trim: true
    },
    secretKey: {
      type: String,
      trim: true
    },
    events: {
      CONNECTION_UPDATE: {
        type: Boolean,
        default: true
      },
      QRCODE_UPDATED: {
        type: Boolean,
        default: true
      },
      MESSAGES_UPSERT: {
        type: Boolean,
        default: true
      },
      MESSAGES_UPDATE: {
        type: Boolean,
        default: true
      },
      MESSAGES_DELETE: {
        type: Boolean,
        default: false
      },
      SEND_MESSAGE: {
        type: Boolean,
        default: true
      }
    },
    lastReceived: {
      type: Date
    },
    totalReceived: {
      type: Number,
      default: 0
    },
    failedWebhooks: {
      type: Number,
      default: 0
    }
  },
  throttling: {
    perSecond: {
      type: Number,
      default: 1,
      min: 1,
      max: 30
    },
    perMinute: {
      type: Number,
      default: 20,
      min: 1,
      max: 250
    },
    perHour: {
      type: Number,
      default: 1000,
      min: 1,
      max: 5000
    },
    perBatch: {
      type: Number,
      default: 50,
      min: 1,
      max: 500,
      description: 'Número máximo de mensagens por lote'
    },
    batchDelay: {
      type: Number,
      default: 5000,
      min: 1000,
      max: 60000,
      description: 'Intervalo entre lotes em milissegundos'
    },
    retryDelay: {
      type: Number,
      default: 300000, // 5 minutos
      min: 60000,
      max: 3600000,
      description: 'Tempo de espera para nova tentativa em caso de falha (ms)'
    },
    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
      max: 10,
      description: 'Número máximo de tentativas para mensagens com falha'
    },
  },
  metrics: {
    totalSent: {
      type: Number,
      default: 0
    },
    totalDelivered: {
      type: Number,
      default: 0
    },
    totalFailed: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Middleware para atualizar lastUpdated quando instância for modificada
instanceSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastUpdated = Date.now();
  }
  next();
});

const Instance = mongoose.model('Instance', instanceSchema);

module.exports = Instance; 