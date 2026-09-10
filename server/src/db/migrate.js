// Chạy schema.sql lên database. Idempotent (dùng CREATE TABLE IF NOT EXISTS),
// nên chạy lại nhiều lần không gây lỗi.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("[migrate] Đã áp dụng schema.sql thành công.");
  } catch (err) {
    console.error("[migrate] Lỗi khi chạy schema:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
