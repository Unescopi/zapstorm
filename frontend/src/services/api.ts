import axios from 'axios';

// Declaração para o objeto env global
// Deve ser compatível com a declaração em main.tsx
declare global {
  interface Window {
    env?: {
      API_URL?: string;
    };
    _env_?: {
      VITE_API_URL?: string;
    };
  }
}

// Função para obter a URL da API do ambiente
const getApiUrl = () => {
  // Verificar se estamos em ambiente de produção ou desenvolvimento
  const isProduction = import.meta.env.PROD;
  
  // Em produção, usar caminho relativo para evitar problemas de CORS
  if (isProduction) {
    console.log('Ambiente de produção: usando caminho relativo /api');
    return '/api';
  }
  
  // Em desenvolvimento, tentar obter do objeto env ou _env_ injetado em runtime
  if (window.env && window.env.API_URL) {
    console.log('Usando URL da API de window.env:', window.env.API_URL);
    return window.env.API_URL;
  }
  
  if (window._env_ && window._env_.VITE_API_URL) {
    console.log('Usando URL da API de window._env_:', window._env_.VITE_API_URL);
    return window._env_.VITE_API_URL;
  }
  
  // Caso contrário, usar a variável de ambiente do Vite
  const viteUrl = import.meta.env.VITE_API_URL;
  if (viteUrl) {
    console.log('Usando URL da API das variáveis de ambiente Vite:', viteUrl);
    return viteUrl;
  }

  // Fallback para localhost
  console.log('Usando URL da API padrão para desenvolvimento: http://localhost:3001/api');
  return 'http://localhost:3001/api';
};

// Obtém a URL da API
const apiUrl = getApiUrl();
console.log('URL da API final:', apiUrl);

// Configuração base do axios
const api = axios.create({
  baseURL: apiUrl,
  timeout: 15000, // Aumentado para 15 segundos para evitar timeouts
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
    // Log detalhado do erro para ajudar no diagnóstico
    console.error('Erro na requisição API:', error);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Dados:', error.response.data);
      
      if (error.response.status === 401) {
        // Token expirado ou inválido
        console.log('Token expirado ou inválido. Redirecionando para login...');
        localStorage.removeItem('@ZapStorm:token');
        localStorage.removeItem('@ZapStorm:user');
        window.location.href = '/login';
      }
    } else if (error.request) {
      // A requisição foi feita mas não houve resposta
      console.error('Sem resposta do servidor:', error.request);
    }
    
    return Promise.reject(error);
  }
);

export default api; 