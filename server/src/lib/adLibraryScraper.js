// Scrape trang Ad Library CÔNG KHAI (facebook.com/ads/library) bằng Playwright — thay thế
// hoàn toàn cho metaAdLibrary.js (Graph API chính thức).
//
// TẠI SAO ĐỔI SANG CÁCH NÀY (đọc kỹ — quyết định kỹ thuật quan trọng nhất của dự án):
// Theo tài liệu chính thức tại facebook.com/ads/library/api, Meta Ad Library API (Graph API
// /ads_archive) CHỈ trả dữ liệu cho 2 nhóm: (1) quảng cáo về vấn đề xã hội/bầu cử/chính trị ở
// BẤT KỲ đâu, hoặc (2) quảng cáo BẤT KỲ loại nào nhưng chỉ nếu phân phối đến EU/UK. Mexico không
// thuộc EU/UK, và mỹ phẩm không phải quảng cáo chính trị/xã hội — nên API CHÍNH THỨC luôn trả về
// rỗng (hoặc lỗi permission) cho đúng use case của dự án này, KHÔNG có cách nào xin quyền để vượt
// qua giới hạn này (đã xác minh trực tiếp bằng cách gọi API thật qua Graph API Explorer, cùng lỗi).
//
// !!! CẢNH BÁO RỦI RO PHÁP LÝ — ĐỌC TRƯỚC KHI BẬT LẠI CRON HOẶC MỞ RỘNG QUY MÔ !!!
// facebook.com/ads/library là trang CÔNG KHAI, không cần đăng nhập để xem — nhưng Điều khoản
// dịch vụ của Meta cấm truy cập tự động (automated access/scraping) ngoài API chính thức được
// cấp phép. Vi phạm điều khoản này KHÔNG phải lỗi hình sự, nhưng Meta có toàn quyền:
//   - Chặn IP đang gọi (IP của Render/GitHub Actions runner) — job sẽ lỗi rõ ràng, không âm thầm.
//   - Trong trường hợp xấu, có hành động pháp lý dân sự nếu quy mô đủ lớn/mang tính thương mại.
// Vì đây là công cụ NỘI BỘ, KHÔNG bán/không thương mại hóa, tần suất THẤP (mặc định 1 lần/ngày,
// không phải real-time, không đăng nhập tài khoản cá nhân để chạy), rủi ro bị chú ý là thấp —
// nhưng KHÔNG BẰNG KHÔNG. Nếu job bắt đầu lỗi liên tục (xem bảng fetch_runs), đó là tín hiệu để
// TẠM DỪNG cron và xem lại, không phải để cố "né" bằng cách đổi proxy/User-Agent.
//
// GIỚI HẠN KỸ THUẬT QUAN TRỌNG — ĐỌC TRƯỚC KHI TIN TƯỞNG SỐ LIỆU:
// Meta không có class CSS hay data-testid ổn định cho các phần tử trên trang này (đã kiểm tra
// trực tiếp — toàn bộ là class CSS-in-JS ngẫu nhiên, đổi mỗi lần deploy/mỗi request). Code dưới
// đây parse THEO CẤU TRÚC VỊ TRÍ + heuristic (số Library ID luôn là 1 dãy 10-18 chữ số đứng sau
// dấu ":" ở đầu mỗi card) thay vì dựa vào chữ nhãn cụ thể — lý do: ngôn ngữ hiển thị của trang
// này phụ thuộc locale trình duyệt (đã kiểm tra trực tiếp bằng tài khoản thật: ra tiếng Việt;
// chưa có cách xác minh chắc chắn giao diện tiếng Anh sẽ hiển thị chữ gì khi chạy trên GitHub
// Actions — môi trường sandbox hiện tại không cho phép truy cập facebook.com để kiểm chứng).
// Vì vậy các nhãn dùng để định vị "tên Page"/"Được tài trợ" được match ĐA NGÔN NGỮ (Anh/Việt/Tây
// Ban Nha) — nếu Meta hiển thị ngôn ngữ khác hoặc đổi chữ, hàm có thể trả về page_name/creative
// rỗng dù vẫn lấy đúng library ID + ngày bắt đầu (2 field ít phụ thuộc ngôn ngữ nhất). KHÔNG throw
// ra ngoài — trả mảng rỗng/thiếu field, xem log & bảng fetch_runs để phát hiện sớm việc parser
// cần cập nhật lại.
//
// KHÔNG lấy được (so với kỳ vọng ban đầu dùng API): page_id dạng số (chỉ lấy được "page handle"
// dạng chữ nếu có link Page rõ ràng), ngày dừng chạy chính xác cho ad không còn hoạt động (trang
// danh sách không hiển thị), publisher_platforms (icon không có text/label ổn định để đọc).
//
// ẢNH ĐẠI DIỆN (thumbnail_url, thêm 11/09/2026): lấy trực tiếp link ảnh/poster video từ CDN của
// Facebook (scontent.*.fbcdn.net) — KHÔNG tải/host lại file (đúng nguyên tắc "chỉ lưu link" của dự
// án). Hệ quả: (1) link này có thể HẾT HẠN sau một thời gian vì là CDN URL có token, ảnh cũ trong
// DB có thể 404 — chấp nhận được vì job chạy lại hàng ngày sẽ tự làm mới link cho ad vẫn còn thấy;
// (2) ad dạng carousel chỉ lấy được ảnh ĐẦU TIÊN, không lấy hết các ảnh trong bộ.
//
// MEDIA_TYPE (thêm 11/09/2026): "video"/"image"/"none", suy ra từ CHÍNH heuristic thumbnail ở trên
// (không thêm giả định DOM mới) — dùng để lọc "Loại nội dung" ở giao diện.
//
// KHÔNG lưu "platform" (Facebook/Instagram/...) theo từng ad, dù URL search chấp nhận filter
// publisher_platforms[] thật (đã kiểm chứng bằng cách áp filter Platform trên trang thật và đọc URL
// kết quả). Lý do: đã kiểm tra trực tiếp DOM của dòng "Platforms" trên mỗi thẻ quảng cáo — mỗi icon
// nền tảng là 1 <div> dùng CSS mask-image trỏ tới 1 sprite ảnh dùng chung của Meta, xác định bằng
// mask-position tính theo PIXEL, KHÔNG có text/aria-label/alt/title nào để đọc ra tên nền tảng. Suy
// luận platform từ toạ độ pixel của sprite là cách làm cực kỳ dễ vỡ (Meta đổi sprite là sai hết,
// không có cách phát hiện sai sớm) — vi phạm đúng nguyên tắc "không đoán, không suy luận từ thứ
// không ổn định" của dự án, nên KHÔNG triển khai làm bộ lọc "thật" ở giao diện.

