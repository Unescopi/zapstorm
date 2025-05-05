/**
 * Configuração centralizada da aplicação
 * Este arquivo concentra todas as configurações vindas de variáveis de ambiente
 * e fornece valores padrão para desenvolvimento local
 */

const config = {
  // Configurações do servidor
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },
  
  // Configurações do MongoDB
  mongodb: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/zapstorm'
  },
  
  // Configurações do RabbitMQ
  rabbitmq: {
    url: process.env.RABBITMQ_URI || 'amqp://localhost:5672'
  },
  
  // Configurações de autenticação JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'zapstorm_secret_key_for_development',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  
  // Configurações de throttling para envio de mensagens
  throttling: {
    perSecond: parseInt(process.env.THROTTLE_PER_SECOND) || 1,
    perMinute: parseInt(process.env.THROTTLE_PER_MINUTE) || 50,
    perHour: parseInt(process.env.THROTTLE_PER_HOUR) || 1000
  },
  
  // Configurações de upload
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    directory: process.env.UPLOAD_DIR || 'uploads/'
  }
};

module.exports = config; 