import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  publicDir: resolve(__dirname, 'public'),
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});
