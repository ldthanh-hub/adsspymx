// Job mở rộng đối thủ — 3 nguồn, 1 script, chạy bằng GitHub Actions
// (xem .github/workflows/fetch-competitors.yml, lịch 15:00 UTC = 09:00 giờ Mexico, sau job
// signals 14:00 UTC). Cách dùng tay giống fetchSignals.js:
//   npm run fetch:competitors -- --source=website --brand=Medicube
//   npm run fetch:competitors -- --source=creative
//   npm run fetch:competitors -- --source=social
//
// Trạng thái kiểm chứng thật ngày 26/10/2026 (đọc trước khi tin vào job):
//   - Website: curl cho 200 ở Anua, SKIN1004, Beauty of Joseon, Eucerin MX, VT, EQQUALBERRY,
//     Round Lab, Seyoul; Medicube 403 Cloudflare (job dùng Playwright, có medicube.us dự
//     phòng); Rejuran chỉ chạy ở rejuran.co.kr; Dr. Althea curl lỗi mạng (Playwright có thể
//     qua được, nếu không thì job ghi blocked, không bịa giá).
//   - Creative rule-based: chạy hoàn toàn trên DB, không cần API, luôn chạy được. AI tóm tắt:
//     DeepSeek của Đăng đang 402 hết số dư (biết từ 20/10/2026) nên job KHÔNG dùng DeepSeek
//     mà dùng Pollinations text miễn phí (kiểm chứng thật từ VM: trả tiếng Việt, không cần
//     key) cho tối đa 10 ad bền nhất đang chạy — nếu Pollinations lỗi thì ai_summary = NULL,
//     dữ liệu rule vẫn đầy đủ.
//   - YouTube: KHÔNG dùng handle ghi sẵn (tìm kiếm không xác minh chắc chắn kênh chính thức
//     của hầu hết brand) mà tìm kênh bằng Search: có YOUTUBE_API_KEY (GitHub secret, anh tự
//     tạo trên Google Cloud) thì dùng API chính thức, không có key thì Playwright mở trang
//     kết quả tìm kiếm YouTube và lấy kênh đầu tiên — nếu YouTube chặn bot thì ghi blocked.
//   - Facebook: lấy Page có nhiều ad nhất của brand từ chính bảng ads (đã xác minh qua Meta
//     Ad Library), Playwright mở facebook.com/<page_id> và trích số followers nếu trang hiện.
//   - Instagram: chưa cấu hình handle chính thức cho brand nào (tìm kiếm không xác minh
//     được), nên job ghi not_configured — anh gửi handle IG là thêm vào config là chạy được,
//     không cần sửa code job.
import { fileURLToPath } from "node:url";
import { pool } from "../db/pool.js";
import { COMPETITOR_BRANDS, CREATIVE_ANGLES, CREATIVE_OFFERS } from "../config/competitors.js";
import { SIGNAL_DELAY_SECONDS } from "../config/signals.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const delay = () => sleep(SIGNAL_DELAY_SECONDS * 1000);

function parseCount(text) {
  if (!text) return null;
  const m = String(text).replace(/,/g, "").match(/([\d.]+)\s*([KM])?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] && m[2].toUpperCase() === "K") n *= 1000;
  if (m[2] && m[2].toUpperCase() === "M") n *= 1000000;
  return Math.round(n);
}

// ---------- 1. Website: Playwright, trích promo + sản phẩm ----------
const PROMO_PATTERNS = [/%\s*off/i, /descuento/i, /sale/i, /buy\s+\d+\s+get/i, /2\s*x\s*1/i, /envío gratis/i, /free shipping/i, /bundle/i, /limited/i, /oferta/i];

