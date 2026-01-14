"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// /var/www/html/EquinotesV2/backend/src/calls.ts
const express_1 = require("express");
const db_1 = require("./db");
const authMiddleware_1 = require("./authMiddleware");
const router = (0, express_1.Router)();
function mapCall(row) {
    return {
        id: row.id,
        status: row.status,
        startTime: row.start_time,
        endTime: row.end_time,
        durationSec: row.duration_sec,
        updatedAt: row.updated_at,
        clientTranscript: row.client_transcript ?? "",
        agentTranscript: row.agent_transcript ?? "",
        combinedTranscript: row.combined_transcript ?? "",
    };
}
/**
 * GET /api/calls/recent
 * Returns last 5 calls for authenticated agent.
 */
router.get("/calls/recent", authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const agentId = req.user.id;
        const [rows] = await db_1.pool.query(`
      SELECT id, status, start_time, end_time, duration_sec, updated_at,
             client_transcript, agent_transcript, combined_transcript
      FROM calls
      WHERE agent_id = ?
      ORDER BY start_time DESC
      LIMIT 5
      `, [agentId]);
        const calls = rows.map(mapCall);
        return res.json({ calls });
    }
    catch (err) {
        console.error("Error fetching recent calls:", err);
        return res.status(500).json({ error: "Failed to fetch recent calls" });
    }
});
/**
 * GET /api/calls/history?limit=50&offset=0
 * Returns paginated call history for authenticated agent.
 */
router.get("/calls/history", authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const agentId = req.user.id;
        const limitRaw = String(req.query.limit ?? "50");
        const offsetRaw = String(req.query.offset ?? "0");
        let limit = Number(limitRaw);
        let offset = Number(offsetRaw);
        if (!Number.isFinite(limit) || limit <= 0)
            limit = 50;
        if (!Number.isFinite(offset) || offset < 0)
            offset = 0;
        // hard cap to protect DB
        limit = Math.min(200, Math.floor(limit));
        offset = Math.floor(offset);
        const [rows] = await db_1.pool.query(`
      SELECT id, status, start_time, end_time, duration_sec, updated_at,
             client_transcript, agent_transcript, combined_transcript
      FROM calls
      WHERE agent_id = ?
      ORDER BY start_time DESC
      LIMIT ? OFFSET ?
      `, [agentId, limit, offset]);
        const calls = rows.map(mapCall);
        return res.json({ calls, limit, offset, count: calls.length });
    }
    catch (err) {
        console.error("Error fetching call history:", err);
        return res.status(500).json({ error: "Failed to fetch call history" });
    }
});
/**
 * POST /api/calls
 * Creates a new call row for the authenticated agent.
 */
router.post("/calls", authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const agentId = req.user.id;
        const [result] = await db_1.pool.execute(`
      INSERT INTO calls (agent_id, status, start_time)
      VALUES (?, 'active', NOW())
      `, [agentId]);
        const id = result.insertId;
        return res.status(201).json({ id });
    }
    catch (err) {
        console.error("Error creating call:", err);
        return res.status(500).json({ error: "Failed to create call" });
    }
});
/**
 * PUT /api/calls/:id
 * Updates a call (status, duration, transcripts, end_time).
 */
router.put("/calls/:id", authMiddleware_1.requireAuth, async (req, res) => {
    const callId = Number(req.params.id);
    if (!Number.isFinite(callId)) {
        return res.status(400).json({ error: "Invalid call id" });
    }
    const { status, durationSec, endTime, clientTranscript, agentTranscript, combinedTranscript } = req.body ?? {};
    const fields = [];
    const params = [];
    if (status === "saved" || status === "discarded" || status === "active") {
        fields.push("status = ?");
        params.push(status);
    }
    if (typeof durationSec === "number" && Number.isFinite(durationSec)) {
        fields.push("duration_sec = ?");
        params.push(Math.max(0, Math.round(durationSec)));
    }
    if (typeof endTime === "string" && endTime.trim().length > 0) {
        fields.push("end_time = ?");
        params.push(endTime.trim());
    }
    else if (status === "saved" || status === "discarded") {
        fields.push("end_time = IFNULL(end_time, NOW())");
    }
    if (typeof clientTranscript === "string") {
        fields.push("client_transcript = ?");
        params.push(clientTranscript);
    }
    if (typeof agentTranscript === "string") {
        fields.push("agent_transcript = ?");
        params.push(agentTranscript);
    }
    if (typeof combinedTranscript === "string") {
        fields.push("combined_transcript = ?");
        params.push(combinedTranscript);
    }
    if (fields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
    }
    fields.push("updated_at = NOW()");
    try {
        const [result] = await db_1.pool.execute(`
      UPDATE calls
      SET ${fields.join(", ")}
      WHERE id = ? AND agent_id = ?
      `, [...params, callId, req.user.id]);
        const affected = result.affectedRows;
        if (!affected)
            return res.status(404).json({ error: "Call not found" });
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("Error updating call:", err);
        return res.status(500).json({ error: "Failed to update call" });
    }
});
/**
 * POST /api/calls/:id/events
 */
router.post("/calls/:id/events", authMiddleware_1.requireAuth, async (req, res) => {
    const callId = Number(req.params.id);
    if (!Number.isFinite(callId)) {
        return res.status(400).json({ error: "Invalid call id" });
    }
    const { channel, text, seq, ts } = req.body ?? {};
    if (channel !== "client" && channel !== "agent") {
        return res.status(400).json({ error: "Invalid channel" });
    }
    if (typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ error: "Text is required" });
    }
    const seqValue = typeof seq === "number" && Number.isFinite(seq) && seq > 0 ? Math.round(seq) : 1;
    const tsValue = typeof ts === "string" && ts.trim().length > 0
        ? ts.trim()
        : new Date().toISOString().slice(0, 19).replace("T", " ");
    try {
        const [result] = await db_1.pool.execute(`
      INSERT INTO call_events (call_id, channel, seq, ts, text)
      VALUES (?, ?, ?, ?, ?)
      `, [callId, channel, seqValue, tsValue, text]);
        const id = result.insertId;
        return res.status(201).json({ id });
    }
    catch (err) {
        console.error("Error inserting call_event:", err);
        if (err && err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "Duplicate event seq for this call" });
        }
        return res.status(500).json({ error: "Failed to insert call event" });
    }
});
exports.default = router;
