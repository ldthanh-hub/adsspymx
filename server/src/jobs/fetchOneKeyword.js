// Job "Quét 1 từ khóa theo yêu cầu" — chạy thủ công qua GitHub Actions workflow_dispatch
// (.github/workflows/fetch-oneoff.yml), KHÔNG chạy theo lịch tự động như fetchAds.js.
//
// LÝ DO TÁCH RIÊNG THÀNH JOB NÀY (thay vì thêm 1 API endpoint "POST /api/scan" trên backend):
// server/src/api/server.js CỐ TÌNH chỉ có route GET (xem ghi chú đầu file đó) — không có route
// ghi/kích hoạt hành động nào để giảm bề mặt tấn công, và backend chạy trên Render free tier vốn
// KHÔNG cài Playwright/Chromium (chỉ đọc DB, xem README mục "Kiến trúc"). Thêm 1 endpoint có thể tự
// mở trình duyệt quét theo yêu cầu của bất kỳ ai gọi API sẽ phá vỡ cả 2 nguyên tắc đó, và cần thêm
// 1 secret token mới (rủi ro rò rỉ) chỉ để "bảo vệ" endpoint đó. Dùng workflow_dispatch thủ công có
// sẵn cơ chế xác thực của GitHub (chỉ người có quyền vào repo mới bấm "Run workflow" được) — không
// cần thêm secret/endpoint mới, nhất quán với cách vận hành job hàng ngày đã có.
//
// HẠN CHẾ CẦN BIẾT: không "tức thời" như 1 ô search thật — phải vào tab Actions trên GitHub, bấm
// chạy tay, đợi khoảng 1-3 phút (tuỳ từ khóa có nhiều/ít quảng cáo), rồi quay lại web tải lại trang.
// Xem README mục "Quét 1 từ khóa theo yêu cầu" để có hướng dẫn từng bước.

import "dotenv/config";
import { pool } from "../db/pool.js";
import { launchLibraryBrowser, closeLibraryBrowser } from "../lib/adLibraryScraper.js";
import { processKeyword } from "./scanKeyword.js";
import { guessCategory } from "../lib/guessCategory.js";

const VALID_COUNTRIES = ["MX", "US"];
const VALID_CATEGORIES = ["Mỹ phẩm & Làm đẹp", "Thời trang", "Đồ gia dụng"];

async function main() {
  const keyword = (process.env.SCAN_KEYWORD || "").trim();
  const countryCode = (process.env.SCAN_COUNTRY || "").trim().toUpperCase();
  const categoryRaw = (process.env.SCAN_CATEGORY || "").trim();
  // Nếu người chạy workflow để trống ô "category" (hoặc gõ giá trị không hợp lệ), TỰ ĐOÁN thay vì
  // bắt buộc phải tự chọn tay — xem lib/guessCategory.js. Vẫn có thể đoán ra null (không chắc), khi
  // đó ad được lưu với category = NULL, không sao — chỉ ảnh hưởng hiển thị/lọc, không mất dữ liệu.
  const category = VALID_CATEGORIES.includes(categoryRaw) ? categoryRaw : guessCategory(keyword);

  if (!keyword) {
    throw new Error('Thiếu từ khóa (SCAN_KEYWORD trống) — điền vào ô "keyword" khi bấm Run workflow.');
  }
  if (keyword.length > 200) {
    throw new Error("Từ khóa quá dài (>200 ký tự) — kiểm tra lại có dán nhầm nội dung khác không.");
  }
  if (!VALID_COUNTRIES.includes(countryCode)) {
    throw new Error(`Thị trường không hợp lệ: "${countryCode}" — chỉ nhận MX hoặc US.`);
  }

  const item = { keyword, type: "custom", category };

  const client = await pool.connect();
  const { browser, page } = await launchLibraryBrowser();

  try {
    console.log(
      `[fetchOneKeyword] Quét theo yêu cầu: "${keyword}" [${countryCode}]${category ? ` — ${category}` : " — chưa chọn ngành hàng"}`
    );
    const result = await processKeyword(client, page, item, countryCode);
    if (result.error) {
      // processKeyword đã tự ghi lỗi vào fetch_runs — vẫn throw tiếp ở đây để job GitHub Actions
      // hiện rõ ràng "Failed" thay vì "Success" giả, giúp người yêu cầu quét biết ngay là có lỗi.
      throw new Error(result.error);
    }
    console.log(
      `[fetchOneKeyword] Xong: tìm thấy ${result.adsFound} quảng cáo, ${result.adsNew} quảng cáo mới. Quay lại web và tải lại trang để xem kết quả.`
    );
  } finally {
    await closeLibraryBrowser({ browser });
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[fetchOneKeyword] Lỗi:", err.message);
  process.exitCode = 1;
});
