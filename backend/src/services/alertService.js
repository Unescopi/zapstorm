const { Alert, Message, Campaign, Instance } = require('../models');
const logger = require('../utils/logger');
const queueService = require('./queueService');

class AlertService {
  /**
   * Cria um novo alerta de falha
   */
  async createAlert(type, level, message, details = {}, relatedTo = {}) {
    try {
      const alert = new Alert({
        type,
        level,
        message,
        details,
        relatedTo
      });
      
      await alert.save();
      
      // Publicar evento de novo alerta para notificações em tempo real
      await queueService.publishEvent({
        type: 'new_alert',
        data: alert
      });
      
      // Log
      logger.info(`Novo alerta criado: ${type} - ${message}`);
      
      return alert;
    } catch (error) {
      logger.error('Erro ao criar alerta:', error);
      throw error;
    }
  }
  
  /**
   * Verifica falhas massivas em campanhas
   * Gera alertas para falhas acima de determinado threshold
   */
  async checkCampaignFailures() {
    try {
      // Buscar campanhas ativas
      const activeCampaigns = await Campaign.find({
        status: { $in: ['running', 'paused'] }
      });
      
      for (const campaign of activeCampaigns) {
        // Calcular taxa de falhas
        const totalMessages = campaign.metrics.total;
        const failedMessages = campaign.metrics.failed;
        
        if (totalMessages === 0) continue;
        
        const failureRate = failedMessages / totalMessages;
        
        // Gerar alerta se a taxa de falha for alta (> 20%)
        if (failureRate > 0.2 && failedMessages > 10) {
          // Verificar se já existe alerta para esta campanha
          const existingAlert = await Alert.findOne({
            'relatedTo.type': 'campaign',
            'relatedTo.id': campaign._id,
            createdAt: { $gte: new Date(Date.now() - 3600000) } // Último hora
          });
          
          if (!existingAlert) {
            await this.createAlert(
              'high_failure_rate',
              failureRate > 0.5 ? 'critical' : 'warning',
              `Alta taxa de falha (${Math.round(failureRate * 100)}%) na campanha ${campaign.name}`,
              {
                failureRate,
                totalMessages,
                failedMessages
              },
              {
                type: 'campaign',
                id: campaign._id,
                name: campaign.name
              }
            );
          }
        }
      }
    } catch (error) {
      logger.error('Erro ao verificar falhas de campanhas:', error);
    }
  }
  
  /**
   * Verifica problemas de conexão com instâncias
   */
  async checkInstanceConnections() {
    try {
      // Buscar instâncias desconectadas recentemente
      const disconnectedInstances = await Instance.find({
        status: 'disconnected',
        lastConnection: { $gte: new Date(Date.now() - 3600000) } // Última hora
      });
      
      for (const instance of disconnectedInstances) {
        // Verificar se já existe alerta para esta instância
        const existingAlert = await Alert.findOne({
          'relatedTo.type': 'instance',
          'relatedTo.id': instance._id,
          createdAt: { $gte: new Date(Date.now() - 1800000) } // Últimos 30 minutos
        });
        
        if (!existingAlert) {
          await this.createAlert(
            'connection_lost',
            'critical',
            `Conexão perdida com a instância ${instance.instanceName}`,
            {
              lastConnection: instance.lastConnection
            },
            {
              type: 'instance',
              id: instance._id,
              name: instance.instanceName
            }
          );
        }
      }
    } catch (error) {
      logger.error('Erro ao verificar conexões de instâncias:', error);
    }
  }
  
  /**
   * Marca um alerta como lido
   */
  async markAsRead(alertId) {
    return Alert.findByIdAndUpdate(alertId, { isRead: true });
  }
  
  /**
   * Marca um alerta como notificado
   */
  async markAsNotified(alertId) {
    return Alert.findByIdAndUpdate(alertId, { notificationSent: true });
  }
  
  /**
   * Obtém alertas não lidos
   */
  async getUnreadAlerts(limit = 20) {
    return Alert.find({ isRead: false })
      .sort({ createdAt: -1 })
      .limit(limit);
  }
  
  /**
   * Obtém alertas não notificados
   */
  async getUnnotifiedAlerts() {
    return Alert.find({ notificationSent: false })
      .sort({ createdAt: -1 });
  }
}

module.exports = new AlertService(); 