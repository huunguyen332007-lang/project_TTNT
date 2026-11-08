import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dev: gọi /api/... sẽ được proxy sang backend Python FastAPI của nhóm.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: env.VITE_PROXY_TARGET || "http://localhost:3000", changeOrigin: true },
      },
    },
  };
});
