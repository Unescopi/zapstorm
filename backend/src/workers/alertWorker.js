const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const logger = require('../utils/logger');
const alertService = require('../services/alertService');
const queueService = require('../services/queueService');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

class AlertWorker {
  constructor() {
    this.checkAlertsInterval = null;
    this.processNotificationsInterval = null;
    this.isProcessingNotification = false;
    this.processedEventIds = new Set(); // Evitar loops
  }

  async init() {
    try {
      // Conexão com MongoDB
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zapstorm');
      logger.info('Alert Worker conectado ao MongoDB');

      await this.start();
    } catch (err) {
      logger.error('Erro ao inicializar Alert Worker:', err);
      process.exit(1);
    }
  }

  async checkAllAlerts() {
    try {
      // Verificar falhas de campanhas
      await alertService.checkCampaignFailures();
      
      // Verificar problemas de conexão
      await alertService.checkInstanceConnections();
      
      logger.info('Verificação de alertas concluída');
    } catch (error) {
      logger.error('Erro ao verificar alertas:', error);
    }
  }

  async processNotifications() {
    if (this.isProcessingNotification) {
      logger.warn('Processamento de notificações já em andamento, pulando...');
      return;
    }

    this.isProcessingNotification = true;
    try {
      const unnotifiedAlerts = await alertService.getUnnotifiedAlerts();
      
      for (const alert of unnotifiedAlerts) {
        // Evitar loops de notificação
        if (this.processedEventIds.has(alert._id.toString())) {
          logger.warn(`Alerta ${alert._id} já processado, evitando loop`);
          continue;
        }

        await queueService.publishEvent({
          type: 'alert_notification',
          data: {
            alertId: alert._id,
            type: alert.type,
            level: alert.level,
            message: alert.message,
            createdAt: alert.createdAt,
            relatedTo: alert.relatedTo
          }
        });
        
        await alertService.markAsNotified(alert._id);
        this.processedEventIds.add(alert._id.toString());
        
        // Limitar tamanho do Set
        if (this.processedEventIds.size > 1000) {
          this.processedEventIds.clear();
        }
        
        logger.info(`Notificação enviada para alerta: ${alert._id}`);
      }
    } catch (error) {
      logger.error('Erro ao processar notificações de alertas:', error);
    } finally {
      this.isProcessingNotification = false;
    }
  }

  async processEvent(event) {
    try {
      logger.info(`Processando evento: ${event.type}`);
      
      // Evitar processamento duplicado
      if (event.id && this.processedEventIds.has(event.id)) {
        logger.warn(`Evento ${event.id} já processado, ignorando`);
        return;
      }
      
      switch (event.type) {
        case 'campaign_completed':
          await alertService.checkCampaignSuccess(event.data);
          break;
        case 'campaign_failed':
          await alertService.checkCampaignFailure(event.data);
          break;
        case 'campaign_started':
          await alertService.checkCampaignStart(event.data);
          break;
        case 'alert_notification':
          if (!this.isProcessingNotification) {
            await alertService.processNotification(event.data);
          }
          break;
        default:
          logger.warn(`Tipo de evento desconhecido: ${event.type}`);
      }
      
      if (event.id) {
        this.processedEventIds.add(event.id);
      }
      
      logger.info(`Evento ${event.type} processado com sucesso`);
    } catch (error) {
      logger.error(`Erro ao processar evento ${event.type}:`, error);
    }
  }

  async start() {
    try {
      await queueService.connect();
      logger.info('Worker de alertas iniciado');
      
      // Consumir eventos da fila
      await queueService.consumeEvents(this.processEvent.bind(this));
      logger.info('Consumidor de eventos iniciado');
      
      // Executar verificação de alertas imediatamente
      await this.checkAllAlerts();
      
      // Configurar intervalos
      this.checkAlertsInterval = setInterval(() => this.checkAllAlerts(), 5 * 60000);
      this.processNotificationsInterval = setInterval(() => this.processNotifications(), 60000);
      
    } catch (error) {
      logger.error('Erro ao iniciar worker de alertas:', error);
      process.exit(1);
    }
  }

  async stop() {
    logger.info('Parando worker de alertas...');
    
    // Limpar intervalos
    if (this.checkAlertsInterval) {
      clearInterval(this.checkAlertsInterval);
    }
    if (this.processNotificationsInterval) {
      clearInterval(this.processNotificationsInterval);
    }
    
    // Fechar conexões
    await queueService.close();
    await mongoose.connection.close();
    
    logger.info('Worker de alertas parado com sucesso');
  }
}

const worker = new AlertWorker();

// Gerenciamento de processo
process.on('SIGTERM', async () => {
  logger.info('Worker de alertas recebeu SIGTERM, encerrando graciosamente...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Worker de alertas recebeu SIGINT, encerrando graciosamente...');
  await worker.stop();
  process.exit(0);
});

// Iniciar worker
worker.init(); 