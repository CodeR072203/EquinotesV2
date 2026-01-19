// /var/www/html/EquinotesV2/backend/src/config.ts
import type { Secret, SignOptions } from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";

// Ensure backend/.env is loaded even when running `node dist/server.js`
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const PORT = Number.parseInt(process.env.PORT || "3001", 10);

const jwtSecretEnv = (process.env.JWT_SECRET || "").trim();
if (!jwtSecretEnv) {
  console.warn(
    "WARNING: JWT_SECRET is not set. Falling back to default dev secret. Check backend/.env loading."
  );
}

export const JWT_SECRET: Secret = (jwtSecretEnv as Secret) || "equinotes-dev-secret-change-me";

// IMPORTANT:
// Support duration strings ("7d", "24h", "12h", "60m") OR numeric seconds.
// If env is missing, default to "7d".
// NOTE: jsonwebtoken's TS types may not include duration-string literals depending on version;
// we cast safely to SignOptions["expiresIn"] after validation.
function parseJwtExpiresIn(): SignOptions["expiresIn"] {
  const raw = (process.env.JWT_EXPIRES_IN || "").trim();
  if (!raw) return "7d" as unknown as SignOptions["expiresIn"];

  // If it's purely numeric, treat as seconds
  if (/^\d+$/.test(raw)) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
    return "7d" as unknown as SignOptions["expiresIn"];
  }

  // Otherwise, pass through supported jsonwebtoken duration strings
  return raw as unknown as SignOptions["expiresIn"];
}

export const JWT_EXPIRES_IN: SignOptions["expiresIn"] = parseJwtExpiresIn();

export const DB_HOST = process.env.DB_HOST || "127.0.0.1";
export const DB_PORT = Number.parseInt(process.env.DB_PORT || "3306", 10);
export const DB_USER = process.env.DB_USER || "developer1";
export const DB_PASSWORD = process.env.DB_PASSWORD || "Developer@1234";
export const DB_NAME = process.env.DB_NAME || "equinotes";

export const WHISPER_URL = process.env.WHISPER_URL || "ws://127.0.0.1:9090";
export const FORCED_MODEL = process.env.WHISPER_MODEL || "faster-whisper-small";
