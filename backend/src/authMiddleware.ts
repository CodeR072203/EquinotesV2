// /var/www/html/EquinotesV2/backend/src/authMiddleware.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "./config";

export interface AuthUser {
  id: number;
  email: string | null;
  username: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}


export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const token = auth.slice("Bearer ".length).trim();

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: Number(decoded.sub),
      email: decoded.email ?? null,
      username: decoded.username,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
