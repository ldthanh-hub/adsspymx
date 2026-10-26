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

-- ============ TÍN HIỆU NGOÀI META (thêm 26/10/2026 — Google Trends, Mercado Libre, TikTok) ============
-- Nguyên tắc chung, giống bảng ads: chỉ lưu SỐ LIỆU + LINK, không lưu nội dung sáng tạo của
-- đối thủ; mỗi lần job chạy là 1 snapshot mới (không ghi đè snapshot cũ) để vẽ được xu hướng
-- theo thời gian. API chỉ đọc snapshot MỚI NHẤT mỗi brand (DISTINCT ON) + lịch sử snapshot.
-- signal_runs ghi lại trạng thái từng nguồn từng brand — job KHÔNG được "nuốt lỗi im lặng":
-- nguồn nào bị chặn (Mercado 403, Trends 429/411) thì panel dashboard hiện đúng trạng thái đó.
CREATE TABLE IF NOT EXISTS signal_runs (
  id            SERIAL PRIMARY KEY,
  source        TEXT NOT NULL,              -- tiktok | mercado | trends
  brand         TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'running',  -- running | success | error | blocked
  items_found   INT DEFAULT 0,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_signal_runs_source_brand ON signal_runs (source, brand, started_at DESC);

-- TikTok: số liệu hashtag tích lũy từ TikWM challenge/info (không cần key, kiểm chứng thật
-- từ VM ngày 26/10/2026). Đây là lượt xem hashtag CỘNG DỒN từ trước tới nay, KHÔNG phải lượt
-- xem trong 1 ngày — muốn thấy tăng trưởng thì so snapshot hôm nay với snapshot hôm trước.
CREATE TABLE IF NOT EXISTS tiktok_hashtags (
  id          SERIAL PRIMARY KEY,
  brand       TEXT NOT NULL,
  hashtag     TEXT NOT NULL,
  view_count  BIGINT,
  user_count  BIGINT,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tiktok_hashtags_brand ON tiktok_hashtags (brand, fetched_at DESC);

-- Mercado Libre Mexico: 1 dòng = 1 listing tìm thấy trong lần quét (tối đa 50 listing/brand).
-- sold_quantity là số lượng ĐÃ BÁN TÍCH LŨY của listing đó (Mercado công khai), không phải
-- doanh thu — muốn ước doanh thu thì nhân với price, nhưng panel chỉ hiện tổng đã bán và
-- khoảng giá, không tự suy ra doanh thu tuyệt đối vì 1 brand có nhiều listing trùng sản phẩm.
CREATE TABLE IF NOT EXISTS mercado_listings (
  id                 SERIAL PRIMARY KEY,
  brand              TEXT NOT NULL,
  item_id            TEXT NOT NULL,
  title              TEXT,
  price              NUMERIC,
  currency           TEXT,
  sold_quantity      INT,
  available_quantity INT,
  seller_nickname    TEXT,
  permalink          TEXT,
  thumbnail          TEXT,
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mercado_listings_brand ON mercado_listings (brand, fetched_at DESC);

-- Google Trends: CHỈ SỐ QUAN TÂM TƯƠNG ĐỐI 0-100 (vùng MX, 90 ngày, theo tuần), KHÔNG phải
-- số lượt tìm kiếm tuyệt đối — 100 = tuần cao nhất trong khung, không phải 100 lượt tìm.
-- points lưu nguyên chuỗi tuần [{date, value}] để vẽ biểu đồ; interest_avg/max/last là tóm tắt.
CREATE TABLE IF NOT EXISTS google_trends (
  id            SERIAL PRIMARY KEY,
  brand         TEXT NOT NULL,
  keyword       TEXT NOT NULL,
  geo           TEXT NOT NULL DEFAULT 'MX',
  interest_avg  NUMERIC,
  interest_max  INT,
  interest_last INT,
  points        JSONB,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_google_trends_brand ON google_trends (brand, fetched_at DESC);

-- ============ ĐỐI THỦ MỞ RỘNG (thêm 26/10/2026 — website, creative, social) ============
-- website_snapshots: 1 dòng = 1 lần job mở website chính của 1 brand. promo_texts là các
-- chuỗi khuyến mãi tìm thấy trên trang (VD "20% OFF", "Buy 1 Get 1") — trích nguyên văn, không
-- suy ra offer nếu trang không ghi rõ. products là tối đa 20 sản phẩm đầu tiên parse được
-- (tên + giá), price_min/max chỉ tính trên các sản phẩm parse được giá, không phải toàn shop.
CREATE TABLE IF NOT EXISTS website_snapshots (
  id           SERIAL PRIMARY KEY,
  brand        TEXT NOT NULL,
  website_url  TEXT NOT NULL,
  page_title   TEXT,
  promo_texts  JSONB,
  products     JSONB,
  price_min    NUMERIC,
  price_max    NUMERIC,
  currency     TEXT,
  status       TEXT NOT NULL DEFAULT 'success',  -- success | blocked | error
  error_message TEXT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_website_snapshots_brand ON website_snapshots (brand, fetched_at DESC);

-- creative_analysis: phân loại rule-based cho từng ad (1 ad có thể nhiều góc, nhiều offer).
-- angles/offers là mảng key theo config/competitors.js (VD ["melasma","vitamina_c"]).
-- ai_summary chỉ có khi job gọi Pollinations thành công cho ad đó (top ad bền nhất) — nếu
-- AI lỗi thì ai_summary = NULL, dữ liệu rule vẫn đầy đủ, không được đọc NULL là "không có góc".
CREATE TABLE IF NOT EXISTS creative_analysis (
  ad_id      TEXT PRIMARY KEY,
  angles     TEXT[] NOT NULL DEFAULT '{}',
  offers     TEXT[] NOT NULL DEFAULT '{}',
  hook       TEXT,
  ai_summary TEXT,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creative_analysis_angles ON creative_analysis USING GIN (angles);
CREATE INDEX IF NOT EXISTS idx_creative_analysis_offers ON creative_analysis USING GIN (offers);

-- social_profiles: 1 dòng = 1 lần job lấy 1 kênh social của 1 brand. followers ở đây là
-- subscribers (YouTube) hoặc followers (Facebook/Instagram) — đơn vị khác nhau theo nguồn,
-- panel hiển thị kèm tên nguồn, không cộng chung. status ghi rõ api_key_missing (YouTube
-- chưa có key), blocked (trang chặn bot), not_configured (Instagram chưa có handle).
CREATE TABLE IF NOT EXISTS social_profiles (
  id           SERIAL PRIMARY KEY,
  brand        TEXT NOT NULL,
  source       TEXT NOT NULL,              -- youtube | facebook | instagram
  handle       TEXT,
  channel_name TEXT,
  followers    BIGINT,
  video_count  INT,
  top_video    JSONB,
  url          TEXT,
  status       TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_profiles_brand ON social_profiles (brand, source, fetched_at DESC);
