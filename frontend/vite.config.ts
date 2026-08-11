import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

const useHttps = process.env.DEV_HTTPS === "true";

export default defineConfig({
  plugins: [
    react(),
    // Make the basicSsl plugin optional so developers can run HTTP locally
    // without dealing with a self-signed cert. Set DEV_HTTPS=true to opt-in.
    ...(useHttps ? [basicSsl()] : []),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "KhetSmart",
        short_name: "KhetSmart",
        description: "Agri-FinTech for West Bengal potato farmers",
        theme_color: "#1a3d2e",
        background_color: "#f5f0e6",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
