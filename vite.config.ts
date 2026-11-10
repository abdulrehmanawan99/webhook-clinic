import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { apiBase, uiPort } from "./server/config";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: uiPort,
    strictPort: true,
    proxy: { "/api": apiBase },
  },
});
