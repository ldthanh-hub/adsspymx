// Job chính — chạy theo lịch (GitHub Actions, xem .github/workflows/fetch-daily.yml).
//
// Nguyên tắc thiết kế quan trọng (rút từ bài học vận hành Apps Script trước đó của dự án):
// KHÔNG để một keyword lỗi làm sập toàn bộ job. Mỗi keyword (× mỗi quốc gia) được try/catch riêng,
// lỗi được ghi vào bảng fetch_runs để có thể chẩn đoán từ xa, thay vì "thoát im lặng".
//
// ĐA QUỐC GIA (thêm 11/09/2026): trước đây job chỉ chạy 1 quốc gia lấy từ biến môi trường
// META_AD_COUNTRY — giờ danh sách quốc gia + từ khóa nằm gọn trong config/keywords.js (MARKETS),
// job tự lặp qua TẤT CẢ thị trường đã khai báo trong 1 lần chạy, không cần biến môi trường nữa.

import "dotenv/config";
import { pool } from "../db/pool.js";
import { launchLibraryBrowser, closeLibraryBrowser, scrapeAds } from "../lib/adLibraryScraper.js";
import { parseEngagement } from "../lib/snapshotParser.js";
import { MARKETS, MAX_PAGES_PER_KEYWORD, MAX_NEW_ADS_FOR_ENGAGEMENT_PER_RUN } from "../config/keywords.js";

const DELAY_BETWEEN_KEYWORDS_MS = 4000; // giãn cách giữa các từ khóa — giảm dấu hiệu truy cập dồn dập

