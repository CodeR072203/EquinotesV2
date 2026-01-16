// /var/www/html/EquinotesV2/backend/src/auth.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "./db";
import { JWT_SECRET, JWT_EXPIRES_IN } from "./config";

const router = Router();

type AgentRow = {
  id: number;
  public_id: string;
  username: string;
  email: string | null;
  password_hash: string;
  is_active: number | boolean;
};

type UserRow = {
  id: number;
  email: string;
  full_name: string | null;
  password_hash: string;
  role: "user" | "admin";
  status: "pending" | "approved" | "denied";
};

function signToken(payload: {
  id: number;
  email: string | null;
  username: string;
  role: "user" | "admin";
  status: "pending" | "approved" | "denied";
}) {
  return jwt.sign(
    {
      sub: payload.id,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      status: payload.status,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// POST /api/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, username, password, fullName, full_name } = req.body as {
      email?: string;
      username?: string;
      password?: string;
      fullName?: string;
      full_name?: string;
    };

    if (!email || !username || !password) {
      return res.status(400).json({ error: "email, username and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    const displayName =
      typeof fullName === "string"
        ? fullName.trim()
        : typeof full_name === "string"
        ? full_name.trim()
        : cleanUsername;

    const [uExistingRows] = await pool.query(`SELECT id, email FROM users WHERE email = ? LIMIT 1`, [
      normalizedEmail,
    ]);
    const uExisting = (uExistingRows as any[])[0];
    if (uExisting) {
      return res.status(409).json({ error: "Email is already in use" });
    }

    const [aExistingRows] = await pool.query(`SELECT id, email FROM agents WHERE email = ? LIMIT 1`, [
      normalizedEmail,
    ]);
    const aExisting = (aExistingRows as any[])[0];
    if (aExisting) {
      return res.status(409).json({ error: "Email is already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      `INSERT INTO users (email, password_hash, full_name, role, status)
       VALUES (?, ?, ?, 'user', 'pending')`,
      [normalizedEmail, passwordHash, displayName || null]
    );

    const insertedId = (result as any).insertId as number;

    const token = signToken({
      id: insertedId,
      email: normalizedEmail,
      username: displayName || normalizedEmail,
      role: "user",
      status: "pending",
    });

    return res.status(201).json({
      token,
      user: {
        id: insertedId,
        email: normalizedEmail,
        fullName: displayName || null,
        role: "user",
        status: "pending",
      },
      message: "Account created and pending approval.",
    });
  } catch (err) {
    console.error("Error in /api/register:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [uRows] = await pool.query(
      `SELECT id, email, full_name, password_hash, role, status
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [normalizedEmail]
    );

    const u = (uRows as UserRow[])[0];
    if (u) {
      const ok = await bcrypt.compare(password, u.password_hash);
      if (!ok) return res.status(401).json({ error: "Invalid email or password" });

      if (u.status === "pending") return res.status(403).json({ error: "Account pending approval" });
      if (u.status === "denied") return res.status(403).json({ error: "Account denied" });

      const token = signToken({
        id: u.id,
        email: u.email,
        username: u.full_name || u.email,
        role: u.role,
        status: u.status,
      });

      return res.json({
        token,
        user: {
          id: u.id,
          email: u.email,
          fullName: u.full_name,
          role: u.role,
          status: u.status,
        },
      });
    }

    const [rows] = await pool.query(
      `SELECT id, public_id, username, email, password_hash, is_active
       FROM agents
       WHERE email = ?
       LIMIT 1`,
      [normalizedEmail]
    );

    const row = (rows as AgentRow[])[0];
    if (!row) return res.status(401).json({ error: "Invalid email or password" });

    const isActive = typeof row.is_active === "boolean" ? row.is_active : row.is_active === 1;
    if (!isActive) return res.status(403).json({ error: "Account is disabled" });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken({
      id: row.id,
      email: row.email,
      username: row.username,
      role: "user",
      status: "approved",
    });

    return res.json({
      token,
      agent: { publicId: row.public_id, email: row.email, username: row.username },
    });
  } catch (err) {
    console.error("Error in /api/login:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
