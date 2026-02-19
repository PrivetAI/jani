import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      // Chrome 69 = 69 << 16 | 0 << 8 = 4521984
      // Safari 12 = 12 << 16 | 0 << 8 = 786432
      // Firefox 62 = 62 << 16 = 4063232
      targets: {
        chrome: 69 << 16,
        safari: 12 << 16,
        firefox: 62 << 16,
        ios_saf: 12 << 16,
        android: 69 << 16,
        samsung: 10 << 16,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.VITE_DEV_SERVER_PORT ?? 4173),
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/telegram': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
