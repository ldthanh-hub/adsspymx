// Job chính — chạy theo lịch (GitHub Actions, xem .github/workflows/fetch-daily.yml).
//
// Nguyên tắc thiết kế quan trọng (rút từ bài học vận hành Apps Script trước đó của dự án):
// KHÔNG để một keyword lỗi làm sập toàn bộ job. Mỗi keyword được try/catch riêng, lỗi được
// ghi vào bảng fetch_runs để có thể chẩn đoán từ xa, thay vì "thoát im lặng".

import "dotenv/config";
import { pool } from "../db/pool.js";
import { searchAds } from "../lib/metaAdLibrary.js";
import { parseEngagement } from "../lib/snapshotParser.js";
import {
  KEYWORDS,
  MAX_PAGES_PER_KEYWORD,
  MAX_NEW_ADS_FOR_ENGAGEMENT_PER_RUN,
} from "../config/keywords.js";

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const COUNTRY = process.env.META_AD_COUNTRY || "MX";

function daysBetween(start, end) {
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  return Math.max(0, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
}

async function upsertAd(client, raw, keyword) {
  const startDate = raw.ad_delivery_start_time || null;
  const stopDate = raw.ad_delivery_stop_time || null;

  const { rows } = await client.query(
    `INSERT INTO ads (
       ad_id, page_id, page_name, keyword, creative_text, creative_title,
       snapshot_url, platforms, delivery_start_date, delivery_stop_date,
       is_active, days_active, first_seen_at, last_seen_at, raw_payload
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now(), now(), $13)
     ON CONFLICT (ad_id) DO UPDATE SET
       last_seen_at = now(),
       delivery_stop_date = EXCLUDED.delivery_stop_date,
       is_active = EXCLUDED.is_active,
       days_active = EXCLUDED.days_active,
       raw_payload = EXCLUDED.raw_payload
     RETURNING (xmax = 0) AS is_new`, // xmax=0 nghĩa là vừa INSERT mới, không phải UPDATE
    [
      raw.id,
      raw.page_id,
      raw.page_name,
      keyword,
      Array.isArray(raw.ad_creative_bodies) ? raw.ad_creative_bodies.join(" | ") : null,
      Array.isArray(raw.ad_creative_link_titles) ? raw.ad_creative_link_titles.join(" | ") : null,
      raw.ad_snapshot_url,
      raw.publisher_platforms || [],
      startDate ? startDate.slice(0, 10) : null,
      stopDate ? stopDate.slice(0, 10) : null,
      !stopDate, // is_active = chưa có ngày dừng
      daysBetween(startDate, stopDate),
      JSON.stringify(raw),
    ]
  );

  return { isNew: rows[0]?.is_new === true, adId: raw.id, snapshotUrl: raw.ad_snapshot_url };
}

async function processKeyword(client, keyword) {
  const runRes = await client.query(
    `INSERT INTO fetch_runs (keyword, status) VALUES ($1, 'running') RETURNING id`,
    [keyword]
  );
  const runId = runRes.rows[0].id;

  try {
    const rawAds = await searchAds(keyword, {
      accessToken: ACCESS_TOKEN,
      country: COUNTRY,
      maxPages: MAX_PAGES_PER_KEYWORD,
    });

    const newAds = [];
    for (const raw of rawAds) {
      if (!raw.id || !raw.page_id) continue; // dữ liệu thiếu id/page_id thì bỏ qua, không upsert rác
      const { isNew, snapshotUrl } = await upsertAd(client, raw, keyword);
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
      `[fetchAds] "${keyword}": ${rawAds.length} ad tìm thấy, ${newAds.length} ad mới, ${toEnrich.length} ad được kiểm tra engagement.`
    );
  } catch (err) {
    // KHÔNG throw ra ngoài — ghi lỗi lại và để job tiếp tục với keyword tiếp theo.
    console.error(`[fetchAds] Lỗi ở keyword "${keyword}":`, err.message);
    await client.query(
      `UPDATE fetch_runs SET status='error', finished_at=now(), error_message=$1 WHERE id=$2`,
      [err.message, runId]
    );
  }
}

async function main() {
  if (!ACCESS_TOKEN) {
    console.error("[fetchAds] Thiếu META_ACCESS_TOKEN — dừng job (không chạy được gì cả).");
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    for (const keyword of KEYWORDS) {
      await processKeyword(client, keyword);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // Lưới an toàn cuối cùng — không để job thoát với lỗi không log.
  console.error("[fetchAds] Lỗi không mong đợi ở tầng ngoài cùng:", err);
  process.exitCode = 1;
});
