// /var/www/html/EquinotesV2/backend/seed-admin.ts
//
// Seeds (creates or updates) an approved admin user:
//
// Name: EquinotesAdmin
// Email: admin1@equinotes.com
// Password: admin1234!@#$
//
// Run:
//   DB_PASSWORD='your_mysql_password' npx ts-node seed-admin.ts
//
// Notes:
// - requires: mysql2, bcryptjs, @types/node (dev), ts-node (already used in your project)

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const ADMIN_NAME = "EquinotesAdmin";
const ADMIN_EMAIL = "admin1@equinotes.com";
const ADMIN_PASSWORD = "admin1234!@#$";

const DB_HOST = process.env.DB_HOST ?? "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT ?? "3306");
const DB_USER = process.env.DB_USER ?? "developer1";
const DB_PASSWORD = process.env.DB_PASSWORD ?? "";
const DB_NAME = process.env.DB_NAME ?? "equinotes";

async function main() {
  if (!DB_PASSWORD) {
    console.error(
      "DB_PASSWORD is empty.\nRun like:\n  DB_PASSWORD='YOURPASS' npx ts-node seed-admin.ts"
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  try {
    // Ensure users table exists
    const [tables] = await conn.execute<any[]>("SHOW TABLES LIKE 'users'");
    if (!Array.isArray(tables) || tables.length === 0) {
      throw new Error(
        "Table 'users' does not exist. Create it first (users table with role/status)."
      );
    }

    const password_hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

    // Check if exists
    const [existingRows] = await conn.execute<any[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [ADMIN_EMAIL]
    );

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      const id = existingRows[0].id as number;

      await conn.execute(
        `UPDATE users
         SET full_name = ?,
             password_hash = ?,
             role = 'admin',
             status = 'approved',
             approved_at = COALESCE(approved_at, NOW()),
             denied_at = NULL,
             denied_reason = NULL
         WHERE id = ?`,
        [ADMIN_NAME, password_hash, id]
      );

      console.log(`✅ Updated admin: ${ADMIN_EMAIL} (id=${id})`);
    } else {
      const [res] = await conn.execute<any>(
        `INSERT INTO users (email, password_hash, full_name, role, status, approved_at)
         VALUES (?, ?, ?, 'admin', 'approved', NOW())`,
        [ADMIN_EMAIL, password_hash, ADMIN_NAME]
      );

      const id = res?.insertId;
      console.log(`✅ Created admin: ${ADMIN_EMAIL} (id=${id})`);
    }

    const [finalRows] = await conn.execute<any[]>(
      `SELECT id, email, full_name, role, status, created_at, approved_at
       FROM users WHERE email = ? LIMIT 1`,
      [ADMIN_EMAIL]
    );

    console.log("Admin row:", finalRows?.[0]);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("❌ seed-admin failed:", err);
  process.exit(1);
});
