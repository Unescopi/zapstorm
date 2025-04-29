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
  status: {
    type: String,
    enum: ['pending', 'queued', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending'
  },
  content: {
    type: String,
    required: true
  },
  // Campos para mídia
  mediaUrl: {
    type: String,
    trim: true
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'audio', 'document', null],
    default: null
  },
  // Armazena o ID da mensagem retornado pela API Evolution
  messageId: {
    type: String
  },
  // Detalhes do erro em caso de falha
  errorDetails: {
    type: String
  },
  // Armazena quantas tentativas de envio já foram feitas
  retries: {
    type: Number,
    default: 0
  },
  // Timestamp de criação
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Timestamp do envio
  sentAt: {
    type: Date
  },
  // Timestamp de entrega
  deliveredAt: {
    type: Date
  },
  // Timestamp de leitura
  readAt: {
    type: Date
  },
  // Próxima tentativa agendada
  scheduledRetryAt: {
    type: Date
  },
  // Informações sobre a instância que enviou a mensagem
  instanceId: {
    type: String,
    required: true
  }
});

// Índices para melhorar performance
messageSchema.index({ status: 1 });
messageSchema.index({ campaignId: 1, status: 1 });
messageSchema.index({ scheduledRetryAt: 1 }, { expireAfterSeconds: 0 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 