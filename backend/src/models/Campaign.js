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
    enum: ['draft', 'queued', 'running', 'paused', 'completed', 'failed', 'canceled', 'master'],
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
    failed: {
      type: Number,
      default: 0
    },
    pending: {
      type: Number,
      default: 0
    }
  },
  variableValues: {
    type: Map,
    of: String
  },
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
  },
  // Novos campos para sistema de batch
  segmentSize: {
    type: Number,
    default: 100,
    description: 'Tamanho máximo de cada grupo de contatos para envio seguro'
  },
  batchInterval: {
    type: Number,
    default: 7200000, // 2 horas em ms
    description: 'Intervalo entre cada batch em milissegundos'
  },
  // Campos para gerenciamento de batches
  batchMode: {
    type: Boolean,
    default: false,
    description: 'Indica se esta campanha está em modo de batches'
  },
  batchCampaigns: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    description: 'Lista de IDs das sub-campanhas (batches)'
  }],
  // Campos para identificar sub-campanhas (batches)
  isSubCampaign: {
    type: Boolean,
    default: false,
    description: 'Indica se esta campanha é um batch de outra campanha'
  },
  parentCampaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    description: 'ID da campanha principal (quando esta é um batch)'
  },
  batchNumber: {
    type: Number,
    description: 'Número do batch em relação ao total (1 a N)'
  },
  totalBatches: {
    type: Number,
    description: 'Número total de batches na campanha principal'
  },
  batchSize: {
    type: Number,
    description: 'Quantidade de contatos em cada batch'
  }
});

// Middleware para atualizar lastUpdated quando campanha for modificada
campaignSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastUpdated = Date.now();
  }
  next();
});

const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = Campaign; 