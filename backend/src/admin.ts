// /var/www/html/EquinotesV2/backend/src/admin.ts
import { Router, Request, Response } from "express";
import { requireAuth } from "./authMiddleware";
import { pool } from "./db";
import crypto from "crypto";

const router = Router();

async function ensureAdmin(req: Request, res: Response): Promise<boolean> {
  const userId = Number((req as any).user?.id);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  const [rows] = await pool.query(`SELECT role FROM users WHERE id=? LIMIT 1`, [userId]);
  const role = (rows as any[])[0]?.role;

  if (role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }

  return true;
}

function deriveUsernameFromEmail(email: string): string {
  const base = email.split("@")[0] || "agent";
  // Keep it simple/safe for DB constraints: lowercase, alnum/._-, trim length
  return base.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 50) || "agent";
}

router.get("/admin/users/pending", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!(await ensureAdmin(req, res))) return;

    const [rows] = await pool.query(
      `SELECT id, email, full_name, status, role, created_at
       FROM users
       WHERE status='pending'
       ORDER BY created_at ASC`
    );

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to load pending users." });
  }
});

// List all users (approved/denied/pending) so admin can manage denied accounts too
router.get("/admin/users", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!(await ensureAdmin(req, res))) return;

    const [rows] = await pool.query(
      `SELECT id, email, full_name, status, role, created_at, approved_at, denied_at, denied_reason
       FROM users
       ORDER BY created_at DESC`
    );

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to load users." });
  }
});

router.post("/admin/users/:id/approve", requireAuth, async (req: Request, res: Response) => {
  const adminId = Number((req as any).user?.id);
  const userId = Number(req.params.id);

  try {
    if (!(await ensureAdmin(req, res))) return;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [r1] = await conn.query(
        `UPDATE users
         SET status='approved', approved_at=NOW(), denied_at=NULL, denied_reason=NULL
         WHERE id=? AND status='pending'`,
        [userId]
      );

      const affected = (r1 as any).affectedRows ?? 0;
      if (!affected) {
        await conn.rollback();
        return res.status(400).json({ error: "User is not pending or not found." });
      }

      // Create/activate agent record for the approved user
      const [urows] = await conn.query(
        `SELECT email, full_name, password_hash
         FROM users
         WHERE id=? LIMIT 1`,
        [userId]
      );

      const user = (urows as any[])[0];
      if (!user?.email || !user?.password_hash) {
        await conn.rollback();
        return res.status(500).json({ error: "Approve failed." });
      }

      const email: string = String(user.email);
      const fullName: string | null = user.full_name !== undefined && user.full_name !== null ? String(user.full_name) : null;
      const passwordHash: string = String(user.password_hash);

      const username = deriveUsernameFromEmail(email);
      const displayName = fullName;

      // If agent already exists for this email, just ensure it's active and sync display/password.
      const [arows] = await conn.query(`SELECT id FROM agents WHERE email=? LIMIT 1`, [email]);
      const existingAgentId = (arows as any[])[0]?.id as number | undefined;

      if (existingAgentId) {
        await conn.query(
          `UPDATE agents
           SET username=?, display_name=?, password_hash=?, is_active=1, updated_at=NOW()
           WHERE id=?`,
          [username, displayName, passwordHash, existingAgentId]
        );
      } else {
        const publicId = crypto.randomUUID();
        await conn.query(
          `INSERT INTO agents (username, display_name, email, email_verified, password_hash, is_active, public_id)
           VALUES (?, ?, ?, 1, ?, 1, ?)`,
          [username, displayName, email, passwordHash, publicId]
        );
      }

      await conn.query(
        `INSERT INTO user_verification_events (user_id, admin_user_id, action, reason)
         VALUES (?, ?, 'approved', NULL)`,
        [userId, adminId]
      );

      await conn.commit();
      res.json({ ok: true });
    } catch {
      await conn.rollback();
      res.status(500).json({ error: "Approve failed." });
    } finally {
      conn.release();
    }
  } catch {
    res.status(500).json({ error: "Approve failed." });
  }
});

