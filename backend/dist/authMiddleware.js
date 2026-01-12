"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || "equinotes-dev-secret-change-me";
function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const parts = header.split(" ");
    const token = parts.length === 2 ? parts[1] : "";
    if (!token) {
        return res.status(401).json({ error: "Missing Authorization header" });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const id = typeof decoded.sub === "number"
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
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
