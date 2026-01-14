"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachWebSocketServer = attachWebSocketServer;
const ws_1 = require("ws");
const connection_1 = require("./connection");
function attachWebSocketServer(server) {
    const wss = new ws_1.WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (ws, req) => (0, connection_1.handleFrontendConnection)(ws, req));
    return wss;
}
