import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mockApi } from './src/dev/mock-api.js';

export default defineConfig({
  // MOCK_API=1 serves a fake API from src/dev/mock-api.js (development only).
  plugins: [react(), process.env.MOCK_API ? mockApi() : null].filter(Boolean),
  server: {
    port: 5173,
    strictPort: true,
    headers: {
      'Referrer-Policy': 'no-referrer-when-downgrade',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    clearMocks: true,
  },
});
