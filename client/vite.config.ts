import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const clientDir = fileURLToPath(new URL(".", import.meta.url));

const apiTarget = process.env.E2E_API_TARGET ?? "http://localhost:8787";
const appPort = Number(process.env.E2E_APP_PORT ?? 8788);

export default defineConfig({
  root: clientDir,
  plugins: [vue(), tailwindcss()],
  server: {
    port: appPort,
    proxy: {
      "/api": apiTarget,
      "/docs": apiTarget,
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
