"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
// /var/www/html/EquinotesV2/backend/src/db.ts
const promise_1 = __importDefault(require("mysql2/promise"));
const config_1 = require("./config");
exports.pool = promise_1.default.createPool({
    host: config_1.DB_HOST,
    port: config_1.DB_PORT,
    user: config_1.DB_USER,
    password: config_1.DB_PASSWORD,
    database: config_1.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});
