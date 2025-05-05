import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Declaração de tipo para a propriedade window.env
// Deve ser compatível com a declaração em services/api.ts
declare global {
  interface Window {
    env?: {
      API_URL?: string;
    }
  }
}

// Inicializar env se não existir
if (!window.env) {
  window.env = {
    API_URL: import.meta.env.VITE_API_URL || '/api'
  };
}

// Log para ajudar no diagnóstico
console.log(`ZapStorm Frontend - Ambiente: ${import.meta.env.MODE}`);
console.log(`API URL: ${window.env.API_URL}`);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
