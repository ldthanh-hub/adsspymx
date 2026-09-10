import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // Fail fast và rõ ràng thay vì để lỗi kết nối mơ hồ xuất hiện ở đâu đó sau này.
  throw new Error(
    "Thiếu biến môi trường DATABASE_URL. Kiểm tra file .env (local) hoặc secrets/env trên Render (production)."
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false }, // Supabase/Neon yêu cầu SSL
  max: 5,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  // Lỗi kết nối idle không được để crash cả process ngoài ý muốn.
  console.error("[db] lỗi pool không mong đợi:", err.message);
});
