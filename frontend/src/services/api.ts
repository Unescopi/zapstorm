import axios from 'axios';

// Declaração para o objeto _env_ global
declare global {
  interface Window {
    _env_?: {
      VITE_API_URL?: string;
    };
  }
}

// Função para obter a URL da API do ambiente
const getApiUrl = () => {
  // Primeiro, tentar obter do objeto _env_ injetado em runtime
  if (window._env_ && window._env_.VITE_API_URL) {
    console.log('Usando URL da API do _env_:', window._env_.VITE_API_URL);
    return window._env_.VITE_API_URL;
  }
  
  // Caso contrário, usar a variável de ambiente do Vite ou o fallback
  const viteUrl = import.meta.env.VITE_API_URL;
  if (viteUrl) {
    console.log('Usando URL da API do Vite:', viteUrl);
    return viteUrl;
  }

  // Fallback para ambiente do Easypanel
  console.log('Usando URL da API padrão para Easypanel: http://api:3001/api');
  return 'http://api:3001/api';
};

// Obtém a URL da API
const apiUrl = getApiUrl();
console.log('URL da API final:', apiUrl);

// Configuração base do axios
const api = axios.create({
  baseURL: apiUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Log das requisições
api.interceptors.request.use(
  (config) => {
    console.log(`Enviando requisição para: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    
    const token = localStorage.getItem('@ZapStorm:token');
    if (token) {
      config.headers.common = config.headers.common || {};
      config.headers.common['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('Erro na requisição:', error);
    return Promise.reject(error);
  }
);

// Interceptor para tratamento de erros
api.interceptors.response.use(
  (response) => {
    console.log('Resposta recebida com sucesso:', response.status);
    return response;
  },
  (error) => {
    console.error('Erro na resposta:', error);
    
    if (error.response && error.response.status === 401) {
      // Token expirado ou inválido
      console.log('Token inválido ou expirado. Redirecionando para login...');
      localStorage.removeItem('@ZapStorm:token');
      localStorage.removeItem('@ZapStorm:user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api; 