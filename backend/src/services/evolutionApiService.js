const axios = require('axios');
const logger = require('../utils/logger');

class EvolutionApiService {
  constructor(serverUrl, apiKey) {
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
    this.axios = axios.create({
      baseURL: serverUrl,
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      timeout: 30000 // 30 segundos de timeout
    });
    
    // Log de inicialização
    console.log(`EvolutionApiService inicializado com URL: ${serverUrl}`);
    logger.info(`EvolutionApiService inicializado com URL: ${serverUrl}`);
  }

  // Tratar erros de forma centralizada
  _handleError(error, methodName) {
    let errorMessage = `Erro no método ${methodName}`;
    let statusCode = 500;
    
    if (error.response) {
      statusCode = error.response.status;
      if (error.response.data && error.response.data.error) {
        errorMessage = `${errorMessage}: ${error.response.data.error}`;
      } else {
        errorMessage = `${errorMessage}: ${error.response.statusText}`;
      }
    } else if (error.request) {
      errorMessage = `${errorMessage}: Sem resposta do servidor`;
    } else {
      errorMessage = `${errorMessage}: ${error.message}`;
    }
    
    console.error(errorMessage);
    logger.error(errorMessage);
    
    // Lançar uma exceção formatada
    const formattedError = new Error(errorMessage);
    formattedError.statusCode = statusCode;
    formattedError.originalError = error;
    throw formattedError;
  }

  // Obter instâncias
  async getInstances() {
    try {
      const response = await this.axios.get('/instance/fetchInstances');
      return response.data;
    } catch (error) {
      this._handleError(error, 'getInstances');
    }
  }
  
  // Obter estado da conexão
  async connectionState(instanceName) {
    try {
      const response = await this.axios.get(`/instance/connectionState/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'connectionState');
    }
  }
  
  // Iniciar instância
  async startInstance(instanceName) {
    try {
      const payload = {
        instanceName: instanceName
      };
      
      const response = await this.axios.post('/instance/create', payload);
      return response.data;
    } catch (error) {
      this._handleError(error, 'startInstance');
    }
  }
  
  // Desconectar instância
  async disconnectInstance(instanceName) {
    try {
      const response = await this.axios.delete(`/instance/logout/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'disconnectInstance');
    }
  }
  
  // Reconectar instância
  async connectInstance(instanceName) {
    try {
      const response = await this.axios.put(`/instance/connect/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'connectInstance');
    }
  }
  
  // Restart instance
  async restartInstance(instanceName) {
    try {
      const response = await this.axios.put(`/instance/restart/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'restartInstance');
    }
  }
  
  // Delete instance
  async deleteInstance(instanceName) {
    try {
      const response = await this.axios.delete(`/instance/delete/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'deleteInstance');
    }
  }
  
  // Get QR Code
  async getQrcode(instanceName) {
    try {
      const response = await this.axios.get(`/instance/qrcode/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'getQrcode');
    }
  }
  
  // Simular digitação
  async sendChatPresenceStatus(instanceName, to, presence = 'composing', typingDuration = 3000) {
    try {
      if (!instanceName || !to) {
        throw new Error('Nome da instância e número de destino são obrigatórios');
      }
      
      const payload = {
        number: to,
        presence: presence, // 'composing' (digitando) ou 'paused' (parou de digitar)
      };
      
      logger.info(`Enviando status de digitação para ${to} (${presence})`);
      
      const response = await this.axios.post(`/chat/presenceSubscribe/${instanceName}`, payload);
      
      // Aguardar o tempo de digitação antes de retornar (não bloqueia o evento)
      if (presence === 'composing' && typingDuration > 0) {
        await new Promise(resolve => setTimeout(resolve, typingDuration));
        
        // Opcionalmente, enviar status "parou de digitar" após o tempo
        if (typingDuration > 2000) {
          try {
            await this.sendChatPresenceStatus(instanceName, to, 'paused', 0);
          } catch (err) {
            // Ignora erro ao pausar digitação
            logger.warn(`Erro ao enviar status 'paused' para ${to}: ${err.message}`);
          }
        }
      }
      
      return response.data;
    } catch (error) {
      this._handleError(error, 'sendChatPresenceStatus');
    }
  }

