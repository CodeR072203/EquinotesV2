"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// /var/www/html/EquinotesV2/backend/src/server.ts
require("dotenv/config");
const app_1 = require("./app");
const ws_1 = require("./ws");
const config_1 = require("./config");
const port = Number.isFinite(config_1.PORT) && config_1.PORT > 0
    ? config_1.PORT
    : (() => {
        console.error("Invalid PORT from config.ts:", config_1.PORT);
        process.exit(1);
    })();
const { server } = (0, app_1.createHttpServer)();
(0, ws_1.attachWebSocketServer)(server);
server.listen(port, "0.0.0.0", () => {
    const addr = server.address();
    const boundPort = typeof addr === "object" && addr && "port" in addr ? addr.port : port;
    console.log(`EquiNotes backend running at http://0.0.0.0:${boundPort}`);
    console.log(`WebSocket endpoint: ws://<server-ip>:${boundPort}/ws`);
});
