"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORCED_MODEL = exports.WHISPER_URL = exports.DB_NAME = exports.DB_PASSWORD = exports.DB_USER = exports.DB_PORT = exports.DB_HOST = exports.JWT_EXPIRES_IN = exports.JWT_SECRET = exports.PORT = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Ensure backend/.env is loaded even when running `node dist/server.js`
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env") });
exports.PORT = Number.parseInt(process.env.PORT || "3001", 10);
const jwtSecretEnv = (process.env.JWT_SECRET || "").trim();
if (!jwtSecretEnv) {
    console.warn("WARNING: JWT_SECRET is not set. Falling back to default dev secret. Check backend/.env loading.");
}
exports.JWT_SECRET = jwtSecretEnv || "equinotes-dev-secret-change-me";
// IMPORTANT:
// Support duration strings ("7d", "24h", "12h", "60m") OR numeric seconds.
// If env is missing, default to "7d".
// NOTE: jsonwebtoken's TS types may not include duration-string literals depending on version;
// we cast safely to SignOptions["expiresIn"] after validation.
function parseJwtExpiresIn() {
    const raw = (process.env.JWT_EXPIRES_IN || "").trim();
    if (!raw)
        return "7d";
    // If it's purely numeric, treat as seconds
    if (/^\d+$/.test(raw)) {
        const n = Number.parseInt(raw, 10);
        if (Number.isFinite(n) && n > 0)
            return n;
        return "7d";
    }
    // Otherwise, pass through supported jsonwebtoken duration strings
    return raw;
}
exports.JWT_EXPIRES_IN = parseJwtExpiresIn();
exports.DB_HOST = process.env.DB_HOST || "127.0.0.1";
exports.DB_PORT = Number.parseInt(process.env.DB_PORT || "3306", 10);
exports.DB_USER = process.env.DB_USER || "developer1";
exports.DB_PASSWORD = process.env.DB_PASSWORD || "Developer@1234";
exports.DB_NAME = process.env.DB_NAME || "equinotes";
exports.WHISPER_URL = process.env.WHISPER_URL || "ws://127.0.0.1:9090";
exports.FORCED_MODEL = process.env.WHISPER_MODEL || "faster-whisper-small";
