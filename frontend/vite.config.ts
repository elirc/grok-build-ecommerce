import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const local = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: Number(local.WEB_PORT || 5176),
      strictPort: true,
      proxy: {
        "/api": {
          target: local.API_PROXY_TARGET || "http://127.0.0.1:4003",
          changeOrigin: false,
        },
      },
    },
    preview: {
      host: "127.0.0.1",
      port: Number(local.WEB_PORT || 5176),
      strictPort: true,
      proxy: {
        "/api": {
          target: local.API_PROXY_TARGET || "http://127.0.0.1:4003",
          changeOrigin: false,
        },
      },
    },
  };
});