import { chromium } from "playwright";

const SEARCH_BASE = "https://www.facebook.com/ads/library/";
const PAGE_TIMEOUT_MS = 30000;
const SCROLL_WAIT_MS = 1800;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Nhãn "Sponsored" là 1 trong những chữ ổn định/lâu đời nhất trong toàn hệ sinh thái quảng cáo
// Meta — vẫn liệt kê nhiều biến thể ngôn ngữ để tăng độ chắc chắn, nhưng KHÔNG coi là tuyệt đối.
const SPONSORED_LABELS = ["sponsored", "được tài trợ", "patrocinado", "publicidad"];
const ACTIVE_LABELS = ["active", "hoạt động", "activo", "activa"];

function buildSearchUrl(keyword, country) {
  const params = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country,
    is_targeted_country: "false",
    media_type: "all",
    q: keyword,
    search_type: "keyword_unordered",
  });
  return `${SEARCH_BASE}?${params.toString()}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mở 1 browser Chromium dùng chung cho cả job (tránh mở/đóng browser mỗi từ khóa — chậm & dễ bị coi là bất thường). */
export async function launchLibraryBrowser() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "en-US",
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  return { browser, context, page };
}

export async function closeLibraryBrowser({ browser }) {
  if (browser) await browser.close().catch(() => {});
}

// new Date(...) của JS chỉ hiểu tên tháng tiếng Anh — chuẩn hóa thêm tiếng Việt/Tây Ban Nha
// trước khi parse, vì KHÔNG chắc chắn Meta sẽ trả trang bằng ngôn ngữ nào khi chạy không đăng
// nhập trên GitHub Actions (xem ghi chú đầu file).
const MONTH_MAP = {
  // Tiếng Việt
  "tháng 1": "jan", "tháng 2": "feb", "tháng 3": "mar", "tháng 4": "apr",
  "tháng 5": "may", "tháng 6": "jun", "tháng 7": "jul", "tháng 8": "aug",
  "tháng 9": "sep", "tháng 10": "oct", "tháng 11": "nov", "tháng 12": "dec",
  // Tây Ban Nha (MX)
  enero: "jan", febrero: "feb", marzo: "mar", abril: "apr", mayo: "may",
  junio: "jun", julio: "jul", agosto: "aug", septiembre: "sep",
  octubre: "oct", noviembre: "nov", diciembre: "dec",
};

function normalizeMonthNames(text) {
  let out = text.toLowerCase();
  for (const [needle, replacement] of Object.entries(MONTH_MAP)) {
    if (out.includes(needle)) {
      out = out.replace(needle, replacement);
      break;
    }
  }
  // Bỏ các từ nối tiếng Tây Ban Nha ("9 de may de 2026" -> "9 may 2026") — new Date() không
  // hiểu "de" và có thể hiểu sai thứ tự nếu để nguyên.
  return out.replace(/\bde\b/g, " ").replace(/\s+/g, " ").trim();
}

/** Cố gắng parse 1 chuỗi ngày ở nhiều dạng (có/không dấu ":", có/không tiền tố chữ, đa ngôn ngữ). */
function extractDate(line) {
  if (!line) return null;
  const afterColon = line.includes(":") ? line.split(":").slice(1).join(":").trim() : line;
  const candidates = [afterColon, line.replace(/^[^\d]*/, "")];
  for (const raw of candidates) {
    for (const c of [raw, normalizeMonthNames(raw)]) {
      const d = new Date(c);
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d.toISOString();
    }
  }
  return null;
}

/**
 * Parse text thô của 1 "card" quảng cáo (đã tách bằng innerText, mỗi dòng 1 phần tử) thành
 * object dữ liệu. Giữ format field gần giống raw response cũ của Graph API để fetchAds.js không
 * phải viết lại nhiều.
 */
export function parseCard(rawText, pageHandle, keyword) {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== "​");

  if (lines.length === 0) return null;

  // Anchor chính: dòng có dạng "<nhãn bất kỳ>: <10-18 chữ số>" — đây là library ID, không phụ
  // thuộc vào việc nhãn viết bằng ngôn ngữ gì.
  let idLineIdx = -1;
  let libraryId = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/:\s*(\d{10,18})\s*$/);
    if (m) {
      idLineIdx = i;
      libraryId = m[1];
      break;
    }
  }
  if (!libraryId) return null;

  const isActive = ACTIVE_LABELS.some((w) => lines[0]?.toLowerCase().startsWith(w));

  // Dòng ngày bắt đầu chạy luôn nằm NGAY SAU dòng ID trong layout hiện tại — dùng vị trí thay vì nhãn.
  const startDate = extractDate(lines[idLineIdx + 1]);

  const sponsoredIdx = lines.findIndex((l) => SPONSORED_LABELS.includes(l.toLowerCase()));
  // pageName: ưu tiên dòng ngay trước nhãn "Sponsored" (chính xác nhất). Nếu không tìm được
  // nhãn đó (layout/ngôn ngữ khác dự kiến), fallback về pageHandle lấy từ link Page trong card,
  // rồi cuối cùng về chính library ID — LUÔN phải có giá trị non-null vì cột page_name trong DB
  // là NOT NULL (bug thực tế đã xảy ra: sponsoredIdx không tìm thấy -> pageName null nhưng
  // page_id vẫn có giá trị qua pageHandle -> insert lỗi vi phạm constraint). Đánh dấu các trường
  // hợp fallback bằng _pageNameUncertain để có thể theo dõi/chẩn đoán qua raw_payload sau này.
  const rawPageName = sponsoredIdx > 0 ? lines[sponsoredIdx - 1] : null;
  const pageName = rawPageName || pageHandle || `unknown-${libraryId}`;
  const bodyLines = sponsoredIdx >= 0 ? lines.slice(sponsoredIdx + 1) : [];
  const creativeText = bodyLines.slice(0, 4).join(" | ").slice(0, 3000) || null;

  return {
    id: libraryId,
    page_id: pageHandle || rawPageName || `unknown-${libraryId}`,
    page_name: pageName,
    _pageNameUncertain: !rawPageName,
    ad_creative_bodies: creativeText ? [creativeText] : [],
    ad_creative_link_titles: [],
    ad_delivery_start_time: startDate,
    ad_delivery_stop_time: null, // trang danh sách không hiển thị ngày dừng — xem ghi chú đầu file
    ad_snapshot_url: `${SEARCH_BASE}?id=${libraryId}`,
    publisher_platforms: [],
    languages: [],
    _keyword: keyword,
    _isActiveHint: sponsoredIdx >= 0 ? isActive : undefined, // undefined nếu không xác định được badge trạng thái
  };
}

/**
 * Tìm quảng cáo theo từ khóa bằng cách scrape trang search công khai (thay searchAds cũ).
 * @param {import('playwright').Page} page - page dùng chung từ launchLibraryBrowser()
 * @param {string} keyword
 * @param {object} opts
 * @param {string} [opts.country='MX']
 * @param {number} [opts.maxScrolls=5] - số lần cuộn để load thêm (thay cho "maxPages" của API cũ)
 * @returns {Promise<Array>}
 */
export async function scrapeAds(page, keyword, { country = "MX", maxScrolls = 5 } = {}) {
  const url = buildSearchUrl(keyword, country);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
  await sleep(2000);

  // Đếm số dòng dạng "<nhãn>: <10-18 số>" trên trang để biết có load thêm được nữa không —
  // dùng cùng heuristic với parseCard() để không phụ thuộc ngôn ngữ nhãn.
  const countIdLikeLines = () =>
    page
      .evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let count = 0;
        let node;
        while ((node = walker.nextNode())) {
          if (/:\s*\d{10,18}\s*$/.test(node.textContent.trim())) count++;
        }
        return count;
      })
      .catch(() => 0);

  let previousCount = -1;
  for (let i = 0; i < maxScrolls; i++) {
    const count = await countIdLikeLines();
    if (count === previousCount) break; // không load thêm được nữa — dừng sớm, đỡ tốn thời gian
    previousCount = count;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await sleep(SCROLL_WAIT_MS);
  }

  const rawCards = await page
    .evaluate(() => {
      // Heuristic ảnh đại diện (kiểm chứng trực tiếp bằng DOM thật, không đoán): mỗi card luôn có
      // 1 ảnh avatar nhỏ (~60x60, ảnh Page) + tối đa 1 ảnh creative lớn (ví dụ 480x600) hoặc 1
      // <video> có thuộc tính poster (frame đầu video). Loại avatar bằng ngưỡng kích thước, ưu
      // tiên poster video (đại diện đúng nội dung ad hơn ảnh tĩnh), fallback về ảnh lớn nhất còn lại.
      const AVATAR_MAX_SIDE = 64;
      // Trả về cả thumbnail lẫn media_type ("video"/"image"/"none") từ CÙNG 1 heuristic đã kiểm
      // chứng thật (11/09/2026, thêm media_type) — không thêm giả định DOM mới, chỉ đọc thêm 1 giá
      // trị từ kết quả đã tính sẵn. Xem ghi chú media_type trong schema.sql về lý do KHÔNG có
      // "platform" per-ad (icon nền tảng là CSS sprite không label, đã kiểm tra trực tiếp DOM thật).
      function pickThumbnail(el) {
        const video = el.querySelector("video[poster]");
        if (video && video.poster) return { url: video.poster, mediaType: "video" };
        const imgs = Array.from(el.querySelectorAll("img"))
          .map((img) => ({ src: img.src, area: (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0), w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 }))
          .filter((i) => i.src && i.w > AVATAR_MAX_SIDE && i.h > AVATAR_MAX_SIDE);
        if (imgs.length === 0) return { url: null, mediaType: "none" };
        imgs.sort((a, b) => b.area - a.area);
        return { url: imgs[0].src, mediaType: "image" };
      }

      const spans = Array.from(document.querySelectorAll("span")).filter((el) =>
        /:\s*\d{10,18}\s*$/.test((el.textContent || "").trim())
      );
      return spans.map((span) => {
        let el = span;
        for (let i = 0; i < 8 && el.parentElement; i++) el = el.parentElement;

        let pageHandle = null;
        const link = el.querySelector("a[href]");
        if (link) {
          try {
            const u = new URL(link.href, "https://www.facebook.com");
            if (u.hostname.includes("facebook.com")) {
              pageHandle = u.pathname.replace(/\//g, "").trim() || null;
            }
          } catch (e) {
            /* bỏ qua link không hợp lệ */
          }
        }

        const { url: thumbnailUrl, mediaType } = pickThumbnail(el);
        return { text: el.innerText, pageHandle, thumbnailUrl, mediaType };
      });
    })
    .catch(() => []);

  const seen = new Set();
  const results = [];
  for (const { text, pageHandle, thumbnailUrl, mediaType } of rawCards) {
    const parsed = parseCard(text, pageHandle, keyword);
    if (!parsed || seen.has(parsed.id)) continue;
    parsed.thumbnail_url = thumbnailUrl || null;
    parsed.media_type = mediaType || "none";
    seen.add(parsed.id);
    results.push(parsed);
  }

  return results;
}
