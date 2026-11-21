import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // reachable from a phone on the same Wi-Fi
    proxy: { '/api': 'http://localhost:3000' },
  },
});