export async function fetchWebsite(brand) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ userAgent: UA });
    const urls = [brand.websiteUrl, brand.websiteFallbackUrl].filter(Boolean);
    let lastErr = null;
    for (const url of urls) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(3000);
        const data = await page.evaluate(() => {
          const title = document.title || "";
          const bodyText = (document.body ? document.body.innerText : "").slice(0, 20000);
          const promos = [];
          for (const line of bodyText.split("\n")) {
            const t = line.trim();
            if (t.length >= 4 && t.length <= 120 && /(%\s*off|descuento|sale|buy\s+\d+\s+get|2\s*x\s*1|envío gratis|free shipping|bundle|oferta|limited)/i.test(t)) {
              if (!promos.includes(t)) promos.push(t);
            }
            if (promos.length >= 10) break;
          }
          // Sản phẩm: các thẻ có giá dạng $ / MX$ — lấy tối đa 20, mỗi thẻ tên + giá số.
          const products = [];
          for (const el of document.querySelectorAll("a, div, li")) {
            if (products.length >= 20) break;
            const txt = (el.innerText || "").trim().replace(/\s+/g, " ");
            if (txt.length < 10 || txt.length > 200) continue;
            const priceMatch = txt.match(/(?:MX\$|\$)\s*([\d,]+(?:\.\d{2})?)/);
            if (!priceMatch) continue;
            if (el.querySelector("a, div, li")) continue; // chỉ lấy thẻ lá, tránh thẻ cha chứa cả trang
            products.push({ title: txt.slice(0, 120), price: Number(priceMatch[1].replace(/,/g, "")) });
          }
          return { title, promos, products };
        });
        const prices = data.products.map((p) => p.price).filter((n) => Number.isFinite(n));
        return {
          website_url: url,
          page_title: data.title,
          promo_texts: data.promos,
          products: data.products,
          price_min: prices.length ? Math.min(...prices) : null,
          price_max: prices.length ? Math.max(...prices) : null,
          currency: "MXN",
          status: "success",
        };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Website không mở được");
  } finally {
    await browser.close();
  }
}

// ---------- 2. Creative: rule-based cho mọi ad + Pollinations AI cho top 10 ----------
export function classifyCreative(text) {
  const lower = (text || "").toLowerCase();
  const angles = CREATIVE_ANGLES.filter((a) => a.keywords.some((k) => lower.includes(k))).map((a) => a.key);
  const offers = CREATIVE_OFFERS.filter((o) => {
    if (o.pattern) return o.pattern.test(text || "");
    return o.keywords.some((k) => lower.includes(k));
  }).map((o) => o.key);
  const hook = (text || "").trim().replace(/\s+/g, " ").slice(0, 120);
  return { angles, offers, hook };
}

export async function summarizeWithPollinations(pageName, creativeText) {
  const prompt = `Tóm tắt trong 1 câu tiếng Việt, góc bán chính và offer (nếu có) của quảng cáo sau của ${pageName}: ${String(creativeText || "").slice(0, 500)}`;
  const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Pollinations trả ${res.status}`);
  const out = (await res.text()).trim();
  return out ? out.slice(0, 500) : null;
}

async function runCreative(client) {
  // Chỉ phân tích ad MX/US mỹ phẩm (scope hiện tại), chưa phân tích thì mới phân tích —
  // chạy lại job không phân tích lại ad cũ, trừ khi muốn làm mới thì xóa bảng creative_analysis.
  const { rows: ads } = await client.query(
    `SELECT ad_id, page_name, creative_text, is_active, days_active FROM ads
     WHERE category = 'Mỹ phẩm & Làm đẹp' AND countries && ARRAY['MX','US']
     AND ad_id NOT IN (SELECT ad_id FROM creative_analysis)
     ORDER BY days_active DESC NULLS LAST, last_seen_at DESC LIMIT 5000`
  );
  let analyzed = 0;
  for (const ad of ads) {
    const { angles, offers, hook } = classifyCreative(ad.creative_text);
    await client.query(
      `INSERT INTO creative_analysis (ad_id, angles, offers, hook) VALUES ($1, $2, $3, $4)
       ON CONFLICT (ad_id) DO UPDATE SET angles = EXCLUDED.angles, offers = EXCLUDED.offers, hook = EXCLUDED.hook, analyzed_at = now()`,
      [ad.ad_id, angles, offers, hook]
    );
    analyzed++;
  }
  // AI tóm tắt cho tối đa 10 ad bền nhất đang chạy, chưa có ai_summary — lỗi AI không làm hỏng rule.
  const { rows: topAds } = await client.query(
    `SELECT a.ad_id, a.page_name, a.creative_text FROM ads a
     JOIN creative_analysis c ON c.ad_id = a.ad_id
     WHERE a.is_active AND c.ai_summary IS NULL
     ORDER BY a.days_active DESC NULLS LAST LIMIT 10`
  );
  let aiOk = 0;
  for (const ad of topAds) {
    try {
      const summary = await summarizeWithPollinations(ad.page_name, ad.creative_text);
      if (summary) {
        await client.query(`UPDATE creative_analysis SET ai_summary = $2 WHERE ad_id = $1`, [ad.ad_id, summary]);
        aiOk++;
      }
    } catch (err) {
      console.error(`[competitors:creative] AI lỗi cho ad ${ad.ad_id}: ${String(err.message).slice(0, 150)}`);
    }
    await sleep(2000);
  }
  console.log(`[competitors:creative] Phân tích rule: ${analyzed} ad mới, AI tóm tắt thành công: ${aiOk}/${topAds.length} ad.`);
  return analyzed;
}

// ---------- 3. Social: YouTube (API nếu có key, không thì Playwright search) + Facebook (Page từ DB) ----------
async function fetchYouTubeApi(brandName) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null; // null = chưa có key, caller chuyển sang Playwright, không phải lỗi
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(brandName)}&key=${key}`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) }
  );
  if (!searchRes.ok) throw new Error(`YouTube API trả ${searchRes.status}`);
  const searchJson = await searchRes.json();
  const channel = (searchJson.items || [])[0];
  if (!channel) throw new Error("YouTube API không tìm thấy kênh");
  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channel.id.channelId}&key=${key}`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) }
  );
  const statsJson = await statsRes.json();
  const stats = (statsJson.items || [])[0]?.statistics || {};
  return {
    handle: channel.snippet?.customUrl || null,
    channel_name: channel.snippet?.title || null,
    followers: stats.subscriberCount != null ? Number(stats.subscriberCount) : null,
    video_count: stats.videoCount != null ? Number(stats.videoCount) : null,
    url: `https://www.youtube.com/channel/${channel.id.channelId}`,
    status: "success",
  };
}

