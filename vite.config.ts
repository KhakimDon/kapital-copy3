import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// @ts-expect-error — dev-only mock, plain JS module
import { mockApi } from "./mock/api-plugin.mjs";

// Backend host:
//   - local dev (Docker compose):    backend:8000 (compose network)
//   - local dev (bare metal):        localhost:8000
//   - CI / build: irrelevant (vite build doesn't proxy)
// Override via VITE_BACKEND_URL if needed.
const backend = process.env.VITE_BACKEND_URL || "http://backend:8000";

export default defineConfig({
  // MOCK_API=1 → приложение целиком на тестовых данных, бэкенд не нужен.
  plugins: [react(), ...(process.env.MOCK_API ? [mockApi()] : [])],
  // Two shells, one core: index.html (desktop, tab shell) and m.html (mobile,
  // bottom-nav shell). Separate entry graphs → the mobile bundle never carries
  // the desktop-only chrome. nginx picks the entry by device (see
  // nginx-spa.conf); shared modules/stores are chunk-split automatically.
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        mobile: path.resolve(__dirname, "m.html"),
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    // Force a single React copy (guards against duplicate-React "Invalid hook
    // call" from any dep that bundles its own React).
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: true,
    port: 5173,
    // Accept any Host header — nginx (system) proxies real hostnames like
    // next.uic.aiba.uz to the dev server. Vite 5+ blocks unknown hosts by
    // default.
    allowedHosts: true,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      // Realtime tasks board socket (see modules/tasks/board-ws.ts).
      "/ws": { target: backend, changeOrigin: true, ws: true },
    },
  },
});
