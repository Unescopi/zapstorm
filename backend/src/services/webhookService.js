const axios = require('axios');
const logger = require('../utils/logger');
const { Instance } = require('../models');

class WebhookService {
  constructor() {
    this.baseApiPath = '/api/webhook';
    logger.info('WebhookService inicializado');
  }

  /**
   * Configura um webhook na API Evolution para uma instância específica
   * @param {string} instanceName - Nome da instância no WhatsApp
   * @param {string} serverUrl - URL do servidor da API Evolution
   * @param {string} apiKey - Chave da API Evolution
   * @param {string} webhookUrl - URL base do webhook (opcional)
   * @param {boolean} webhookByEvents - Indica se deve criar URLs específicas por evento
   * @param {boolean} webhookBase64 - Indica se mídia deve ser enviada como base64
   * @param {string[]} events - Lista de eventos a serem monitorados
   * @returns {Promise<Object>} - Resposta da API Evolution
   */
  async configureWebhook(instanceName, serverUrl, apiKey, webhookUrl, webhookByEvents = false, webhookBase64 = false, events = []) {
    try {
      logger.info(`Configurando webhook para instância ${instanceName}`);

      // Se não houver URL de webhook definida, use a URL da aplicação
      if (!webhookUrl) {
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        webhookUrl = `${appUrl}${this.baseApiPath}/${instanceName}`;
        logger.info(`URL de webhook não especificada, usando ${webhookUrl}`);
      }

      // Define eventos padrão se não especificados
      if (!events || events.length === 0) {
        events = this.getDefaultEvents();
        logger.info(`Usando eventos padrão: ${events.join(', ')}`);
      }

      // Prepara payload para a API Evolution
      const payload = {
        enabled: true,
        url: webhookUrl,
        webhook_by_events: webhookByEvents,
        webhook_base64: webhookBase64,
        events: events
      };

      logger.info(`Enviando configuração de webhook: ${JSON.stringify(payload)}`);

      // Configura axios para chamar a API Evolution
      const evolutionApi = axios.create({
        baseURL: serverUrl,
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        timeout: 30000
      });

      // Envia requisição para a API Evolution
      const response = await evolutionApi.post(`/webhook/set/${instanceName}`, payload);
      
      logger.info(`Webhook configurado com sucesso para ${instanceName}: ${JSON.stringify(response.data)}`);

      // Atualiza o registro da instância com as configurações do webhook
      await Instance.findOneAndUpdate(
        { instanceName },
        {
          webhook: {
            url: webhookUrl,
            events,
            webhookByEvents,
            webhookBase64,
            enabled: true,
            lastUpdated: new Date()
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Erro ao configurar webhook para instância ${instanceName}:`, error);
      throw new Error(`Falha ao configurar webhook: ${error.message}`);
    }
  }

  /**
   * Remove um webhook da API Evolution
   * @param {string} instanceName - Nome da instância 
   * @param {string} serverUrl - URL do servidor da API Evolution
   * @param {string} apiKey - Chave da API Evolution
   * @returns {Promise<Object>} - Resposta da API Evolution
   */
  async removeWebhook(instanceName, serverUrl, apiKey) {
    try {
      logger.info(`Removendo webhook para instância ${instanceName}`);

      // Configura axios para chamar a API Evolution
      const evolutionApi = axios.create({
        baseURL: serverUrl,
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        timeout: 30000
      });

      // Cria payload para desativar o webhook
      const payload = {
        enabled: false
      };

      // Envia requisição para a API Evolution
      const response = await evolutionApi.post(`/webhook/set/${instanceName}`, payload);
      
      logger.info(`Webhook removido com sucesso para ${instanceName}`);

      // Atualiza o registro da instância para remover configurações do webhook
      await Instance.findOneAndUpdate(
        { instanceName },
        {
          'webhook.enabled': false,
          'webhook.lastUpdated': new Date()
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Erro ao remover webhook para instância ${instanceName}:`, error);
      throw new Error(`Falha ao remover webhook: ${error.message}`);
    }
  }

  /**
   * Verifica detalhes do webhook configurado para uma instância
   * @param {string} instanceName - Nome da instância
   * @param {string} serverUrl - URL do servidor da API Evolution
   * @param {string} apiKey - Chave da API Evolution
   * @returns {Promise<Object>} - Detalhes do webhook
   */
  async getWebhookDetails(instanceName, serverUrl, apiKey) {
    try {
      logger.info(`Consultando detalhes do webhook para instância ${instanceName}`);

      // Configura axios para chamar a API Evolution
      const evolutionApi = axios.create({
        baseURL: serverUrl,
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        timeout: 30000
      });

      // Envia requisição para a API Evolution
      const response = await evolutionApi.get(`/webhook/find/${instanceName}`);
      
      logger.info(`Detalhes do webhook obtidos com sucesso para ${instanceName}`);
      return response.data;
    } catch (error) {
      logger.error(`Erro ao obter detalhes do webhook para instância ${instanceName}:`, error);
      throw new Error(`Falha ao obter detalhes do webhook: ${error.message}`);
    }
  }

  /**
   * Retorna a lista padrão de eventos para monitorar
   * @returns {string[]} Lista de eventos padrão
   */
  getDefaultEvents() {
    return [
      "QRCODE_UPDATED",
      "CONNECTION_UPDATE",
      "MESSAGES_SET",
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "SEND_MESSAGE",
      "CONTACTS_SET",
      "CONTACTS_UPSERT",
      "CONTACTS_UPDATE",
      "PRESENCE_UPDATE",
      "CHATS_SET",
      "CHATS_UPDATE",
      "CHATS_UPSERT",
      "CHATS_DELETE",
      "GROUPS_UPSERT",
      "GROUPS_UPDATE",
      "GROUP_PARTICIPANTS_UPDATE"
    ];
  }

  /**
   * Retorna todos os eventos suportados pela API Evolution
   * @returns {string[]} Lista completa de eventos
   */
  getAllSupportedEvents() {
    return [
      "APPLICATION_STARTUP",
      "QRCODE_UPDATED",
      "CONNECTION_UPDATE",
      "MESSAGES_SET",
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "SEND_MESSAGE",
      "CONTACTS_SET",
      "CONTACTS_UPSERT",
      "CONTACTS_UPDATE",
      "PRESENCE_UPDATE",
      "CHATS_SET",
      "CHATS_UPDATE",
      "CHATS_UPSERT",
      "CHATS_DELETE",
      "GROUPS_UPSERT",
      "GROUPS_UPDATE",
      "GROUP_PARTICIPANTS_UPDATE",
      "LABELS_EDIT",
      "LABELS_ASSOCIATION",
      "CALL",
      "NEW_TOKEN",
      "TYPEBOT_START",
      "TYPEBOT_CHANGE_STATUS",
      "LOGOUT_INSTANCE",
      "REMOVE_INSTANCE"
    ];
  }
}

module.exports = new WebhookService(); 