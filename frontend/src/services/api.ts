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
    return window._env_.VITE_API_URL;
  }
  
  // Caso contrário, usar a variável de ambiente do Vite ou o fallback
  return import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
};

// Configuração base do axios
const api = axios.create({
  baseURL: getApiUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar o token de autenticação
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('@ZapStorm:token');
    if (token) {
      config.headers.common = config.headers.common || {};
      config.headers.common['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratamento de erros
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expirado ou inválido
      localStorage.removeItem('@ZapStorm:token');
      localStorage.removeItem('@ZapStorm:user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api; 