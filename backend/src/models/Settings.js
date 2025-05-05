const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  evolutionApiUrl: {
    type: String,
    required: true,
    trim: true
  },
  evolutionApiKey: {
    type: String,
    required: true,
    trim: true
  },
  messageSendDelay: {
    type: Number,
    default: 1000,
    min: 100,
    max: 10000
  },
  defaultRetries: {
    type: Number,
    default: 3,
    min: 0,
    max: 10
  },
  notificationsEnabled: {
    type: Boolean,
    default: true
  },
  webhookUrl: {
    type: String,
    trim: true
  },
  webhookEnabled: {
    type: Boolean,
    default: false
  },
  cacheExpiration: {
    type: Number,
    default: 86400, // 24 horas em segundos
    min: 60
  },
  maxConcurrentMessages: {
    type: Number,
    default: 10,
    min: 1,
    max: 50
  },
  webhookByEvents: {
    type: Boolean,
    default: false
  },
  webhookBase64: {
    type: Boolean,
    default: false
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Garantir que sempre haja apenas um documento de configuração
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  
  if (!settings) {
    // Criar configurações padrão se não existirem
    settings = await this.create({
      evolutionApiUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
      evolutionApiKey: process.env.EVOLUTION_API_TOKEN || '',
      messageSendDelay: 1000,
      defaultRetries: 3,
      notificationsEnabled: true,
      webhookUrl: '',
      webhookEnabled: false,
      cacheExpiration: 86400,
      maxConcurrentMessages: 10,
      webhookByEvents: false,
      webhookBase64: false
    });
  }
  
  return settings;
};

// Atualizar configurações
settingsSchema.statics.updateSettings = async function(settingsData, userId) {
  // Buscar configurações atuais
  const currentSettings = await this.getSettings();
  
  // Atualizar campos
  Object.keys(settingsData).forEach(key => {
    if (key in currentSettings && key !== '_id' && key !== '__v') {
      currentSettings[key] = settingsData[key];
    }
  });
  
  // Registrar quem atualizou e quando
  currentSettings.updatedBy = userId;
  currentSettings.updatedAt = new Date();
  
  // Salvar e retornar
  await currentSettings.save();
  return currentSettings;
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings; 