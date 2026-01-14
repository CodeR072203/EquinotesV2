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
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:3001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
