import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const allowedHost = process.env.VITE_WS_URL;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['localhost', ...(allowedHost ? [allowedHost] : [])],
  },
});
