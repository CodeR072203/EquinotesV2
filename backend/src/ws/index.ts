// /var/www/html/EquinotesV2/backend/src/ws/index.ts
import http from "http";
import { WebSocketServer } from "ws";
import { handleFrontendConnection } from "./connection";

export function attachWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => handleFrontendConnection(ws, req));
  return wss;
}
