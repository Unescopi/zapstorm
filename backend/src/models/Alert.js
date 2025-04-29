const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['campaign_failure', 'connection_lost', 'high_failure_rate', 'system'],
    required: true
  },
  level: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    required: true,
    default: 'info'
  },
  message: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  relatedTo: {
    type: {
      type: String,
      enum: ['campaign', 'instance', 'system', 'other']
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    name: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isRead: {
    type: Boolean,
    default: false
  },
  notificationSent: {
    type: Boolean,
    default: false
  }
});

// Índices para melhor performance nas consultas
alertSchema.index({ createdAt: -1 });
alertSchema.index({ type: 1 });
alertSchema.index({ level: 1 });
alertSchema.index({ isRead: 1 });

const Alert = mongoose.model('Alert', alertSchema);

module.exports = Alert; 