"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORCED_MODEL = exports.WHISPER_URL = exports.DB_NAME = exports.DB_PASSWORD = exports.DB_USER = exports.DB_PORT = exports.DB_HOST = exports.JWT_EXPIRES_IN = exports.JWT_SECRET = exports.PORT = void 0;
exports.PORT = Number.parseInt(process.env.PORT || "3001", 10);
exports.JWT_SECRET = process.env.JWT_SECRET || "equinotes-dev-secret-change-me";
// IMPORTANT:
// Force numeric seconds for jsonwebtoken expiresIn to avoid "12h" string issues.
// If env is missing or invalid, default to 43200 (12 hours).
function parseJwtExpiresInSeconds() {
    const raw = (process.env.JWT_EXPIRES_IN || "").trim();
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0)
        return n;
    return 43200;
}
exports.JWT_EXPIRES_IN = parseJwtExpiresInSeconds();
exports.DB_HOST = process.env.DB_HOST || "127.0.0.1";
exports.DB_PORT = Number.parseInt(process.env.DB_PORT || "3306", 10);
exports.DB_USER = process.env.DB_USER || "developer1";
exports.DB_PASSWORD = process.env.DB_PASSWORD || "Developer@1234";
exports.DB_NAME = process.env.DB_NAME || "equinotes";
exports.WHISPER_URL = process.env.WHISPER_URL || "ws://127.0.0.1:9090";
exports.FORCED_MODEL = process.env.WHISPER_MODEL || "faster-whisper-small";
