import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "./db";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "equinotes-dev-secret-change-me";
const JWT_EXPIRES_IN = "12h";

type AgentRow = {
  id: number; // internal numeric id
  public_id: string; // public UUID
  username: string;
  email: string | null;
  password_hash: string;
  is_active: number | boolean;
};

function signToken(agent: { id: number; email: string | null; username: string }) {
  return jwt.sign(
    { sub: agent.id, email: agent.email, username: agent.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// POST /api/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, username, password } = req.body as {
      email?: string;
      username?: string;
      password?: string;
    };

    if (!email || !username || !password) {
      return res.status(400).json({ error: "email, username and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const [existingRows] = await pool.query(
      `SELECT id, email, username FROM agents WHERE email = ? OR username = ? LIMIT 1`,
      [email, username]
    );

    const existing = (existingRows as any[])[0];
    if (existing) {
      if (existing.email === email) return res.status(409).json({ error: "Email is already in use" });
      if (existing.username === username) return res.status(409).json({ error: "Username is already in use" });
      return res.status(409).json({ error: "Account already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert with UUID public_id
    const [result] = await pool.execute(
      `INSERT INTO agents (public_id, username, email, email_verified, password_hash, is_active)
       VALUES (UUID(), ?, ?, 0, ?, 1)`,
      [username, email, passwordHash]
    );

    const insertedId = (result as any).insertId as number;

    // Fetch public_id for response
    const [rows] = await pool.query(
      `SELECT id, public_id, username, email FROM agents WHERE id = ? LIMIT 1`,
      [insertedId]
    );

    const row = (rows as AgentRow[])[0];
    if (!row) {
      return res.status(500).json({ error: "Failed to load created account" });
    }

    const token = signToken({ id: row.id, email: row.email, username: row.username });

    return res.status(201).json({
      token,
      agent: { publicId: row.public_id, email: row.email, username: row.username },
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

    const [rows] = await pool.query(
      `SELECT id, public_id, username, email, password_hash, is_active
       FROM agents
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    const row = (rows as AgentRow[])[0];
    if (!row) return res.status(401).json({ error: "Invalid email or password" });

    const isActive = typeof row.is_active === "boolean" ? row.is_active : row.is_active === 1;
    if (!isActive) return res.status(403).json({ error: "Account is disabled" });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken({ id: row.id, email: row.email, username: row.username });

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
