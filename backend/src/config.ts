// /var/www/html/EquinotesV2/backend/src/config.ts
import type { Secret, SignOptions } from "jsonwebtoken";

export const PORT = Number.parseInt(process.env.PORT || "3001", 10);

const jwtSecretEnv = (process.env.JWT_SECRET || "").trim();
if (!jwtSecretEnv) {
  console.warn(
    "WARNING: JWT_SECRET is not set. Falling back to default dev secret. Check backend/.env loading."
  );
}

export const JWT_SECRET: Secret = (jwtSecretEnv as Secret) || "equinotes-dev-secret-change-me";

// IMPORTANT:
// Force numeric seconds for jsonwebtoken expiresIn to avoid "12h" string issues.
// If env is missing or invalid, default to 43200 (12 hours).
function parseJwtExpiresInSeconds(): number {
  const raw = (process.env.JWT_EXPIRES_IN || "").trim();
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return 43200;
}

export const JWT_EXPIRES_IN: SignOptions["expiresIn"] = parseJwtExpiresInSeconds();

export const DB_HOST = process.env.DB_HOST || "127.0.0.1";
export const DB_PORT = Number.parseInt(process.env.DB_PORT || "3306", 10);
export const DB_USER = process.env.DB_USER || "developer1";
export const DB_PASSWORD = process.env.DB_PASSWORD || "Developer@1234";
export const DB_NAME = process.env.DB_NAME || "equinotes";

export const WHISPER_URL = process.env.WHISPER_URL || "ws://127.0.0.1:9090";
export const FORCED_MODEL = process.env.WHISPER_MODEL || "faster-whisper-small";
