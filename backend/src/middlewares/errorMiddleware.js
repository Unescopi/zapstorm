/**
 * Middleware para tratamento centralizado de erros no Express
 * @module middlewares/errorMiddleware
 */

const logger = require('../utils/logger');

/**
 * Middleware de tratamento de erros para a API
 * Formato normalizado de resposta para erros
 * 
 * @param {Error} err - Objeto de erro capturado pelo Express
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 * @param {Function} next - Função next do Express
 */
const errorHandler = (err, req, res, next) => {
  // Registrar erro no log
  logger.error(`Erro na rota ${req.method} ${req.originalUrl}:`, err);
  
  // Status code padrão para erros internos
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  // Verificar ambiente para exibir detalhes do erro
  const isDev = process.env.NODE_ENV === 'development';
  
  // Preparar resposta de erro
  const errorResponse = {
    success: false,
    message: err.message || 'Erro interno do servidor',
    stack: isDev ? err.stack : undefined,
    errors: err.errors || undefined
  };
  
  // Enviar resposta formatada
  res.status(statusCode).json(errorResponse);
};

/**
 * Middleware para capturar rotas inexistentes (404)
 * 
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 */
const notFound = (req, res) => {
  logger.warn(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  
  res.status(404).json({
    success: false,
    message: `Rota não encontrada: ${req.method} ${req.originalUrl}`
  });
};

module.exports = {
  errorHandler,
  notFound
}; 