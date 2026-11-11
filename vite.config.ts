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
    // The on-device recogniser is a dynamic import, so @huggingface/transformers
    // and its onnxruntime wasm land in their own chunks that are only fetched when
    // someone switches to local mode. They are legitimately large, hence the raised
    // limit — the app's own entry chunk stays around 370 kB.
    chunkSizeWarningLimit: 800,
  },
});