async function fetchYouTubeBrowser(brandName, browser) {
  const page = await browser.newPage({ userAgent: UA });
  try {
    await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(brandName)}&sp=EgIQAg%3D%3D`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(4000);
    const data = await page.evaluate(() => {
      const channelEl = document.querySelector("ytd-channel-renderer");
      if (!channelEl) return null;
      const nameEl = channelEl.querySelector("#channel-name #text, yt-formatted-string#text");
      const metaEl = channelEl.querySelector("#metadata");
      const linkEl = channelEl.querySelector("a#main-link, a.yt-simple-endpoint");
      return {
        channel_name: nameEl ? nameEl.textContent.trim() : null,
        meta: metaEl ? metaEl.textContent.trim() : null,
        url: linkEl ? linkEl.href : null,
      };
    });
    if (!data || !data.channel_name) throw new Error("YouTube search không thấy kênh (có thể bị chặn bot)");
    const subsMatch = (data.meta || "").match(/([\d.,]+\s*[KM]?)\s*subscribers/i);
    return {
      handle: null,
      channel_name: data.channel_name,
      followers: subsMatch ? parseCount(subsMatch[1]) : null,
      video_count: null,
      url: data.url,
      status: "success",
    };
  } finally {
    await page.close();
  }
}

async function fetchFacebookPage(brandName, client, browser) {
  // Page có nhiều ad nhất của brand trong DB (MX/US mỹ phẩm) — đã xác minh qua Meta Ad Library.
  const { rows } = await client.query(
    `SELECT page_id, page_name, COUNT(*) AS total FROM ads
     WHERE category = 'Mỹ phẩm & Làm đẹp' AND countries && ARRAY['MX','US']
     AND (page_name ILIKE $1 OR keyword ILIKE $1)
     GROUP BY page_id, page_name ORDER BY total DESC LIMIT 1`,
    [`%${brandName}%`]
  );
  if (!rows.length) throw new Error("Không tìm thấy Page Facebook của brand trong DB ads");
  const page = await browser.newPage({ userAgent: UA });
  try {
    await page.goto(`https://www.facebook.com/${rows[0].page_id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    const text = await page.evaluate(() => document.body.innerText.slice(0, 20000));
    const m = text.match(/([\d.,]+\s*[KM]?)\s*(followers|seguidores)/i);
    return {
      handle: rows[0].page_id,
      channel_name: rows[0].page_name,
      followers: m ? parseCount(m[1]) : null,
      video_count: null,
      url: `https://www.facebook.com/${rows[0].page_id}`,
      status: "success",
    };
  } finally {
    await page.close();
  }
}

