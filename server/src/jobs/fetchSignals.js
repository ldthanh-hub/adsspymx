// Job kéo tín hiệu NGOÀI Meta cho 11 brand (10 đối thủ + Seyoul) — Google Trends, Mercado
// Libre Mexico, TikTok hashtag. Chạy bằng GitHub Actions (xem .github/workflows/fetch-signals.yml),
// KHÔNG chạy trên Render, vì: (1) job cần trình duyệt thật cho fallback Mercado, (2) chạy theo
// lịch 1 lần/ngày là đủ cho số liệu xu hướng, không cần realtime.
//
// Cách dùng tay (giống fetchOneKeyword.js):
//   npm run fetch:signals                    -- kéo cả 3 nguồn, cả 11 brand
//   npm run fetch:signals -- --source=tiktok -- kéo riêng TikTok
//   npm run fetch:signals -- --source=mercado --brand=Medicube
//
// KẾT QUẢ KIỂM CHỨNG THẬT TỪ VM NGÀY 26/10/2026 — đọc trước khi tin vào job:
//   - TikTok (TikWM challenge/info): HOẠT ĐỘNG, không cần key. 11/11 brand có số (trừ Round Lab
//     phải dùng hashtag "roundlabskincare", VT dùng "vtcosmetics" — xem config/signals.js).
//   - Mercado Libre API (api.mercadolibre.com/sites/MLM/search): BỊ CHẶN 403 PolicyAgent từ IP
//     VM cho cả 5 site MLM/MLA/MLB/MCO/MLU, dù đổi User-Agent. Vì vậy fetcher Mercado thử API
//     trước, nếu 403 thì chuyển sang Playwright mở trang web listado.mercadolibre.com.mx —
//     trang web cho người dùng thật có cơ hội qua cao hơn API. Nếu cả 2 đều chặn thì ghi
//     signal_runs status='blocked', KHÔNG bịa số, panel dashboard hiện đúng trạng thái đó.
//   - Google Trends API (cùng API pytrends dùng): từ VM trả 429 (quá nhiều request, IP dùng
//     chung) và 411 khi qua pytrends. Fetcher Trends làm đúng luồng API chính thức của Trends
//     (explore -> widgetdata/multiline, lấy cookie NID trước), nhưng nếu Google vẫn chặn thì
//     ghi status='blocked' và panel hiện trạng thái — lần chạy đầu trên GitHub Actions (IP khác
//     VM) mới là phép thử thật cho nguồn này, đừng báo "Trends đã có số" trước khi thấy snapshot
//     đầu tiên trong DB.
//
// Mỗi nguồn, mỗi brand là 1 dòng signal_runs riêng — 1 brand lỗi không làm hỏng các brand khác,
// và dashboard luôn biết lần chạy cuối của từng nguồn là khi nào, thành công hay bị chặn.
import { fileURLToPath } from "node:url";
import { pool } from "../db/pool.js";
import { SIGNAL_BRANDS, SIGNAL_DELAY_SECONDS } from "../config/signals.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const delay = () => sleep(SIGNAL_DELAY_SECONDS * 1000);

// ---------- TikTok: TikWM challenge/info (đã kiểm chứng thật, không cần key) ----------
export async function fetchTikTokHashtag(hashtag) {
  const url = `https://www.tikwm.com/api/challenge/info?challenge_name=${encodeURIComponent(hashtag)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  // TikWM khi bị Cloudflare chặn sẽ trả HTML "Just a moment..." thay vì JSON — nhận diện
  // rõ trường hợp này, không parse bừa thành số 0.
  if (text.includes("Just a moment") || !text.trim().startsWith("{")) {
    throw new Error(`TikWM bị Cloudflare chặn (trả HTML thay vì JSON) cho hashtag ${hashtag}`);
  }
  const json = JSON.parse(text);
  const data = json.data;
  if (!data || json.code !== 0 || data.view_count == null) {
    throw new Error(`TikWM không có số cho hashtag ${hashtag} (code=${json.code})`);
  }
  return { view_count: Number(data.view_count), user_count: Number(data.user_count) || 0 };
}

// ---------- Mercado Libre: API trước, Playwright sau ----------
export async function fetchMercadoApi(query) {
  const url = `https://api.mercadolibre.com/sites/MLM/search?q=${encodeURIComponent(query)}&limit=50`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mercado API trả ${res.status}: ${body.slice(0, 120)}`);
  }
  const json = await res.json();
  return (json.results || []).map((r) => ({
    item_id: r.id,
    title: r.title || "",
    price: r.price != null ? Number(r.price) : null,
    currency: r.currency_id || "MXN",
    sold_quantity: r.sold_quantity != null ? Number(r.sold_quantity) : 0,
    available_quantity: r.available_quantity != null ? Number(r.available_quantity) : null,
    seller_nickname: (r.seller && r.seller.nickname) || null,
    permalink: r.permalink || null,
    thumbnail: r.thumbnail || null,
  }));
}

