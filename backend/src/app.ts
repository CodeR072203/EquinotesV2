// /var/www/html/EquinotesV2/backend/src/app.ts

import express from "express";
import http from "http";
import cors from "cors";
import authRouter from "./auth";
import callsRouter from "./calls";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api", authRouter);
  app.use("/api", callsRouter);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "equinotes-backend" });
  });

  return app;
}

/**
 * Optional helper if you want a consistent pattern in server.ts:
 * const { app, server } = createHttpServer();
 */
export function createHttpServer() {
  const app = createApp();
  const server = http.createServer(app);
  return { app, server };
}
