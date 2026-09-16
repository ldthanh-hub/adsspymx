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
  // keyword: cho phép nhiều giá trị cách nhau bởi dấu phẩy (OR) — dùng cho bộ lọc "Ngành hàng/
  // Thương hiệu" dạng checkbox nhiều lựa chọn ở sidebar.
  keyword: z.string().max(1000).optional(),
  // page_names: danh sách CHÍNH XÁC tên Page (phân biệt với page_name ILIKE bên dưới) — dùng cho
  // bộ lọc "Thương hiệu thực tế" (sourced từ /api/brands), cũng cho phép chọn nhiều.
  page_names: z.string().max(4000).optional(),
  page_name: z.string().max(200).optional(),
  // q: tìm full-text trong NỘI DUNG quảng cáo (creative_text) — khác với page_name (tên trang).
  // Cho phép kết hợp với keyword/page_names: VD keyword=skincare + page_names=Pai Pai + q=descuento
  // => ad của Pai Pai, thuộc nhóm skincare, có chữ "descuento" trong nội dung.
  q: z.string().max(200).optional(),
  // country: lọc theo thị trường — khớp với countries[] (1 ad có thể thuộc nhiều nước cùng lúc,
  // xem ghi chú countries trong schema.sql). Cho phép chọn nhiều (giống keyword/page_names).
  country: z.string().max(200).optional(),
  // category: nhóm ngành hàng lớn ("Mỹ phẩm & Làm đẹp"/"Thời trang"...), gắn cứng
  // từ config/keywords.js lúc quét — cho phép chọn nhiều.
  category: z.string().max(500).optional(),
  // media_type: "video" | "image" | "none" — suy ra lúc quét bằng heuristic thumbnail đã kiểm
  // chứng thật (xem adLibraryScraper.js). KHÔNG có filter "platform" — xem lý do trong schema.sql.
  media_type: z.enum(["video", "image", "none"]).optional(),
  // active_only: 3 trạng thái — bỏ trống (tất cả) / "true" (chỉ đang chạy) / "false" (chỉ đã dừng).
  active_only: z.enum(["true", "false"]).optional(),
  min_days_active: z.coerce.number().int().min(0).max(3650).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Tách chuỗi "a, b,,c" -> ["a","b","c"], giới hạn số lượng để tránh query khổng lồ.
