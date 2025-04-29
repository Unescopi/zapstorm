const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Garantir que o diretório de logs existe
const logDirectory = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

// Formatar logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} | ${level.toUpperCase()} | ${stack || message}`;
  })
);

// Configuração do logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Garantir que logs sempre vão para o console (stdout)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
      handleExceptions: true,
      handleRejections: true,
    }),
    // File transport para arquivos
    new winston.transports.File({ 
      filename: path.join(logDirectory, 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logDirectory, 'combined.log') 
    })
  ],
  // Garantir que logs de exceções não capturadas sejam registrados
  exceptionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    new winston.transports.File({ 
      filename: path.join(logDirectory, 'exceptions.log') 
    })
  ],
  // Não encerrar na ocorrência de exceções não tratadas
  exitOnError: false
});

// Adicionalmente, vamos sobrescrever o console.log para garantir que seja registrado
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

console.log = function(...args) {
  originalConsoleLog.apply(console, args);
  logger.info(args.join(' '));
};

console.error = function(...args) {
  originalConsoleError.apply(console, args);
  logger.error(args.join(' '));
};

console.warn = function(...args) {
  originalConsoleWarn.apply(console, args);
  logger.warn(args.join(' '));
};

console.info = function(...args) {
  originalConsoleInfo.apply(console, args);
  logger.info(args.join(' '));
};

module.exports = logger; 