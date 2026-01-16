// /var/www/html/EquinotesV2/backend/src/admin.ts
import { Router, Request, Response } from "express";
import { requireAuth } from "./authMiddleware";
import { pool } from "./db";

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

export default router;
