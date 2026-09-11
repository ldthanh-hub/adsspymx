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
import { launchLibraryBrowser, closeLibraryBrowser } from "../lib/adLibraryScraper.js";
import { MARKETS } from "../config/keywords.js";
import { processKeyword } from "./scanKeyword.js";

const DELAY_BETWEEN_KEYWORDS_MS = 4000; // giãn cách giữa các từ khóa — giảm dấu hiệu truy cập dồn dập

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
