"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("./db");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || "equinotes-dev-secret-change-me";
const JWT_EXPIRES_IN = "12h";
function signToken(agent) {
    return jsonwebtoken_1.default.sign({ sub: agent.id, email: agent.email, username: agent.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
// POST /api/register
router.post("/register", async (req, res) => {
    try {
        const { email, username, password } = req.body;
        if (!email || !username || !password) {
            return res.status(400).json({ error: "email, username and password are required" });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }
        const [existingRows] = await db_1.pool.query(`SELECT id, email, username FROM agents WHERE email = ? OR username = ? LIMIT 1`, [email, username]);
        const existing = existingRows[0];
        if (existing) {
            if (existing.email === email)
                return res.status(409).json({ error: "Email is already in use" });
            if (existing.username === username)
                return res.status(409).json({ error: "Username is already in use" });
            return res.status(409).json({ error: "Account already exists" });
        }
        const passwordHash = await bcrypt_1.default.hash(password, 10);
        // Insert with UUID public_id
        const [result] = await db_1.pool.execute(`INSERT INTO agents (public_id, username, email, email_verified, password_hash, is_active)
       VALUES (UUID(), ?, ?, 0, ?, 1)`, [username, email, passwordHash]);
        const insertedId = result.insertId;
        // Fetch public_id for response
        const [rows] = await db_1.pool.query(`SELECT id, public_id, username, email FROM agents WHERE id = ? LIMIT 1`, [insertedId]);
        const row = rows[0];
        if (!row) {
            return res.status(500).json({ error: "Failed to load created account" });
        }
        const token = signToken({ id: row.id, email: row.email, username: row.username });
        return res.status(201).json({
            token,
            agent: { publicId: row.public_id, email: row.email, username: row.username },
        });
    }
    catch (err) {
        console.error("Error in /api/register:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "email and password are required" });
        }
        const [rows] = await db_1.pool.query(`SELECT id, public_id, username, email, password_hash, is_active
       FROM agents
       WHERE email = ?
       LIMIT 1`, [email]);
        const row = rows[0];
        if (!row)
            return res.status(401).json({ error: "Invalid email or password" });
        const isActive = typeof row.is_active === "boolean" ? row.is_active : row.is_active === 1;
        if (!isActive)
            return res.status(403).json({ error: "Account is disabled" });
        const ok = await bcrypt_1.default.compare(password, row.password_hash);
        if (!ok)
            return res.status(401).json({ error: "Invalid email or password" });
        const token = signToken({ id: row.id, email: row.email, username: row.username });
        return res.json({
            token,
            agent: { publicId: row.public_id, email: row.email, username: row.username },
        });
    }
    catch (err) {
        console.error("Error in /api/login:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});
exports.default = router;