router.post("/admin/users/:id/deny", requireAuth, async (req: Request, res: Response) => {
  const adminId = Number((req as any).user?.id);
  const userId = Number(req.params.id);
  const reason =
    typeof (req as any).body?.reason === "string" ? (req as any).body.reason.trim().slice(0, 255) : null;

  try {
    if (!(await ensureAdmin(req, res))) return;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [r1] = await conn.query(
        `UPDATE users
         SET status='denied', denied_at=NOW(), denied_reason=?
         WHERE id=? AND status='pending'`,
        [reason, userId]
      );

      const affected = (r1 as any).affectedRows ?? 0;
      if (!affected) {
        await conn.rollback();
        return res.status(400).json({ error: "User is not pending or not found." });
      }

      await conn.query(
        `INSERT INTO user_verification_events (user_id, admin_user_id, action, reason)
         VALUES (?, ?, 'denied', ?)`,
        [userId, adminId, reason]
      );

      await conn.commit();
      res.json({ ok: true });
    } catch {
      await conn.rollback();
      res.status(500).json({ error: "Deny failed." });
    } finally {
      conn.release();
    }
  } catch {
    res.status(500).json({ error: "Deny failed." });
  }
});

router.delete("/admin/users/:id", requireAuth, async (req: Request, res: Response) => {
  const adminId = Number((req as any).user?.id);
  const userId = Number(req.params.id);

  try {
    if (!(await ensureAdmin(req, res))) return;

    if (!userId) return res.status(400).json({ error: "Invalid user id." });
    if (adminId === userId) return res.status(400).json({ error: "You cannot delete your own admin account." });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Ensure target exists
      const [urows] = await conn.query(`SELECT id FROM users WHERE id=? LIMIT 1`, [userId]);
      if (!(urows as any[])[0]?.id) {
        await conn.rollback();
        return res.status(404).json({ error: "User not found." });
      }

      // Best-effort: remove dependent rows first (prevents FK constraint failures if present)
      await conn.query(`DELETE FROM user_verification_events WHERE user_id=?`, [userId]);

      const [r1] = await conn.query(`DELETE FROM users WHERE id=?`, [userId]);
      const affected = (r1 as any).affectedRows ?? 0;

      if (!affected) {
        await conn.rollback();
        return res.status(404).json({ error: "User not found." });
      }

      await conn.commit();
      res.json({ ok: true });
    } catch {
      await conn.rollback();
      res.status(500).json({ error: "Delete failed." });
    } finally {
      conn.release();
    }
  } catch {
    res.status(500).json({ error: "Delete failed." });
  }
});

/**
 * Admin: Agents
 * - List agents
 * - Toggle agent active status
 */

router.get("/admin/agents", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!(await ensureAdmin(req, res))) return;

    const [rows] = await pool.query(
      `SELECT id, username, display_name, email, email_verified, is_active, created_at, updated_at, public_id
       FROM agents
       ORDER BY created_at ASC`
    );

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to load agents." });
  }
});

router.patch("/admin/agents/:id/active", requireAuth, async (req: Request, res: Response) => {
  const agentId = Number(req.params.id);
  const isActive = typeof (req as any).body?.is_active === "boolean" ? (req as any).body.is_active : null;

  try {
    if (!(await ensureAdmin(req, res))) return;

    if (!agentId) return res.status(400).json({ error: "Invalid agent id." });
    if (isActive === null) return res.status(400).json({ error: "Missing is_active boolean." });

    const [r1] = await pool.query(`UPDATE agents SET is_active=?, updated_at=NOW() WHERE id=?`, [
      isActive ? 1 : 0,
      agentId,
    ]);

    const affected = (r1 as any).affectedRows ?? 0;
    if (!affected) return res.status(404).json({ error: "Agent not found." });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update agent." });
  }
});

export default router;
