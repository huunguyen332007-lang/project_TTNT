import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy `npm run dev`, mọi request /api được chuyển tiếp tới backend nên không gặp lỗi CORS.
const backend = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: backend, changeOrigin: true } } },
});
