import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const clientDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: clientDir,
  plugins: [vue(), tailwindcss()],
  server: {
    port: 8788,
    proxy: {
      "/api": "http://localhost:8787",
      "/docs": "http://localhost:8787",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
