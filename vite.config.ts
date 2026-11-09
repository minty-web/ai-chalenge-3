import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    // The credential proxy is optional: without it the browser talks to the
    // public translation endpoints directly.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {
            /* proxy offline — the client falls back to direct providers */
          });
        },
      },
    },
  },
  build: {
    target: 'es2022',
  },
});