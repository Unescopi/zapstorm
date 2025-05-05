const mongoose = require('mongoose');

/**
 * Modelo para as configurações do sistema
 * Inclui configurações globais e de webhook
 */
const SettingSchema = new mongoose.Schema({
  // Configurações da API Evolution
  evolutionApiUrl: {
    type: String,
    default: process.env.EVOLUTION_API_URL || 'http://localhost:8080'
  },
  evolutionApiKey: {
    type: String,
    default: process.env.EVOLUTION_API_TOKEN || ''
  },

  // Configurações de mensagens
  messageSendDelay: {
    type: Number,
    default: 1000
  },
  defaultRetries: {
    type: Number,
    default: 3
  },
  maxConcurrentMessages: {
    type: Number,
    default: 10
  },

  // Configurações de cache
  cacheExpiration: {
    type: Number,
    default: 86400 // 24 horas em segundos
  },

  // Configurações de notificações
  notificationsEnabled: {
    type: Boolean,
    default: true
  },

  // Configurações de webhook
  webhookEnabled: {
    type: Boolean,
    default: false
  },
  webhookUrl: {
    type: String,
    default: ''
  },
  
  // Configurações específicas para integração com o Evolution API
  webhookSettings: {
    enabled: {
      type: Boolean,
      default: false
    },
    url: {
      type: String,
      default: ''
    },
    webhook_by_events: {
      type: Boolean,
      default: false
    },
    webhook_base64: {
      type: Boolean,
      default: false
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
    defaultEvents: {
      type: [String],
      default: [
        'QRCODE_UPDATED',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONNECTION_UPDATE'
      ]
    }
  },

  // Metadados
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Middleware para atualizar a data de atualização
SettingSchema.pre('save', function(next) {
  this.lastUpdated = Date.now();
  next();
});

// Configurar para que apenas um registro de configurações seja permitido
SettingSchema.statics.findOneOrCreate = async function() {
  const settings = await this.findOne();
  if (settings) {
    return settings;
  }
  
  return this.create({});
};

const Setting = mongoose.model('Setting', SettingSchema);

module.exports = Setting; 