function splitList(raw, max = 60) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/ads", async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Tham số không hợp lệ", details: parsed.error.issues });
    }
    const {
      keyword,
      page_names,
      page_name,
      q,
      country,
      category,
      media_type,
      active_only,
      min_days_active,
      limit,
      offset,
    } = parsed.data;

    const conditions = [];
    const values = [];

    if (keyword) {
      const list = splitList(keyword);
      if (list.length) {
        values.push(list);
        conditions.push(`keyword = ANY($${values.length}::text[])`);
      }
    }
    if (page_names) {
      const list = splitList(page_names);
      if (list.length) {
        values.push(list);
        conditions.push(`page_name = ANY($${values.length}::text[])`);
      }
    }
    if (page_name) {
      values.push(`%${page_name}%`);
      conditions.push(`page_name ILIKE $${values.length}`);
    }
    if (q) {
      values.push(`%${q}%`);
      conditions.push(`creative_text ILIKE $${values.length}`);
    }
    if (country) {
      const list = splitList(country, 10);
      if (list.length) {
        values.push(list);
        // countries && $n::text[] = "có giao nhau" — đúng vì countries là mảng (1 ad có thể thuộc
        // nhiều thị trường), khác với keyword/page_name vốn là cột đơn giá trị.
        conditions.push(`countries && $${values.length}::text[]`);
      }
    }
    if (category) {
      const list = splitList(category, 20);
      if (list.length) {
        values.push(list);
        conditions.push(`category = ANY($${values.length}::text[])`);
      }
    }
    if (media_type) {
      values.push(media_type);
      conditions.push(`media_type = $${values.length}`);
    }
    if (active_only === "true") {
      conditions.push(`is_active = true`);
    } else if (active_only === "false") {
      conditions.push(`is_active = false`);
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
              video_views, engagement_parse_ok, thumbnail_url, countries, category,
              keyword_type, media_type, first_seen_at, last_seen_at
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

// Schema dùng chung cho các endpoint thống kê (/api/keywords, /api/brands, /api/trend) — chỉ có
// 1 tham số "country" để scope theo thị trường, không truyền = gộp tất cả thị trường.
const statsQuerySchema = z.object({
  country: z.string().max(10).optional(),
});

// Trả thêm category + keyword_type (gắn cứng từ config/keywords.js lúc quét) để giao diện tự chia
// nhóm "Ngành hàng" (industry) / "Thương hiệu đã cấu hình" (brand) mà KHÔNG cần tự đoán bằng cách
// so chuỗi tên như bản cũ (dễ vỡ khi thêm ngành mới — xem ghi chú trong schema.sql).
app.get("/api/keywords", async (req, res, next) => {
  try {
    const parsed = statsQuerySchema.safeParse(req.query); // dùng chung schema { country? }
    if (!parsed.success) {
      return res.status(400).json({ error: "Tham số không hợp lệ", details: parsed.error.issues });
    }
    const { country } = parsed.data;
    const conditions = [];
    const values = [];
    if (country) {
      values.push(country);
      conditions.push(`$${values.length} = ANY(countries)`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT keyword,
              MAX(category) AS category,
              MAX(keyword_type) AS type,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE is_active) AS active
       FROM ads
       ${where}
       GROUP BY keyword
       ORDER BY total DESC`,
      values
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// Danh sách THƯƠNG HIỆU THỰC TẾ (nhóm theo page_name — tên Page thật trên Facebook), khác với
// /api/keywords vốn chỉ liệt kê các từ khóa/tên đã CHỦ ĐỘNG cấu hình sẵn trong keywords.js.
// Lý do cần endpoint riêng: khi search bằng 1 từ khóa ngành hàng chung (VD "skincare"), Meta trả
// về quảng cáo của RẤT NHIỀU Page khác nhau — không chỉ các brand đã liệt kê thủ công. Endpoint
// này giúp thấy hết toàn bộ đối thủ đã "vô tình" thu thập được, không bị giới hạn bởi danh sách
// cấu hình — đây chính là nguồn dữ liệu cho sidebar "Thương hiệu" và trang Dashboard brand.
app.get("/api/brands", async (req, res, next) => {
  try {
    const parsed = statsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Tham số không hợp lệ", details: parsed.error.issues });
    }
    const { country } = parsed.data;
    const conditions = [];
    const values = [];
    if (country) {
      values.push(country);
      conditions.push(`$${values.length} = ANY(countries)`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT page_name,
              (array_agg(page_id ORDER BY last_seen_at DESC))[1] AS page_id,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE is_active) AS active,
              MAX(days_active) AS max_days_active,
              array_agg(DISTINCT keyword ORDER BY keyword) AS keywords,
              array_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL) AS categories,
              MIN(first_seen_at) AS first_seen_at,
              MAX(last_seen_at) AS last_seen_at
       FROM ads
       ${where}
       GROUP BY page_name
       ORDER BY total DESC
       LIMIT 400`,
      values
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// Số ad MỚI phát hiện theo từng ngày trong N ngày gần nhất — nguồn cho biểu đồ xu hướng ở trang
// Dashboard. Dùng first_seen_at (ngày công cụ NHÌN THẤY ad lần đầu, không phải ngày ad thật sự bắt
// đầu chạy trên Facebook) vì đây là proxy trung thực duy nhất cho "hoạt động phát hiện" của chính
// pipeline — không suy ra được xu hướng chi tiêu/thị trường thật từ đây.
app.get("/api/trend", async (req, res, next) => {
  try {
    const parsed = statsQuerySchema.safeParse(req.query); // dùng chung schema { country? } với /api/brands
    if (!parsed.success) {
      return res.status(400).json({ error: "Tham số không hợp lệ", details: parsed.error.issues });
    }
    const { country } = parsed.data;
    const conditions = [`first_seen_at >= now() - interval '30 days'`];
    const values = [];
    if (country) {
      values.push(country);
      conditions.push(`$${values.length} = ANY(countries)`);
    }

    const { rows } = await pool.query(
      `SELECT date_trunc('day', first_seen_at)::date AS day, COUNT(*) AS ads_discovered
       FROM ads
       WHERE ${conditions.join(" AND ")}
       GROUP BY day
       ORDER BY day ASC`,
      values
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
