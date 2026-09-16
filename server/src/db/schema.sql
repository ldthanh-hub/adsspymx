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

-- Thêm sau khi mở rộng nhiều quốc gia + nhiều ngành hàng (11/09/2026):
--
-- countries: dùng MẢNG chứ KHÔNG dùng 1 cột "country" đơn — vì 1 quảng cáo (cùng library ID) có
-- thể bị bắt gặp ở CẢ HAI lần quét MX và US nếu nhà quảng cáo target nhiều nước cùng lúc (xác nhận
-- có thật khi kiểm tra trực tiếp Meta Ad Library — cùng 1 library ID xuất hiện khi search ở nhiều
-- quốc gia). Nếu dùng cột đơn, lần quét chạy sau sẽ ghi đè mất thông tin quốc gia của lần quét
-- trước — dùng mảng + merge (xem fetchAds.js) để giữ đủ cả 2.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS countries TEXT[] NOT NULL DEFAULT '{}';

-- category: nhóm ngành hàng lớn ("Mỹ phẩm & Làm đẹp" / "Thời trang"...), gắn cứng
-- từ config/keywords.js tại thời điểm quét — KHÔNG suy luận bằng cách so chuỗi tên ở tầng giao diện
-- (cách cũ ui.js dùng, dễ vỡ khi thêm ngành mới) để tránh phân loại sai.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS category TEXT;

-- keyword_type: "industry" (từ khóa ngành hàng chung) hay "brand" (tên thương hiệu cụ thể) — cùng
-- lý do với category, gắn cứng từ config thay vì đoán ở giao diện.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS keyword_type TEXT;

-- media_type: "video" / "image" / "none" — suy ra khi quét bằng CHÍNH heuristic đã kiểm chứng thật
-- của thumbnail_url (video[poster] ưu tiên trước, sau đó tới ảnh đủ lớn) — không thêm giả định DOM
-- mới, chỉ đọc lại kết quả đã có sẵn. KHÔNG lưu "platform" (Facebook/Instagram...) theo từng ad vì
-- đã kiểm tra trực tiếp DOM thật: icon nền tảng trên mỗi thẻ quảng cáo là CSS sprite mask-image
-- không có label/aria-label/alt nào — không có cách đọc ra tên nền tảng một cách đáng tin cậy,
-- nên KHÔNG đưa ra giao diện như một bộ lọc "thật" (xem thêm ghi chú trong adLibraryScraper.js).
ALTER TABLE ads ADD COLUMN IF NOT EXISTS media_type TEXT;

CREATE INDEX IF NOT EXISTS idx_ads_keyword ON ads (keyword);
CREATE INDEX IF NOT EXISTS idx_ads_page_id ON ads (page_id);
CREATE INDEX IF NOT EXISTS idx_ads_is_active ON ads (is_active);
CREATE INDEX IF NOT EXISTS idx_ads_delivery_start ON ads (delivery_start_date);
CREATE INDEX IF NOT EXISTS idx_ads_countries ON ads USING GIN (countries);
CREATE INDEX IF NOT EXISTS idx_ads_category ON ads (category);
CREATE INDEX IF NOT EXISTS idx_ads_media_type ON ads (media_type);

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
