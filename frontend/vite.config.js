import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://18.188.166.170:5001',
        changeOrigin: true,
      },
      '/graphql': {
        target: 'http://18.188.166.170:5001',
        changeOrigin: true,
      }
    }
  }
})

