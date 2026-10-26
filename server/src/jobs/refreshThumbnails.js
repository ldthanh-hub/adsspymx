// Job làm mới thumbnail cho ad đang chạy (26/10/2026).
//
// TẠI SAO CẦN JOB NÀY: thumbnail_url là link CDN trực tiếp của Meta có token hết hạn
// (xem ghi chú trong lib/adLibraryScraper.js + db/schema.sql). Job quét từ khóa hàng ngày
// chỉ làm mới thumbnail cho ad mà lần quét TRẢ VỀ (scanKeyword.js upsert); ad không còn
// lọt vào kết quả quét thì URL cứ già đi rồi chết — đã kiểm chứng 11/12 thumbnail ad
// checklist trả 403. Job này mở lại từng trang ad gốc (snapshot_url) để lấy poster mới.
//
// PHẠM VI MẶC ĐỊNH: ad đang chạy của Page thuộc 30 brand checklist (đúng tab Quảng cáo
// hiện tại) — Page phải thỏa CẢ 2 điều kiện của giao diện: tên khớp checklist VÀ (chưa có
// category HOẶC có category mỹ phẩm). Đã kiểm chứng live 26/10/2026: 74 Page khớp tên,
// giữ 72, loại đúng 2 Page đồ gia dụng ("Mundo de Artesanías y Manualidades", "Roca
// Natura"), ~309 ad đang chạy. Tổng ad đang chạy toàn DB là 2724 nên quét hết 1 lần là
// quá nặng — muốn quét toàn bộ thì chạy với --scope=all (vẫn giới hạn --limit mỗi lần,
// ad thấy lần đầu sớm nhất được quét trước).
//
// AN TOÀN: job KHÔNG BAO GIỜ xoá thumbnail đang có — chỉ UPDATE khi trích xuất được URL
// mới; ad lỗi/timeout/không có media thì giữ nguyên URL cũ và đếm vào cột thất bại trong
// bảng tổng kết cuối log, để người đọc log tự đánh giá (đặc biệt lần chạy đầu tiên: nếu
// cột "làm mới" = 0 thì DOM trang ad đơn khác với trang kết quả tìm kiếm, cần sửa hàm
// trích xuất trước khi tin job này).
//
// THỨ TỰ: ad thấy lần đầu sớm nhất trước (first_seen_at ASC) — thumbnail của ad cũ là
// thumbnail già nhất, chết trước.
//
// Cách chạy: npm run refresh:thumbnails [-- --scope=checklist|all --limit=400 --concurrency=3]
//   (workflow .github/workflows/refresh-thumbnails.yml chạy lịch hàng ngày + bấm tay)
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { pool } from "../db/pool.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const AVATAR_MAX_SIDE = 64; // giống adLibraryScraper: loại avatar Page ~60x60
const HEAD_TIMEOUT_MS = 10000;
const PAGE_TIMEOUT_MS = 30000;
const SETTLE_MS = 2000; // chờ media lazy-load sau khi trang ad đơn render xong

// 30 brand checklist — CÙNG nguồn với web/lib/ui.js CHECKLIST_BRANDS (chỉ lấy tên, vì
// hàm khớp dùng tên sau chuẩn hoá). Sửa checklist ở ui.js thì nhớ sửa cả đây.
const CHECKLIST_NAMES = [
  "Medicube", "Rejuran", "Anua", "VT", "EQQUALBERRY", "SKIN1004", "Dr. Althea",
  "Eucerin", "Round Lab", "Beauty of Joseon", "Seyoul", "CeraVe", "La Roche-Posay",
  "Neutrogena", "Cetaphil", "Olay", "Nivea", "Lancôme", "The Ordinary", "Clinique",
  "Paula's Choice", "SkinCeuticals", "Estée Lauder", "Aveeno", "Drunk Elephant",
  "Glow Recipe", "Natura", "Arabela", "Jafra", "Mary Kay",
];

