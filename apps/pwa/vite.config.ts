import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.VITE_API_PROXY || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PWA_PORT) || 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
