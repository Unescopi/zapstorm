const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema({
  instanceName: {
    type: String,
    required: true,
    index: true
  },
  event: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'invalid'],
    default: 'success'
  },
  payload: {
    type: mongoose.Schema.Types.Mixed
  },
  responseStatus: {
    type: Number
  },
  responseMessage: {
    type: String
  },
  processingTimeMs: {
    type: Number
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 1209600 // 14 dias (em segundos) - TTL para auto-limpeza
  }
});

// Índice para consultas
webhookLogSchema.index({ createdAt: -1 });
webhookLogSchema.index({ instanceName: 1, createdAt: -1 });
webhookLogSchema.index({ event: 1, createdAt: -1 });

const WebhookLog = mongoose.model('WebhookLog', webhookLogSchema);

module.exports = WebhookLog; 