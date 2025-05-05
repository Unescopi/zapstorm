const mongoose = require('mongoose');

const webhookConfigSchema = new mongoose.Schema({
  instanceName: {
    type: String,
    required: [true, 'Nome da instância é obrigatório'],
    trim: true,
    unique: true
  },
  enabled: {
    type: Boolean,
    default: false
  },
  url: {
    type: String,
    trim: true,
    required: [true, 'URL do webhook é obrigatória']
  },
  webhookByEvents: {
    type: Boolean,
    default: false,
    description: 'Gerar URL específica para cada evento'
  },
  events: [{
    type: String,
    enum: [
      'APPLICATION_STARTUP',
      'QRCODE_UPDATED',
      'CONNECTION_UPDATE',
      'MESSAGES_SET',
      'MESSAGES_UPSERT',
      'MESSAGES_UPDATE',
      'MESSAGES_DELETE',
      'SEND_MESSAGE',
      'CONTACTS_SET',
      'CONTACTS_UPSERT',
      'CONTACTS_UPDATE',
      'PRESENCE_UPDATE',
      'CHATS_SET',
      'CHATS_UPDATE',
      'CHATS_UPSERT',
      'CHATS_DELETE',
      'GROUPS_UPSERT',
      'GROUPS_UPDATE',
      'GROUP_PARTICIPANTS_UPDATE',
      'NEW_TOKEN',
      'CALL',
      'TYPEBOT_START',
      'TYPEBOT_CHANGE_STATUS'
    ]
  }],
  base64: {
    type: Boolean,
    default: false,
    description: 'Receber mídia em base64'
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

// Middleware para atualizar lastUpdated quando a configuração for modificada
webhookConfigSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastUpdated = Date.now();
  }
  next();
});

const WebhookConfig = mongoose.model('WebhookConfig', webhookConfigSchema);

module.exports = WebhookConfig; 