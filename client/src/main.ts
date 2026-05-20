import { createApp } from "vue";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "./App.vue";
import "./style.css";

createApp(App).use(createPinia()).use(VueQueryPlugin).mount("#app");

// Register the service worker so the app is installable as a PWA and
// keeps working briefly offline. Skip during local Vite dev so we don't
// cache stale modules while iterating.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[sw] registration failed", err));
  });
}
