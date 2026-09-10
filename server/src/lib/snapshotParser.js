// Best-effort: thử lấy like/comment/share/view công khai từ trang snapshot chính thức
// của Meta Ad Library (ad_snapshot_url) — đây LÀ trang public do Meta host, không cần đăng nhập.
//
// CẢNH BÁO QUAN TRỌNG (đọc kỹ trước khi coi đây là "nguồn dữ liệu đáng tin cậy"):
// 1. Trang snapshot render bằng JavaScript phía client, nên cần headless browser (Playwright)
//    để lấy được nội dung — fetch HTML thô sẽ không thấy các số này.
// 2. KHÔNG PHẢI mọi quảng cáo đều có engagement hiển thị — chỉ ad gắn với 1 bài post công khai
//    (kiểu "boosted post") mới có like/comment/share. Ad dạng "Dynamic Creative" thuần quảng cáo
//    thường KHÔNG có các số này. Trả về null là bình thường, không phải lỗi.
// 3. Meta có thể đổi giao diện/markup bất kỳ lúc nào làm parser này ngừng hoạt động — đó là lý do
//    có cột engagement_parse_ok trong DB để theo dõi tỷ lệ parse thành công theo thời gian,
//    thay vì tin tưởng mù quáng vào số liệu.
// 4. Vì tốn tài nguyên (mở trình duyệt thật), CHỈ chạy bước này cho ad MỚI phát hiện
//    (xem MAX_NEW_ADS_FOR_ENGAGEMENT_PER_RUN trong config/keywords.js), không chạy lại mỗi ngày
//    cho toàn bộ ad đã có.

import { chromium } from "playwright";

const PAGE_TIMEOUT_MS = 20000;

function parseCount(text) {
  // Meta hiển thị dạng "1.2K", "3,4 mil", "12" v.v. — chuẩn hóa best-effort, không tuyệt đối chính xác.
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").trim();
  const match = cleaned.match(/([\d.]+)\s*(K|mil|M)?/i);
  if (!match) return null;
  let num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const unit = (match[2] || "").toLowerCase();
  if (unit === "k" || unit === "mil") num *= 1000;
  if (unit === "m") num *= 1000000;
  return Math.round(num);
}

/**
 * @param {string} snapshotUrl
 * @returns {Promise<{likes: number|null, comments: number|null, shares: number|null, views: number|null, ok: boolean}>}
 */
export async function parseEngagement(snapshotUrl) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    await page.goto(snapshotUrl, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT_MS });

    // Selector cụ thể của Meta Ad Library có thể thay đổi — đây là best-effort dựa trên
    // cấu trúc aria-label phổ biến của Facebook cho các nút like/comment/share.
    const bodyText = await page.textContent("body").catch(() => "");

    const likesMatch = bodyText.match(/([\d.,]+\s*(?:K|mil|M)?)\s*(?:Me gusta|Likes|reacciones)/i);
    const commentsMatch = bodyText.match(/([\d.,]+\s*(?:K|mil|M)?)\s*comentarios?/i);
    const sharesMatch = bodyText.match(/([\d.,]+\s*(?:K|mil|M)?)\s*(?:veces compartido|shares?)/i);
    const viewsMatch = bodyText.match(/([\d.,]+\s*(?:K|mil|M)?)\s*(?:reproducciones|views?)/i);

    const result = {
      likes: parseCount(likesMatch?.[1]),
      comments: parseCount(commentsMatch?.[1]),
      shares: parseCount(sharesMatch?.[1]),
      views: parseCount(viewsMatch?.[1]),
    };

    const ok = Object.values(result).some((v) => v !== null);
    return { ...result, ok };
  } catch (err) {
    console.warn(`[snapshotParser] Không parse được ${snapshotUrl}: ${err.message}`);
    return { likes: null, comments: null, shares: null, views: null, ok: false };
  } finally {
    if (browser) await browser.close();
  }
}
