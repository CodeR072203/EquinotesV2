// /var/www/html/EquinotesV2/frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 444,
    strictPort: true,
    https: {
      key: fs.readFileSync("localhost.key"),
      cert: fs.readFileSync("localhost.crt"),
    },
    proxy: {
      "/api": {
        target: "http://10.10.1.243:3001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://10.10.1.243:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://10.10.1.243:3001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
