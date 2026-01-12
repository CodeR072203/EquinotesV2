import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type TokenPayload = {
  sub?: number;
  id?: number;
  email?: string | null;
  username?: string;
};

export type JwtPayload = {
  id: number;
  email: string | null;
  username: string;
};

export type AuthRequest = Request & {
  user?: JwtPayload;
};

const JWT_SECRET = process.env.JWT_SECRET || "equinotes-dev-secret-change-me";

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  const token = parts.length === 2 ? parts[1] : "";

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

    const id =
      typeof decoded.sub === "number"
        ? decoded.sub
        : typeof decoded.id === "number"
          ? decoded.id
          : NaN;

    if (!Number.isFinite(id)) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    req.user = {
      id,
      email: decoded.email ?? null,
      username: decoded.username ?? "",
    };

    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
