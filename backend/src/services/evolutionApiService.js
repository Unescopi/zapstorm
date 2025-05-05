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

  // Método auxiliar para lidar com erros
  _handleError(error, method) {
    console.error(`Erro ao chamar API Evolution (${method}):`, error.message);
    logger.error(`Erro ao chamar API Evolution (${method}):`, error);
    
    if (error.response) {
      // A requisição foi feita e o servidor respondeu com status diferente de 2xx
      console.error(`Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      logger.error(`Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      throw new Error(`Erro na API Evolution (${error.response.status}): ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // A requisição foi feita mas não houve resposta
      console.error('Sem resposta do servidor');
      logger.error('Sem resposta do servidor');
      throw new Error('Servidor da API Evolution não respondeu');
    } else {
      // Erro na configuração da requisição
      throw error;
    }
  }

  // Obter instâncias
  async fetchInstances() {
    try {
      const response = await this.axios.get('/instance/fetchInstances');
      return response.data;
    } catch (error) {
      this._handleError(error, 'fetchInstances');
    }
  }
  
  // Método estático para obter instâncias utilizando as variáveis de ambiente
  static async getAllInstances() {
    try {
      const apiUrl = process.env.EVOLUTION_API_URL;
      const apiToken = process.env.EVOLUTION_API_TOKEN;
      
      if (!apiUrl || !apiToken) {
        console.error('Variáveis de ambiente EVOLUTION_API_URL e EVOLUTION_API_TOKEN não configuradas');
        throw new Error('Variáveis de ambiente EVOLUTION_API_URL e EVOLUTION_API_TOKEN não configuradas');
      }
      
      console.log(`Conectando à Evolution API em: ${apiUrl}`);
      console.log(`Usando token: ${apiToken.substring(0, 8)}...`);
      logger.info(`Conectando à Evolution API em: ${apiUrl}`);
      logger.info(`Usando token: ${apiToken.substring(0, 8)}...`);
      
      const apiClient = axios.create({
        baseURL: apiUrl,
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiToken
        },
        timeout: 30000
      });
      
      console.log('Enviando requisição para /instance/fetchInstances');
      logger.info('Enviando requisição para /instance/fetchInstances');
      const response = await apiClient.get('/instance/fetchInstances');
      
      console.log(`Resposta recebida com status: ${response.status}`);
      console.log(`Resposta completa: ${JSON.stringify(response.data, null, 2)}`);
      logger.info(`Resposta recebida com status: ${response.status}`);
      logger.info(`Resposta completa: ${JSON.stringify(response.data, null, 2)}`);
      
      // Verificar formato da resposta
      if (!response.data) {
        console.error('Resposta vazia da Evolution API');
        logger.error('Resposta vazia da Evolution API');
        throw new Error('Resposta vazia da Evolution API');
      }
      
      // A API Evolution pode retornar diretamente um array ou um objeto com propriedade 'instances'
      let instances;
      if (Array.isArray(response.data)) {
        console.log(`A resposta é um array com ${response.data.length} instâncias`);
        logger.info(`A resposta é um array com ${response.data.length} instâncias`);
        instances = response.data;
      } else if (response.data.instances && Array.isArray(response.data.instances)) {
        console.log(`A resposta tem uma propriedade 'instances' com ${response.data.instances.length} instâncias`);
        logger.info(`A resposta tem uma propriedade 'instances' com ${response.data.instances.length} instâncias`);
        instances = response.data.instances;
      } else {
        console.log('A resposta não está em um formato esperado. Tentando tratar como um objeto único');
        logger.info('A resposta não está em um formato esperado. Tentando tratar como um objeto único');
        // Talvez seja apenas uma instância retornada como objeto
        instances = [response.data];
      }
      
      // Log da estrutura da primeira instância (se existir)
      if (instances.length > 0) {
        console.log(`Exemplo da primeira instância: ${JSON.stringify(instances[0], null, 2)}`);
        logger.info(`Exemplo da primeira instância: ${JSON.stringify(instances[0], null, 2)}`);
      }
      
      return { instances };
    } catch (error) {
      console.error('Erro ao buscar instâncias da Evolution API:', error.message);
      logger.error('Erro ao buscar instâncias da Evolution API:', error);
      if (error.response) {
        console.error(`Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        logger.error(`Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  // Conectar instância
  async connectInstance(instanceName) {
    try {
      const response = await this.axios.get(`/instance/connect/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'connectInstance');
    }
  }

  // Verificar estado da conexão
  async connectionState(instanceName) {
    try {
      const response = await this.axios.get(`/instance/connectionState/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'connectionState');
    }
  }

  // Desconectar instância
  async logoutInstance(instanceName) {
    try {
      const response = await this.axios.delete(`/instance/logout/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'logoutInstance');
    }
  }

  // Enviar mensagem de texto
  async sendText(instanceName, to, text) {
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
      
      const payload = {
        number: to,
        options: {
          delay: 1200,
          presence: "composing",
          linkPreview: true
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
  async sendMedia(instanceName, to, mediaUrl, caption, mediaType) {
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
      
      const payload = {
        number: to,
        mediatype: mediaType, // image, video, audio, document
        media: mediaUrl,
        caption: caption || '',
        options: {
          delay: 1200,
          presence: 'composing'
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

  // Criar nova instância
  async createInstance(instanceName) {
    try {
      const payload = {
        instanceName
      };
      
      const response = await this.axios.post('/instance/create', payload);
      return response.data;
    } catch (error) {
      this._handleError(error, 'createInstance');
    }
  }

  // Deletar instância
  async deleteInstance(instanceName) {
    try {
      const response = await this.axios.delete(`/instance/delete/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'deleteInstance');
    }
  }

  // Reiniciar instância
  async restartInstance(instanceName) {
    try {
      const response = await this.axios.put(`/instance/restart/${instanceName}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'restartInstance');
    }
  }
}

module.exports = EvolutionApiService; 