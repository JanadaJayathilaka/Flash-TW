import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 6001,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:6002',
        changeOrigin: true,
      },
      '/graphql': {
        target: 'http://127.0.0.1:6002',
        changeOrigin: true,
      }
    }
  },
  preview: {
    port: 6001,
    host: true
  }
})