// Fallback bằng trình duyệt thật: mở trang tìm kiếm Mercado Mexico, đọc tối đa 50 kết quả.
// Số "đã bán" trên trang web nằm trong chuỗi kiểu "100 vendidos" / "+1k vendidos" — hàm này
// chỉ parse được dạng số thường, dạng "+1k" thì ghi null (không đoán 1000) để khỏi bịa số.
function parseSoldText(text) {
  if (!text) return null;
  const m = text.match(/([\d.,]+)\s*vendid/);
  if (!m) return null;
  if (/\+|k$/i.test(m[0])) return null;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function fetchMercadoBrowser(query) {
  // Import động: job TikTok/Trends không cần Chromium, chỉ khi Mercado API bị chặn mới cần.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ userAgent: UA });
    await page.goto(`https://listado.mercadolibre.com.mx/${encodeURIComponent(query)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForSelector(".ui-search-result", { timeout: 30000 });
    const items = await page.$$eval(".ui-search-result", (cards) =>
      cards.slice(0, 50).map((card) => {
        const titleEl = card.querySelector(".ui-search-item__title");
        const linkEl = card.querySelector("a.ui-search-link");
        const priceEl = card.querySelector(".andes-money-amount__fraction");
        const soldEl = card.querySelector(".ui-search-item__subtitle, .ui-search-item__group__element");
        return {
          title: titleEl ? titleEl.textContent.trim() : "",
          permalink: linkEl ? linkEl.href : null,
          priceText: priceEl ? priceEl.textContent.trim() : null,
          soldText: soldEl ? soldEl.textContent.trim() : null,
        };
      })
    );
    return items.map((it, i) => ({
      item_id: `web-${Buffer.from(it.permalink || it.title || String(i)).toString("base64").slice(0, 24)}`,
      title: it.title,
      price: it.priceText ? Number(it.priceText.replace(/[^\d]/g, "")) || null : null,
      currency: "MXN",
      sold_quantity: parseSoldText(it.soldText),
      available_quantity: null,
      seller_nickname: null,
      permalink: it.permalink,
      thumbnail: null,
    }));
  } finally {
    await browser.close();
  }
}

export async function fetchMercado(query) {
  try {
    return await fetchMercadoApi(query);
  } catch (apiErr) {
    console.log(`[signals:mercado] API bị chặn (${apiErr.message.slice(0, 100)}) — chuyển sang trình duyệt thật.`);
    return await fetchMercadoBrowser(query);
  }
}

// ---------- Google Trends: luồng explore -> widgetdata/multiline ----------
// Trả về { avg, max, last, points: [{date, value}] } cho 1 từ khóa, vùng MX, 90 ngày.
// Lưu ý đọc số, QUAN TRỌNG: value là CHỈ SỐ TƯƠNG ĐỐI 0-100 được chuẩn hóa RIÊNG cho từng
// từ khóa (100 = đỉnh của chính brand đó trong 90 ngày), KHÔNG phải lượt tìm tuyệt đối và
// KHÔNG so sánh trực tiếp avg giữa các brand với nhau (avg 47 của Medicube không có nghĩa là
// tìm kiếm gấp 5 lần Seyoul avg 9 — mỗi series có mẫu số riêng). Muốn so sánh trực tiếp thì
// phải gọi 1 request chung nhiều từ khóa (tối đa 5 từ/request) — đó là bước nâng cấp sau,
// không làm trong lần đầu này để khỏi phức tạp hóa job khi chưa có snapshot đầu tiên.
export async function fetchGoogleTrends(keyword, geo = "MX") {
  const headers = { "User-Agent": UA, Accept: "application/json, text/plain, */*" };
  // Bước 0: lấy cookie NID từ trang Trends (trang chủ trả 200 từ VM ngày 26/10/2026).
  const home = await fetch("https://trends.google.com/trends/", { headers, signal: AbortSignal.timeout(30000) });
  const cookie = (home.headers.get("set-cookie") || "").split(";")[0];
  const cookieHeader = cookie ? { Cookie: cookie } : {};
  // Bước 1: explore để lấy token widget. Lưu ý môi trường: POST explore qua proxy của VM bị
  // Google trả 411 (Length Required — đã kiểm chứng thật, cả pytrends cũng 411), nên job dùng
  // GET explore (từ VM GET trả 200 và có token) + widget.request nguyên văn ở bước 2. Nếu
  // GitHub Actions cũng 411 thì signal_runs sẽ ghi blocked, không bịa số.
  const req = { comparisonItem: [{ keyword, geo, time: "today 3-m" }], category: 0, property: "" };
  const exploreUrl = `https://trends.google.com/trends/api/explore?hl=es-MX&tz=-360&req=${encodeURIComponent(JSON.stringify(req))}`;
  const exploreRes = await fetch(exploreUrl, { headers: { ...headers, ...cookieHeader }, signal: AbortSignal.timeout(30000) });
  if (!exploreRes.ok) throw new Error(`Trends explore trả ${exploreRes.status}`);
  const exploreText = await exploreRes.text();
  const exploreJson = JSON.parse(exploreText.slice(exploreText.indexOf("{")));
  const widget = (exploreJson.widgets || []).find((w) => w.id === "TIMESERIES");
  if (!widget || !widget.token || !widget.request) throw new Error("Trends explore không trả token TIMESERIES");
  // Bước 2: lấy chuỗi theo tuần — ĐÚNG luồng pytrends: dùng NGUYÊN VĂN widget.request mà
  // explore trả về, không tự dựng lại req (tự dựng sai 1 field là widgetdata trả 400, đã
  // kiểm chứng thật từ VM ngày 26/10/2026 trước khi sửa theo cách này).
  const dataUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=es-MX&tz=-360&req=${encodeURIComponent(
    JSON.stringify(widget.request)
  )}&token=${widget.token}`;
  const dataRes = await fetch(dataUrl, { headers: { ...headers, ...cookieHeader }, signal: AbortSignal.timeout(30000) });
  if (!dataRes.ok) throw new Error(`Trends widgetdata trả ${dataRes.status}`);
  const dataText = await dataRes.text();
  const dataJson = JSON.parse(dataText.slice(dataText.indexOf("{")));
  const points = (dataJson.default?.timelineData || []).map((p) => ({
    date: p.formattedTime,
    value: Array.isArray(p.value) ? Number(p.value[0]) : Number(p.value),
  }));
  if (!points.length) throw new Error("Trends không trả điểm dữ liệu nào");
  const values = points.map((p) => p.value).filter((v) => Number.isFinite(v));
  return {
    avg: Math.round(values.reduce((s, v) => s + v, 0) / Math.max(1, values.length)),
    max: Math.max(...values),
    last: values[values.length - 1],
    points,
  };
}

// ---------- Ghi DB ----------
async function recordRun(client, source, brand, status, itemsFound, errorMessage) {
  await client.query(
    `INSERT INTO signal_runs (source, brand, status, items_found, error_message, finished_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [source, brand, status, itemsFound, errorMessage ? String(errorMessage).slice(0, 500) : null]
  );
}

async function runSource(source, brands) {
  const client = await pool.connect();
  let ok = 0;
  try {
    for (const brand of brands) {
      const started = new Date().toISOString();
      try {
        if (source === "tiktok") {
          const data = await fetchTikTokHashtag(brand.tiktokHashtag);
          await client.query(
            `INSERT INTO tiktok_hashtags (brand, hashtag, view_count, user_count) VALUES ($1, $2, $3, $4)`,
            [brand.name, brand.tiktokHashtag, data.view_count, data.user_count]
          );
          await recordRun(client, source, brand.name, "success", 1, null);
          console.log(`[signals:tiktok] ${brand.name} #${brand.tiktokHashtag}: ${data.view_count} views, ${data.user_count} creators`);
          ok++;
        } else if (source === "mercado") {
          const items = await fetchMercado(brand.mercadoQuery);
          for (const it of items) {
            await client.query(
              `INSERT INTO mercado_listings (brand, item_id, title, price, currency, sold_quantity, available_quantity, seller_nickname, permalink, thumbnail)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [brand.name, it.item_id, it.title, it.price, it.currency, it.sold_quantity, it.available_quantity, it.seller_nickname, it.permalink, it.thumbnail]
            );
          }
          await recordRun(client, source, brand.name, "success", items.length, null);
          console.log(`[signals:mercado] ${brand.name}: ${items.length} listing`);
          ok++;
        } else if (source === "trends") {
          const data = await fetchGoogleTrends(brand.trendsKeyword, "MX");
          await client.query(
            `INSERT INTO google_trends (brand, keyword, geo, interest_avg, interest_max, interest_last, points)
             VALUES ($1, $2, 'MX', $3, $4, $5, $6)`,
            [brand.name, brand.trendsKeyword, data.avg, data.max, data.last, JSON.stringify(data.points)]
          );
          await recordRun(client, source, brand.name, "success", data.points.length, null);
          console.log(`[signals:trends] ${brand.name}: avg=${data.avg}, max=${data.max}, last=${data.last} (${data.points.length} tuần)`);
          ok++;
        }
      } catch (err) {
        // Phân biệt "bị chặn" với lỗi thường: panel dashboard hiện đúng 2 trạng thái khác nhau.
        const msg = err.message || String(err);
        const blocked = /403|429|411|Cloudflare|blocked|chặn/i.test(msg);
        await recordRun(client, source, brand.name, blocked ? "blocked" : "error", 0, msg);
        console.error(`[signals:${source}] ${brand.name} LỖI (${blocked ? "blocked" : "error"}): ${msg.slice(0, 200)}`);
      }
      console.log(`[signals:${source}] ${brand.name} bắt đầu ${started} — chờ ${SIGNAL_DELAY_SECONDS}s trước brand tiếp theo.`);
      await delay();
    }
  } finally {
    client.release();
  }
  return ok;
}

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = (args.find((a) => a.startsWith("--source=")) || "").split("=")[1] || "all";
  const brandArg = (args.find((a) => a.startsWith("--brand=")) || "").split("=")[1] || "";
  const sources = sourceArg === "all" ? ["tiktok", "mercado", "trends"] : [sourceArg];
  const brands = brandArg ? SIGNAL_BRANDS.filter((b) => b.name.toLowerCase() === brandArg.toLowerCase()) : SIGNAL_BRANDS;
  if (!brands.length) {
    console.error(`Không tìm thấy brand "${brandArg}" trong config/signals.js`);
    process.exitCode = 2;
    return;
  }
  if (!sources.every((s) => ["tiktok", "mercado", "trends"].includes(s))) {
    console.error(`--source phải là tiktok | mercado | trends | all, nhận được "${sourceArg}"`);
    process.exitCode = 2;
    return;
  }
  let totalOk = 0;
  for (const source of sources) {
    totalOk += await runSource(source, brands);
  }
  console.log(`[signals] Hoàn thành: ${totalOk}/${sources.length * brands.length} lượt brand thành công.`);
  await pool.end();
  // Chỉ báo lỗi tiến trình khi KHÔNG brand nào thành công — còn lại thì dashboard đọc
  // signal_runs để thấy từng nguồn từng brand, không cần fail cả job vì 1 nguồn bị chặn.
  if (totalOk === 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[signals] Job lỗi nghiêm trọng:", err);
    process.exitCode = 1;
  });
}
