const mongoose = require('mongoose');

const instanceSchema = new mongoose.Schema({
  instanceName: {
    type: String,
    required: [true, 'Nome da instância é obrigatório'],
    unique: true,
    trim: true
  },
  displayName: {
    type: String,
    trim: true
  },
  serverUrl: {
    type: String,
    required: [true, 'URL do servidor é obrigatória'],
    trim: true
  },
  apiKey: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['disconnected', 'connecting', 'connected', 'warning', 'error', 'quarantine'],
    default: 'disconnected'
  },
  webhook: {
    url: {
      type: String,
      trim: true
    },
    events: [{
      type: String
    }],
    isActive: {
      type: Boolean,
      default: false
    }
  },
  qrcode: {
    type: String
  },
  profile: {
    name: String,
    description: String,
    phone: String,
    profilePictureUrl: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastConnection: {
    type: Date
  },
  lastDisconnection: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
    totalRead: {
      type: Number,
      default: 0
    },
    totalFailed: {
      type: Number,
      default: 0
    },
    messagesSentToday: {
      type: Number,
      default: 0
    },
    messagesSentThisWeek: {
      type: Number,
      default: 0
    },
    deliveryRate: {
      type: Number,
      default: 0
    },
    readRate: {
      type: Number,
      default: 0
    },
    lastUpdateTime: {
      type: Date,
      default: Date.now
    }
  },
  // Configurações de throttling para evitar bloqueios
  throttling: {
    perMinute: {
      type: Number,
      default: 20,
      min: 1,
      max: 60
    },
    perHour: {
      type: Number,
      default: 300,
      min: 10,
      max: 1000
    },
    batchSize: {
      type: Number,
      default: 10,
      min: 1,
      max: 50
    },
    batchDelay: {
      type: Number,
      default: 3000,
      min: 1000,
      max: 30000
    }
  },
  // Status de saúde da instância para análise anti-spam e bloqueio
  health: {
    status: {
      type: String,
      enum: ['healthy', 'warning', 'critical', 'unknown'],
      default: 'unknown'
    },
    lastCheckTimestamp: {
      type: Date
    },
    successRate: {
      type: Number,
      default: 1.0
    },
    blockSuspicion: {
      type: Boolean,
      default: false
    },
    suspicionScore: {
      type: Number,
      default: 0
    },
    blockWarningCount: {
      type: Number,
      default: 0
    },
    details: {
      type: String
    },
    messageVolume24h: {
      type: Number,
      default: 0
    },
    quarantineReason: {
      type: String
    },
    quarantineTimestamp: {
      type: Date
    },
    recoveryTimestamp: {
      type: Date
    },
    previousQuarantineReason: {
      type: String
    }
  },
  // Histórico de ajustes automáticos do sistema anti-spam
  lastAdjustment: {
    timestamp: {
      type: Date
    },
    reason: {
      type: String
    },
    previousSettings: {
      type: Object
    }
  },
  // Configurações anti-spam padrão para campanhas desta instância
  defaultAntiSpamSettings: {
    sendTyping: {
      type: Boolean,
      default: true
    },
    typingTime: {
      type: Number,
      default: 3000
    },
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
    distributeDelivery: {
      type: Boolean,
      default: true
    },
    randomizeContent: {
      type: Boolean,
      default: true
    }
  }
});

// Método para verificar se a instância está em bom estado para uso
instanceSchema.methods.isHealthy = function() {
  return this.status === 'connected' && 
         (!this.health.status || this.health.status === 'healthy') &&
         !this.health.blockSuspicion;
};

// Método para obter limites atuais de taxa
instanceSchema.methods.getRateLimits = function() {
  return {
    perMinute: this.throttling?.perMinute || 20,
    perHour: this.throttling?.perHour || 300,
    batchSize: this.throttling?.batchSize || 10,
    batchDelay: this.throttling?.batchDelay || 3000
  };
};

// Índices para otimizar consultas
instanceSchema.index({ instanceName: 1 });
instanceSchema.index({ status: 1 });
instanceSchema.index({ 'health.status': 1 });

const Instance = mongoose.model('Instance', instanceSchema);

module.exports = Instance; 