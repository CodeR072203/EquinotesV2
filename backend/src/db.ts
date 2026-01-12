import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "developer1",      // <-- adjust to your actual user
  password: process.env.DB_PASSWORD || "Developer@1234", // <-- adjust to your actual password
  database: process.env.DB_NAME || "equinotes",        // <-- adjust to your DB name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
