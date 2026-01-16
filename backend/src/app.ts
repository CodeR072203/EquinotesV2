// /var/www/html/EquinotesV2/backend/src/app.ts
import express from "express";
import http from "http";
import cors from "cors";
import authRouter from "./auth";
import callsRouter from "./calls";
import adminRoutes from "./admin";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // IMPORTANT: mount admin routes
  app.use("/api", adminRoutes);

  app.use("/api", authRouter);
  app.use("/api", callsRouter);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "equinotes-backend" });
  });

  return app;
}

export function createHttpServer() {
  const app = createApp();
  const server = http.createServer(app);
  return { app, server };
}