// Khớp 1 tên Page với checklist — copy nguyên logic web/lib/ui.js pageMatchesTracked:
//   VT, Natura, Olay: khớp theo TỪ độc lập — "Naturales" không được tính là "Natura",
//   "VT" không được tính khi nằm trong từ khác (VD "VT" trong "Private").
//   Các brand còn lại: khớp chuỗi sau khi chuẩn hoá (bỏ khoảng trắng/dấu chấm/gạch
//   dưới/gạch nối, không phân biệt hoa thường).
export function pageMatchesChecklist(pageName) {
  const name = String(pageName || "");
  for (const brand of CHECKLIST_NAMES) {
    if (brand === "VT") {
      if (/\bvt\b/i.test(name) || /^vt[\s_\-]/i.test(name) || name.trim().toLowerCase() === "vt") return true;
    } else if (brand === "Natura" || brand === "Olay") {
      if (new RegExp(`\\b${brand}\\b`, "i").test(name)) return true;
    } else {
      const norm = (s) => String(s).toLowerCase().replace(/[\s._\-]+/g, "");
      if (norm(name).includes(norm(brand))) return true;
    }
  }
  return false;
}

// Giữ Page khi chưa có category HOẶC có category Mỹ phẩm & Làm đẹp — copy nguyên logic
// web/lib/ui.js isCosmeticsOrUnknownPage. Đây là nửa thứ hai của phạm vi, không thể thiếu:
// chỉ khớp tên thì "Mundo de Artesanías y Manualidades" (chứa "anua" trong "Manualidades")
// và "Roca Natura" (chứa từ "Natura") đều lọt — cả 2 đều là đồ gia dụng, đã kiểm chứng
// live 26/10/2026 là bị loại đúng nhờ categories = ["Đồ gia dụng"].
// cats = mảng category KHÁC NULL của Page (gộp từ mọi ad MX/US của Page đó).
export function pageInChecklistScope(pageName, cats) {
  const list = cats || [];
  return pageMatchesChecklist(pageName) && (list.length === 0 || list.includes("Mỹ phẩm & Làm đẹp"));
}

function parseArgs(argv) {
  const args = { scope: "checklist", limit: 400, concurrency: 3 };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (!m) continue;
    if (m[1] === "scope" && (m[2] === "checklist" || m[2] === "all")) args.scope = m[2];
    if (m[1] === "limit") args.limit = Math.max(1, parseInt(m[2], 10) || 400);
    if (m[1] === "concurrency") args.concurrency = Math.min(5, Math.max(1, parseInt(m[2], 10) || 3));
  }
  return args;
}

// HEAD-check: link còn sống thì bỏ qua, khỏi tốn 1 lần mở trang Meta. HEAD lỗi/403/404/
// timeout đều coi là "chết" → cần quét lại (chiều an toàn: quét thừa thì chỉ tốn thời gian,
// không bao giờ làm hỏng dữ liệu).
export async function isThumbnailAlive(url) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Trích xuất thumbnail từ TRANG AD ĐƠN (snapshot_url) — dùng ĐÚNG heuristic đã kiểm chứng
// của adLibraryScraper.pickThumbnail, chỉ khác phạm vi: toàn bộ document thay vì 1 card
// trong trang kết quả tìm kiếm. Ưu tiên poster video, fallback ảnh lớn nhất (loại avatar).
export async function extractThumbnail(page, snapshotUrl) {
  await page.goto(snapshotUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);
  return page.evaluate((avatarMaxSide) => {
    const video = document.querySelector("video[poster]");
    if (video && video.poster) return { url: video.poster, mediaType: "video" };
    const imgs = Array.from(document.querySelectorAll("img"))
      .map((img) => ({
        src: img.src,
        area: (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0),
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0,
      }))
      .filter((i) => i.src && i.w > avatarMaxSide && i.h > avatarMaxSide);
    if (imgs.length === 0) return { url: null, mediaType: "none" };
    imgs.sort((a, b) => b.area - a.area);
    return { url: imgs[0].src, mediaType: "image" };
  }, AVATAR_MAX_SIDE);
}

