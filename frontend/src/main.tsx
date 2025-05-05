import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Declaração de tipo para a propriedade window.env
declare global {
  interface Window {
    env: {
      API_URL: string;
    }
  }
}

// Verificar se já temos as variáveis de ambiente injetadas
// Caso contrário, usar as definidas no build
if (!window.env) {
  window.env = {
    API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
