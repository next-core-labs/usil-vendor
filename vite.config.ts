import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const BACKEND = process.env.USIL_API || 'http://127.0.0.1:43147';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5190,
    // Same-origin in dev, so the backend's HttpOnly `midyaf_sid` cookie
    // (SameSite=Lax) is sent with every call without any CORS setup.
    // `/uploads` is proxied too: listing photos are served from there.
    proxy: {
      '/api': BACKEND,
      '/uploads': BACKEND,
    },
  },
  preview: { host: '127.0.0.1', port: 5190 },
});
