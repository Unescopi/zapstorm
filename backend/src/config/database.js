/**
 * Configuração de conexão com o MongoDB
 * Este arquivo fornece uma função para conectar ao banco de dados MongoDB
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('./index');

/**
 * Estabelece conexão com o MongoDB
 * @returns {Promise} - Promessa que resolve quando a conexão é estabelecida
 */
const connectToDatabase = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || config.mongodb.uri || 'mongodb://localhost:27017/zapstorm';
    
    logger.info(`Tentando conectar ao MongoDB: ${mongoURI.replace(/mongodb:\/\/[^:]+:[^@]+@/, 'mongodb://****:****@')}`);
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    logger.info('Conexão com MongoDB estabelecida com sucesso');
    return mongoose.connection;
  } catch (error) {
    logger.error(`Erro ao conectar ao MongoDB: ${error.message}`);
    throw error;
  }
};

module.exports = {
  connectToDatabase,
  getConnection: () => mongoose.connection
}; 