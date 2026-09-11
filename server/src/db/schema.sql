-- Chạy 1 lần trên database (Supabase/Neon) trước khi deploy backend.
-- Thiết kế: chỉ lưu METADATA + LINK tới creative gốc, KHÔNG lưu file video/ảnh
-- (giảm chi phí storage, tránh rủi ro tái phân phối bản quyền creative).

CREATE TABLE IF NOT EXISTS ads (
  ad_id               TEXT PRIMARY KEY,           -- id từ Meta Ad Library
  page_id             TEXT NOT NULL,
  page_name           TEXT NOT NULL,
  keyword             TEXT NOT NULL,               -- từ khóa/ngành đã tìm ra ad này
  creative_text        TEXT,
  creative_title       TEXT,
  snapshot_url         TEXT NOT NULL,               -- link tới trang Ad Library gốc (KHÔNG host lại creative)
  platforms            TEXT[],                      -- facebook / instagram / messenger / audience_network
  delivery_start_date  DATE,
  delivery_stop_date   DATE,                        -- NULL = có thể vẫn đang chạy
  is_active            BOOLEAN NOT NULL DEFAULT true,
  days_active          INT,                         -- tính lại mỗi lần fetch = proxy "độ bền / khả năng hiệu quả"

  -- Engagement công khai (best-effort, KHÔNG phải mọi ad đều có — xem README mục "Giới hạn dữ liệu")
  likes_count          INT,
  comments_count        INT,
  shares_count          INT,
  video_views           INT,
  engagement_checked_at TIMESTAMPTZ,
  engagement_parse_ok    BOOLEAN,                    -- false = đã thử nhưng không parse được (Meta đổi giao diện, hoặc ad không gắn post công khai)

  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload             JSONB                       -- lưu nguyên response gốc để tra cứu/tái xử lý sau này
);

-- Thêm sau lần đầu deploy (11/09/2026) — CREATE TABLE IF NOT EXISTS ở trên không tự thêm cột
-- mới vào bảng đã tồn tại, nên các cột thêm sau này PHẢI khai báo riêng bằng ALTER TABLE ... ADD
-- COLUMN IF NOT EXISTS để migrate.js (chạy lại toàn bộ file này) áp dụng được lên DB production.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS thumbnail_url TEXT; -- ảnh/poster video đại diện của ad — best-effort, có thể null nếu card không có ảnh nhận diện được, và có thể hết hạn sau một thời gian vì là link CDN trực tiếp của Facebook (không host lại ảnh, xem ghi chú đầu file)

CREATE INDEX IF NOT EXISTS idx_ads_keyword ON ads (keyword);
CREATE INDEX IF NOT EXISTS idx_ads_page_id ON ads (page_id);
CREATE INDEX IF NOT EXISTS idx_ads_is_active ON ads (is_active);
CREATE INDEX IF NOT EXISTS idx_ads_delivery_start ON ads (delivery_start_date);

-- Nhật ký mỗi lần chạy job fetch — dùng để phát hiện lỗi sớm thay vì "nuốt lỗi im lặng"
CREATE TABLE IF NOT EXISTS fetch_runs (
  id            SERIAL PRIMARY KEY,
  keyword       TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'running',  -- running | success | error
  ads_found     INT DEFAULT 0,
  ads_new       INT DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_fetch_runs_started ON fetch_runs (started_at);
