import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
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
    minify: true,
    rollupOptions: {
      output: {
        // Forçar todos os chunks de JS a terem a extensão .js
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Forçar o formato CommonJS em vez de ES modules
        format: 'cjs'
      }
    }
  },
  optimizeDeps: {
    exclude: ['@mui/icons-material']
  }
})
