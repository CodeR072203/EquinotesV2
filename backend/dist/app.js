"use strict";
// /var/www/html/EquinotesV2/backend/src/app.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
exports.createHttpServer = createHttpServer;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = __importDefault(require("./auth"));
const calls_1 = __importDefault(require("./calls"));
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    app.use("/api", auth_1.default);
    app.use("/api", calls_1.default);
    app.get("/health", (_req, res) => {
        res.json({ ok: true, service: "equinotes-backend" });
    });
    return app;
}
/**
 * Optional helper if you want a consistent pattern in server.ts:
 * const { app, server } = createHttpServer();
 */
function createHttpServer() {
    const app = createApp();
    const server = http_1.default.createServer(app);
    return { app, server };
}
