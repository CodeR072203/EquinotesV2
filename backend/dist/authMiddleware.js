"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("./config");
function signToken(user) {
    return jsonwebtoken_1.default.sign({ sub: user.id, email: user.email, username: user.username }, config_1.JWT_SECRET, { expiresIn: config_1.JWT_EXPIRES_IN });
}
function requireAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing Authorization header" });
    }
    const token = auth.slice("Bearer ".length).trim();
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.JWT_SECRET);
        req.user = {
            id: Number(decoded.sub),
            email: decoded.email ?? null,
            username: decoded.username,
        };
        next();
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
