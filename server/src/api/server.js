// API chỉ đọc (read-only) cho dashboard. Nguyên tắc bảo mật áp dụng trong file này:
// 1. Chỉ có route GET — không route nào ghi/xóa dữ liệu được public, nên không có
//    bề mặt tấn công kiểu injection qua input ghi dữ liệu.
// 2. Toàn bộ query đều dùng parameterized query ($1, $2...) — KHÔNG BAO GIỜ nối chuỗi SQL.
// 3. Input được validate bằng zod trước khi chạm tới DB.
// 4. helmet() set các security header mặc định, cors() giới hạn đúng domain frontend.
// 5. rate limit để tránh bị dò quét/DDoS đơn giản trên free tier vốn tài nguyên hạn chế.
// 6. Error handler tập trung — KHÔNG BAO GIỜ trả stack trace / chi tiết lỗi DB ra client.

import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db/pool.js";

const app = express();
app.set("trust proxy", 1); // cần thiết khi chạy sau reverse proxy của Render/Railway

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || false, // false = chặn tất cả nếu chưa cấu hình, an toàn hơn để "*"
    methods: ["GET"],
  })
);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 60 request/phút/IP — đủ cho 1 dashboard nội bộ, chặn được dò quét thô
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const listQuerySchema = z.object({
  keyword: z.string().max(100).optional(),
  page_name: z.string().max(200).optional(),
  active_only: z.enum(["true", "false"]).optional(),
  min_days_active: z.coerce.number().int().min(0).max(3650).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/ads", async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Tham số không hợp lệ", details: parsed.error.issues });
    }
    const { keyword, page_name, active_only, min_days_active, limit, offset } = parsed.data;

    const conditions = [];
    const values = [];

    if (keyword) {
      values.push(keyword);
      conditions.push(`keyword = $${values.length}`);
    }
    if (page_name) {
      values.push(`%${page_name}%`);
      conditions.push(`page_name ILIKE $${values.length}`);
    }
    if (active_only === "true") {
      conditions.push(`is_active = true`);
    }
    if (min_days_active !== undefined) {
      values.push(min_days_active);
      conditions.push(`days_active >= $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(limit);
    values.push(offset);

    const { rows } = await pool.query(
      `SELECT ad_id, page_id, page_name, keyword, creative_text, creative_title,
              snapshot_url, platforms, delivery_start_date, delivery_stop_date,
              is_active, days_active, likes_count, comments_count, shares_count,
              video_views, engagement_parse_ok, first_seen_at, last_seen_at
       FROM ads
       ${where}
       ORDER BY days_active DESC NULLS LAST, last_seen_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    res.json({ data: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

app.get("/api/keywords", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT keyword, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active
       FROM ads GROUP BY keyword ORDER BY total DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// Error handler tập trung — log đầy đủ ở server, trả về client thông điệp chung chung.
app.use((err, req, res, _next) => {
  console.error("[api] Lỗi xử lý request:", err);
  res.status(500).json({ error: "Đã có lỗi xảy ra, vui lòng thử lại sau." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`[api] Đang chạy tại port ${PORT}`));