async function runSocial(client, brands) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    for (const brand of brands) {
      // YouTube
      try {
        let yt = await fetchYouTubeApi(brand.name);
        if (!yt) yt = await fetchYouTubeBrowser(brand.name, browser);
        await client.query(
          `INSERT INTO social_profiles (brand, source, handle, channel_name, followers, video_count, url, status)
           VALUES ($1, 'youtube', $2, $3, $4, $5, $6, $7)`,
          [brand.name, yt.handle, yt.channel_name, yt.followers, yt.video_count, yt.url, yt.status]
        );
        console.log(`[competitors:social] YouTube ${brand.name}: ${yt.channel_name} — ${yt.followers ?? "không rõ subs"}`);
      } catch (err) {
        await client.query(
          `INSERT INTO social_profiles (brand, source, status, error_message) VALUES ($1, 'youtube', 'blocked', $2)`,
          [brand.name, String(err.message).slice(0, 500)]
        );
        console.error(`[competitors:social] YouTube ${brand.name} LỖI: ${String(err.message).slice(0, 150)}`);
      }
      // Facebook
      try {
        const fb = await fetchFacebookPage(brand.name, client, browser);
        await client.query(
          `INSERT INTO social_profiles (brand, source, handle, channel_name, followers, url, status)
           VALUES ($1, 'facebook', $2, $3, $4, $5, $6)`,
          [brand.name, fb.handle, fb.channel_name, fb.followers, fb.url, fb.status]
        );
        console.log(`[competitors:social] Facebook ${brand.name}: ${fb.channel_name} — ${fb.followers ?? "không rõ followers"}`);
      } catch (err) {
        await client.query(
          `INSERT INTO social_profiles (brand, source, status, error_message) VALUES ($1, 'facebook', 'error', $2)`,
          [brand.name, String(err.message).slice(0, 500)]
        );
        console.error(`[competitors:social] Facebook ${brand.name} LỖI: ${String(err.message).slice(0, 150)}`);
      }
      // Instagram: chưa cấu hình handle — ghi rõ, không đoán handle.
      await client.query(
        `INSERT INTO social_profiles (brand, source, status, error_message) VALUES ($1, 'instagram', 'not_configured', $2)`,
        [brand.name, "Chưa cấu hình handle Instagram chính thức trong config/competitors.js — gửi handle là chạy được."]
      );
      await delay();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = (args.find((a) => a.startsWith("--source=")) || "").split("=")[1] || "all";
  const brandArg = (args.find((a) => a.startsWith("--brand=")) || "").split("=")[1] || "";
  const sources = sourceArg === "all" ? ["website", "creative", "social"] : [sourceArg];
  const brands = brandArg ? COMPETITOR_BRANDS.filter((b) => b.name.toLowerCase() === brandArg.toLowerCase()) : COMPETITOR_BRANDS;
  if (!brands.length) {
    console.error(`Không tìm thấy brand "${brandArg}" trong config/competitors.js`);
    process.exitCode = 2;
    return;
  }
  if (!sources.every((s) => ["website", "creative", "social"].includes(s))) {
    console.error(`--source phải là website | creative | social | all, nhận được "${sourceArg}"`);
    process.exitCode = 2;
    return;
  }
  const client = await pool.connect();
  try {
    for (const source of sources) {
      if (source === "creative") {
        await runCreative(client);
        continue;
      }
      if (source === "website") {
        for (const brand of brands) {
          try {
            const data = await fetchWebsite(brand);
            await client.query(
              `INSERT INTO website_snapshots (brand, website_url, page_title, promo_texts, products, price_min, price_max, currency, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [brand.name, data.website_url, data.page_title, JSON.stringify(data.promo_texts), JSON.stringify(data.products), data.price_min, data.price_max, data.currency, data.status]
            );
            console.log(`[competitors:website] ${brand.name}: ${data.promo_texts.length} promo, ${data.products.length} sản phẩm, giá ${data.price_min ?? "—"}-${data.price_max ?? "—"}`);
          } catch (err) {
            await client.query(
              `INSERT INTO website_snapshots (brand, website_url, status, error_message) VALUES ($1, $2, 'blocked', $3)`,
              [brand.name, brand.websiteUrl, String(err.message).slice(0, 500)]
            );
            console.error(`[competitors:website] ${brand.name} LỖI: ${String(err.message).slice(0, 150)}`);
          }
          await delay();
        }
      }
      if (source === "social") {
        await runSocial(client, brands);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
  console.log("[competitors] Hoàn thành.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[competitors] Job lỗi nghiêm trọng:", err);
    process.exitCode = 1;
  });
}