  // Enviar mensagem de texto
  async sendText(instanceName, to, text, options = {}) {
    try {
      // Verificar se o texto é válido
      if (!text || typeof text !== 'string') {
        console.error(`Erro: Texto inválido para envio: ${text}`);
        logger.error(`Erro: Texto inválido para envio: ${text}`);
        throw new Error('Texto inválido para envio');
      }
      
      // Limpar o texto e garantir que não está vazio
      const cleanedText = text.trim();
      if (cleanedText === '') {
        console.error('Erro: Texto está vazio após limpeza');
        logger.error('Erro: Texto está vazio após limpeza');
        throw new Error('Texto está vazio após limpeza');
      }
      
      // Enviar status "digitando" antes da mensagem se solicitado
      if (options.sendTyping) {
        try {
          const typingDuration = options.typingTime || 3000;
          await this.sendChatPresenceStatus(instanceName, to, 'composing', typingDuration);
          logger.info(`Status "digitando" enviado para ${to} por ${typingDuration}ms`);
        } catch (typingError) {
          logger.warn(`Erro ao enviar status "digitando": ${typingError.message}`);
          // Continua o envio mesmo se falhar o status de digitação
        }
      }
      
      const payload = {
        number: to,
        options: {
          delay: options.delay || 1200,
          presence: options.presence || "composing",
          linkPreview: options.linkPreview !== false
        }
      };
      
      // Adicionar o texto no campo correto conforme a API
      payload.text = cleanedText;
      
      console.log(`Enviando mensagem para ${to} com conteúdo: ${cleanedText.substring(0, 50)}...`);
      logger.info(`Enviando mensagem para ${to} com payload:`, payload);
      
      const response = await this.axios.post(`/message/sendText/${instanceName}`, payload);
      return response.data;
    } catch (error) {
      this._handleError(error, 'sendText');
    }
  }

  // Enviar mensagem com mídia
  async sendMedia(instanceName, to, mediaUrl, caption, mediaType, options = {}) {
    try {
      // Validação básica
      if (!mediaUrl) {
        console.error('Erro: URL de mídia não fornecida');
        logger.error('Erro: URL de mídia não fornecida');
        throw new Error('URL de mídia não fornecida');
      }

      if (!mediaType || !['image', 'video', 'audio', 'document'].includes(mediaType)) {
        console.error(`Erro: Tipo de mídia inválido: ${mediaType}`);
        logger.error(`Erro: Tipo de mídia inválido: ${mediaType}`);
        throw new Error(`Tipo de mídia inválido: ${mediaType}`);
      }
      
      // Enviar status "digitando" antes da mensagem se solicitado
      if (options.sendTyping) {
        try {
          const typingDuration = options.typingTime || 3000;
          await this.sendChatPresenceStatus(instanceName, to, 'composing', typingDuration);
          logger.info(`Status "digitando" enviado para ${to} por ${typingDuration}ms`);
        } catch (typingError) {
          logger.warn(`Erro ao enviar status "digitando": ${typingError.message}`);
          // Continua o envio mesmo se falhar o status de digitação
        }
      }
      
      const payload = {
        number: to,
        mediatype: mediaType, // image, video, audio, document
        media: mediaUrl,
        caption: caption || '',
        options: {
          delay: options.delay || 1200,
          presence: options.presence || 'composing'
        }
      };
      
      console.log(`Enviando mídia ${mediaType} para ${to}, URL: ${mediaUrl}`);
      logger.info(`Enviando mídia ${mediaType} para ${to}, URL: ${mediaUrl}`);
      
      const response = await this.axios.post(`/message/sendMedia/${instanceName}`, payload);
      return response.data;
    } catch (error) {
      this._handleError(error, 'sendMedia');
    }
  }
  
  // Obter perfil
  async getProfile(instanceName) {
    try {
      const response = await this.axios.get(`/chat/fetchProfile/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'getProfile');
    }
  }
  
  // Configurar webhook
  async configureWebhook(instanceName, webhookUrl, options = {}) {
    try {
      // Validar URL
      if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
        throw new Error('URL de webhook inválida');
      }
      
      const payload = {
        webhook: webhookUrl,
        webhook_by_events: true,
        events: options.events || [
          'MESSAGES_UPSERT',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE'
        ]
      };
      
      logger.info(`Configurando webhook para ${instanceName} com URL: ${webhookUrl}`);
      logger.info(`Eventos: ${JSON.stringify(payload.events)}`);
      
      const response = await this.axios.post(`/webhook/set/${instanceName}`, payload);
      return response.data;
    } catch (error) {
      this._handleError(error, 'configureWebhook');
    }
  }
}

module.exports = EvolutionApiService; 