// /var/www/html/EquinotesV2/backend/src/db.ts
import mysql from "mysql2/promise";
import { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } from "./config";

export const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