async function main() {
  const { scope, limit, concurrency } = parseArgs(process.argv);
  const started = Date.now();
  console.log(`[refresh] bắt đầu: scope=${scope}, limit=${limit}, concurrency=${concurrency}`);

  // Phạm vi checklist = đúng luật của giao diện (web/lib/ui.js + web/pages/index.js):
  // tên Page khớp checklist VÀ (chưa có category HOẶC có category mỹ phẩm). Categories
  // tính trên mọi ad MX/US của Page (không lọc category trước — nếu lọc trước thì Page
  // chỉ có ad chưa gắn category như Medicube sẽ biến mất khỏi danh sách, đúng lỗi mà
  // patch checklist-lock đã sửa ở Dashboard).
  let pageFilter = "";
  let pageValues = [];
  if (scope === "checklist") {
    const { rows: pageRows } = await pool.query(
      `SELECT page_name,
              COALESCE(ARRAY_AGG(DISTINCT category) FILTER (WHERE category IS NOT NULL), '{}') AS cats
       FROM ads
       WHERE countries && ARRAY['MX', 'US']
       GROUP BY page_name`
    );
    const tracked = pageRows.filter((p) => pageInChecklistScope(p.page_name, p.cats)).map((p) => p.page_name);
    console.log(`[refresh] Page thuộc phạm vi checklist: ${tracked.length} (trên ${pageRows.length} Page MX/US)`);
    if (!tracked.length) {
      console.log("[refresh] không có Page nào thuộc phạm vi — dừng, không làm gì.");
      await pool.end();
      return;
    }
    pageFilter = `AND page_name = ANY($2::text[])`;
    pageValues = [tracked];
  }

  const { rows: todo } = await pool.query(
    `SELECT ad_id, page_name, snapshot_url, thumbnail_url
     FROM ads
     WHERE is_active = true AND thumbnail_url IS NOT NULL AND snapshot_url IS NOT NULL
       AND countries && ARRAY['MX', 'US'] ${pageFilter}
     ORDER BY first_seen_at ASC
     LIMIT $1`,
    [limit, ...pageValues]
  );
  console.log(`[refresh] sẽ xử lý lần này: ${todo.length} ad`);

  // Bước 1: HEAD-check toàn bộ — chỉ ad nào link chết mới tốn 1 lần mở trang Meta.
  // Chạy theo đợt 20 để không kéo dài vô lý khi nhiều link timeout (tuần tự thì worst-case
  // 309 ad × 10s timeout = ~50 phút chỉ cho bước kiểm tra).
  const needRescrape = [];
  let alive = 0;
  for (let s = 0; s < todo.length; s += 20) {
    const batch = todo.slice(s, s + 20);
    const results = await Promise.all(batch.map((ad) => isThumbnailAlive(ad.thumbnail_url)));
    results.forEach((ok, i) => {
      if (ok) alive++;
      else needRescrape.push(batch[i]);
    });
  }
  console.log(`[refresh] link còn sống (bỏ qua): ${alive}; link chết, cần quét lại: ${needRescrape.length}`);

  // Bước 2: mở lại từng trang ad gốc, lấy poster mới, UPDATE chỉ khi lấy được URL mới.
  let refreshed = 0;
  let noMedia = 0;
  let failed = 0;
  if (needRescrape.length > 0) {
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    try {
      let idx = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        const page = await context.newPage();
        try {
          for (;;) {
            const i = idx++;
            if (i >= needRescrape.length) break;
            const ad = needRescrape[i];
            try {
              const found = await extractThumbnail(page, ad.snapshot_url);
              if (found.url) {
                await pool.query(
                  "UPDATE ads SET thumbnail_url = $1, media_type = $2 WHERE ad_id = $3",
                  [found.url, found.mediaType, ad.ad_id]
                );
                refreshed++;
              } else {
                noMedia++;
                console.log(`[refresh] ${ad.ad_id} (${ad.page_name}): trang ad không có media nhận diện được — giữ URL cũ`);
              }
            } catch (err) {
              failed++;
              console.log(`[refresh] ${ad.ad_id} (${ad.page_name}): lỗi — ${err.message} — giữ URL cũ`);
            }
          }
        } finally {
          await page.close().catch(() => {});
        }
      });
      await Promise.all(workers);
    } finally {
      await browser.close().catch(() => {});
    }
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(
    `[refresh] XONG sau ${mins} phút: xử lý ${todo.length} ad | còn sống ${alive} | làm mới ${refreshed} | không có media ${noMedia} | lỗi ${failed}`
  );
  await pool.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[refresh] LỖI NẶNG, job dừng:", err);
    process.exit(1);
  });
}
