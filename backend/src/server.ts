// /var/www/html/EquinotesV2/backend/src/server.ts
import path from "path";
import dotenv from "dotenv";

// Load .env from backend working directory (start node from /backend)
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { createHttpServer } from "./app";
import { attachWebSocketServer } from "./ws";
import { PORT } from "./config";

const port =
  Number.isFinite(PORT) && PORT > 0
    ? PORT
    : (() => {
        console.error("Invalid PORT from config.ts:", PORT);
        process.exit(1);
      })();

const { server } = createHttpServer();

attachWebSocketServer(server);

server.listen(port, "0.0.0.0", () => {
  const addr = server.address();
  const boundPort = typeof addr === "object" && addr && "port" in addr ? (addr as any).port : port;

  console.log(`EquiNotes backend running at http://0.0.0.0:${boundPort}`);
  console.log(`WebSocket endpoint: ws://<server-ip>:${boundPort}/ws`);
});
