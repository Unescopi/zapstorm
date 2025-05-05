import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Base URL para produção - usando '/' para garantir caminhos absolutos
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Usar formato IIFE que é mais compatível com navegadores
        format: 'iife', 
        // Garantir nomes de arquivos previsíveis
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        // Evitar código dinâmico para prevenir problemas MIME
        inlineDynamicImports: true
      }
    }
  },
  optimizeDeps: {
    exclude: ['@mui/icons-material']
  }
})