function daysBetween(start, end) {
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  return Math.max(0, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
}

async function upsertAd(client, raw, item, countryCode) {
  const startDate = raw.ad_delivery_start_time || null;
  const stopDate = raw.ad_delivery_stop_time || null;

  const { rows } = await client.query(
    `INSERT INTO ads (
       ad_id, page_id, page_name, keyword, creative_text, creative_title,
       snapshot_url, platforms, delivery_start_date, delivery_stop_date,
       is_active, days_active, thumbnail_url, countries, category, keyword_type,
       media_type, first_seen_at, last_seen_at, raw_payload
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now(), now(), $18)
     ON CONFLICT (ad_id) DO UPDATE SET
       last_seen_at = now(),
       delivery_stop_date = EXCLUDED.delivery_stop_date,
       is_active = EXCLUDED.is_active,
       days_active = EXCLUDED.days_active,
       -- Làm mới thumbnail/media_type mỗi lần thấy lại ad — link CDN của Facebook có thể hết hạn,
       -- chỉ giữ giá trị cũ khi lần scrape này không lấy được (tốt hơn là xoá mất dữ liệu đã có).
       thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, ads.thumbnail_url),
       media_type = COALESCE(EXCLUDED.media_type, ads.media_type),
       -- countries: HỢP (union) chứ không ghi đè — 1 ad có thể được tìm thấy ở cả 2 lần quét MX
       -- và US nếu nhà quảng cáo target nhiều nước, phải giữ đủ cả 2 chứ không mất cái cũ.
       countries = (SELECT ARRAY(SELECT DISTINCT unnest(ads.countries || EXCLUDED.countries))),
       -- category/keyword_type: giữ giá trị gán từ lần ĐẦU TIÊN thấy ad (không đổi qua lại mỗi
       -- lần quét lại bằng từ khóa khác), chỉ backfill nếu trước đó chưa có (NULL).
       category = COALESCE(ads.category, EXCLUDED.category),
       keyword_type = COALESCE(ads.keyword_type, EXCLUDED.keyword_type),
       raw_payload = EXCLUDED.raw_payload
     RETURNING (xmax = 0) AS is_new`, // xmax=0 nghĩa là vừa INSERT mới, không phải UPDATE
    [
      raw.id,
      raw.page_id,
      raw.page_name,
      item.keyword,
      Array.isArray(raw.ad_creative_bodies) ? raw.ad_creative_bodies.join(" | ") : null,
      Array.isArray(raw.ad_creative_link_titles) ? raw.ad_creative_link_titles.join(" | ") : null,
      raw.ad_snapshot_url,
      raw.publisher_platforms || [],
      startDate ? startDate.slice(0, 10) : null,
      stopDate ? stopDate.slice(0, 10) : null,
      // is_active: ưu tiên badge Active/Inactive đọc trực tiếp từ trang scrape; nếu không xác
      // định được (undefined) thì coi như còn hoạt động (mặc định an toàn hơn là đánh rớt nhầm).
      raw._isActiveHint !== false,
      daysBetween(startDate, stopDate),
      raw.thumbnail_url || null,
      [countryCode],
      item.category || null,
      item.type || null,
      raw.media_type || null,
      JSON.stringify(raw),
    ]
  );

  return { isNew: rows[0]?.is_new === true, adId: raw.id, snapshotUrl: raw.ad_snapshot_url };
}

async function processKeyword(client, page, item, countryCode) {
  const runLabel = `${item.keyword} [${countryCode}]`;
  const runRes = await client.query(
    `INSERT INTO fetch_runs (keyword, status) VALUES ($1, 'running') RETURNING id`,
    [runLabel]
  );
  const runId = runRes.rows[0].id;

  try {
    const rawAds = await scrapeAds(page, item.keyword, {
      country: countryCode,
      maxScrolls: MAX_PAGES_PER_KEYWORD,
    });

    const newAds = [];
    for (const raw of rawAds) {
      // dữ liệu thiếu id/page_id/page_name thì bỏ qua, không upsert rác — page_name NOT NULL trong DB,
      // và dù adLibraryScraper.js giờ đã luôn trả page_name (có fallback), vẫn giữ check này làm
      // lưới an toàn thứ 2 phòng trường hợp parser thay đổi sau này.
      if (!raw.id || !raw.page_id || !raw.page_name) continue;
      const { isNew, snapshotUrl } = await upsertAd(client, raw, item, countryCode);
      if (isNew && snapshotUrl) newAds.push({ adId: raw.id, snapshotUrl });
    }

    // Chỉ parse engagement cho ad MỚI, giới hạn số lượng mỗi lần chạy (xem lý do trong snapshotParser.js)
    const toEnrich = newAds.slice(0, MAX_NEW_ADS_FOR_ENGAGEMENT_PER_RUN);
    for (const { adId, snapshotUrl } of toEnrich) {
      const engagement = await parseEngagement(snapshotUrl);
      await client.query(
        `UPDATE ads SET likes_count=$1, comments_count=$2, shares_count=$3, video_views=$4,
                        engagement_checked_at=now(), engagement_parse_ok=$5
         WHERE ad_id=$6`,
        [
          engagement.likes,
          engagement.comments,
          engagement.shares,
          engagement.views,
          engagement.ok,
          adId,
        ]
      );
    }

    await client.query(
      `UPDATE fetch_runs SET status='success', finished_at=now(), ads_found=$1, ads_new=$2 WHERE id=$3`,
      [rawAds.length, newAds.length, runId]
    );

    console.log(
      `[fetchAds] "${runLabel}": ${rawAds.length} ad tìm thấy, ${newAds.length} ad mới, ${toEnrich.length} ad được kiểm tra engagement.`
    );
  } catch (err) {
    // KHÔNG throw ra ngoài — ghi lỗi lại và để job tiếp tục với keyword tiếp theo.
    console.error(`[fetchAds] Lỗi ở "${runLabel}":`, err.message);
    await client.query(
      `UPDATE fetch_runs SET status='error', finished_at=now(), error_message=$1 WHERE id=$2`,
      [err.message, runId]
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const client = await pool.connect();
  const { browser, page } = await launchLibraryBrowser();

  // Gộp tất cả (quốc gia × từ khóa) thành 1 danh sách phẳng để chạy tuần tự — đơn giản, dễ đoán
  // thời gian chạy tổng (xem log cuối mỗi lần chạy trên GitHub Actions để biết thời gian thực tế).
  const jobs = [];
  for (const [countryCode, market] of Object.entries(MARKETS)) {
    for (const item of market.items) {
      jobs.push({ item, countryCode });
    }
  }

  try {
    console.log(`[fetchAds] Bắt đầu chạy ${jobs.length} lượt (quốc gia × từ khóa/thương hiệu).`);
    for (let i = 0; i < jobs.length; i++) {
      await processKeyword(client, page, jobs[i].item, jobs[i].countryCode);
      if (i < jobs.length - 1) await sleep(DELAY_BETWEEN_KEYWORDS_MS);
    }
  } finally {
    await closeLibraryBrowser({ browser });
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // Lưới an toàn cuối cùng — không để job thoát với lỗi không log.
  console.error("[fetchAds] Lỗi không mong đợi ở tầng ngoài cùng:", err);
  process.exitCode = 1;
});
