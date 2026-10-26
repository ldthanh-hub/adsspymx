// THU HẸP PHẠM VI (26/10/2026 — theo yêu cầu của Đăng):
//   - Thị trường: CHỈ còn Mexico (MX) và Mỹ (US). Đã gỡ KR/TH/MY khỏi MARKETS.
//   - Ngành hàng: CHỈ còn "Mỹ phẩm & Làm đẹp" (bao gồm cả từ khóa chăm sóc da như
//     "cuidado de la piel", "skincare", "sérum facial", "vitamin c serum"...).
//     Đã gỡ toàn bộ mục category "Thời trang" khỏi MX và US.
//   - GHI CHÚ PHẠM VI HIỂN THỊ (26/10/2026 — lần 2): gỡ khỏi config chỉ ngừng quét mới, dữ liệu cũ
//     vẫn còn trong DB. Để giao diện CHỈ liệt kê MX/US + Mỹ phẩm & Làm đẹp (không còn KR/TH/MY,
//     Thời trang, SHEIN/Rothy's/Temu... trong dropdown Ngành hàng/Thương hiệu), backend + frontend
//     đã được sửa để mặc định scope MX,US + category "Mỹ phẩm & Làm đẹp" và ẩn các Page có
//     category lẫn Thời trang (VD SHEIN Mexico có cả 2 category). Muốn xóa hẳn dữ liệu cũ khỏi
//     DB thì phải chạy DELETE riêng — chưa làm trong lần sửa này.
//   - Theo tiền lệ gỡ "Đồ gia dụng" (16/09/2026): gỡ khỏi danh sách chỉ NGỪNG QUÉT MỚI,
//     KHÔNG xóa dữ liệu ad cũ trong DB — ad KR/TH/MY và Thời trang đã quét trước đó vẫn
//     còn trong DB và vẫn xem được qua tìm kiếm/thương hiệu, chỉ không còn trong dropdown
//     Thị trường/Ngành hàng và không được quét lại nữa. Muốn xóa hẳn dữ liệu cũ phải chạy
//     DELETE riêng trên DB, không làm bằng sửa code này.
// Danh sách từ khóa/ngành/thương hiệu cần theo dõi, CHIA THEO TỪNG THỊ TRƯỜNG (quốc gia).
// CHỈNH SỬA file này theo nhu cầu thực tế — mỗi item có 3 field:
//   - keyword: từ khóa/tên thương hiệu dùng để search trên Meta Ad Library
//   - type: "industry" (từ khóa ngành hàng chung, khám phá rộng) hoặc "brand" (tên 1 thương hiệu cụ thể)
//   - category: nhóm ngành hàng lớn — dùng để lọc/thống kê ở giao diện (KHÔNG đoán bằng cách so chuỗi
//     tên như bản cũ — gắn cứng ngay tại đây để chắc chắn đúng, kể cả khi thêm ngành mới sau này)
//
// LƯU Ý QUAN TRỌNG VỀ CHI PHÍ THỜI GIAN (đọc trước khi thêm hàng loạt từ khóa):
// Không tốn thêm TIỀN (scrape trang công khai, không qua API trả phí; GitHub Actions của repo Public
// không giới hạn phút chạy) — nhưng MỖI từ khóa/thương hiệu × MỖI quốc gia là 1 lượt mở trình duyệt
// thật + cuộn trang, tốn ~40-70 giây. Danh sách càng dài, job chạy càng lâu (xem tổng số item ở cuối
// file), và tần suất request tới Facebook trong 1 lần chạy càng nhiều → rủi ro bị chú ý (xem cảnh báo
// pháp lý ở đầu adLibraryScraper.js) tăng theo dù vẫn ở mức thấp. Cân nhắc kỹ trước khi thêm ồ ạt.
//
// NGUỒN THAM KHẢO khi tổng hợp danh sách thương hiệu (11/09/2026 — Mexico mỹ phẩm: Statista, Merca20,
// Kokomi Skincare, Quien.com; US mỹ phẩm/thời trang: ringly.io (danh sách DTC theo ngành); MX thời
// trang: abito.com.mx — ưu tiên brand ĐỘC LẬP/DTC quy mô vừa-nhỏ (đáng học hỏi creative nhất vì cùng
// tầm ngân sách), có thêm 1 nhóm nhỏ brand lớn quốc tế để benchmark. KHÔNG bịa tên thương hiệu — toàn
// bộ tên dưới đây đều tra cứu được thật từ nguồn nêu trên.
//
// MỞ RỘNG LẦN 2 (11/09/2026): thêm cụm tìm kiếm ngách cụ thể hơn cho mỗi ngành (VD "sérum facial"/
// "vitamin c serum" thay vì chỉ dùng từ rộng như "cuidado de la piel"/"skincare") vì mỗi cụm tìm kiếm
// khác nhau thường kéo về MỘT TẬP quảng cáo/nhà quảng cáo khác nhau trên Meta Ad Library (không phải
// tập con của nhau); thêm "Seyoul" để tự theo dõi quảng cáo của chính mình.
//
// MỞ RỘNG LẦN 3 (16/09/2026 — theo yêu cầu người dùng):
// (1) BỎ HẲN ngành "Đồ gia dụng" khỏi toàn bộ danh sách (MX, US) và không thêm cho thị trường mới —
//     KHÔNG xóa dữ liệu ad đã quét trước đó khỏi database (vẫn còn nguyên, chỉ không quét thêm nữa);
//     đồng thời đã gỡ "Đồ gia dụng" khỏi danh sách category hợp lệ ở server/src/jobs/fetchOneKeyword.js,
//     web/pages/index.js (SCAN_CATEGORIES) và cả 2 bản guessCategory (server + web).
// (2) Thêm 3 thị trường mới: Hàn Quốc (KR), Thái Lan (TH), Malaysia (MY) — chỉ 2 ngành Mỹ phẩm & Làm
//     đẹp + Thời trang (đồng bộ với việc bỏ Đồ gia dụng). Nguồn thương hiệu: tatlerasia.com (thời
//     trang Thái Lan/Malaysia + mỹ phẩm Thái Lan), buro247.my (mỹ phẩm Malaysia), growyourclothingbrand.com
//     (thời trang Malaysia), russh.com (thời trang Hàn Quốc, ưu tiên brand DTC độc lập). Từ khóa NGÀNH
//     HÀNG (industry) dùng ĐÚNG NGÔN NGỮ BẢN ĐỊA (Hàn/Thái/Mã Lai) — vì quảng cáo thật ở các thị trường
//     này chủ yếu viết bằng ngôn ngữ đó, dùng từ khóa tiếng Anh sẽ bỏ sót phần lớn quảng cáo. Các từ
//     khóa ngành hàng (skincare/cosmetics/makeup/women's fashion/men's clothing dịch sang từng ngôn
//     ngữ) là kiến thức ngôn ngữ phổ thông, không tra cứu qua nguồn báo chí như tên thương hiệu.

export const MARKETS = {
  MX: {
    label: "Mexico",
    metaCountryCode: "MX",
    items: [
      // --- Mỹ phẩm & Làm đẹp — ngành hàng (khám phá rộng) ---
      { keyword: "maquillaje", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "cosméticos", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "cuidado de la piel", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "skincare", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "belleza", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      // Thêm 11/09/2026 (mở rộng độ phủ tìm kiếm) — các cụm tìm kiếm ngách cụ thể hơn, thường kéo
      // về TẬP QUẢNG CÁO KHÁC với 5 từ khóa rộng ở trên (nhà quảng cáo hay nhắm đúng nhu cầu cụ thể
      // hơn là chỉ "cuidado de la piel" chung chung).
      { keyword: "rutina de skincare", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "sérum facial", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "protector solar", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "maquillaje natural", type: "industry", category: "Mỹ phẩm & Làm đẹp" },

      // --- Mỹ phẩm & Làm đẹp — thương hiệu của Seyoul (theo dõi quảng cáo của chính mình + phát
      // hiện sớm nếu có bên khác sao chép/nhái nội dung) ---
      { keyword: "Seyoul", type: "brand", category: "Mỹ phẩm & Làm đẹp" },

      // --- Mỹ phẩm & Làm đẹp — thương hiệu Mexico / DTC quy mô vừa-nhỏ ---
      { keyword: "Bissú", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Pai Pai", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "GOC Make Up", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Miku Cosmetics", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Naked Lab", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Sinless Beauty", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Beauty Creations", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Xantería", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Ahal", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Be Bella", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "CEIBA Essentials", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Majul", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Macré Cosmetics", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "TEIA", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Nube Lob", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Zan Zusi", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Ere Pérez", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      // Thêm 11/09/2026 — nguồn: kokomiskincare.com (tổng hợp "Marcas de Skincare Mexicanas Independientes")
      { keyword: "Luum Skincare", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Nae Skincare", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Amapola Biocosmetics", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Xinca cosmética", type: "brand", category: "Mỹ phẩm & Làm đẹp" }, // thêm "cosmética" tránh trùng nghĩa gốc "xinca" (tên 1 dân tộc bản địa Trung Mỹ)

      // --- Mỹ phẩm & Làm đẹp — thương hiệu quốc tế phổ biến tại Mexico (benchmark) ---
      { keyword: "Maybelline", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "NYX Cosmetics", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Wet n Wild", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "L'Oréal Paris", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Avon", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "M.A.C Cosmetics", type: "brand", category: "Mỹ phẩm & Làm đẹp" },

      // --- Đối thủ từ file creative SEYOUL (26/10/2026 — Đăng gửi 2 file Excel, cột "Brand competitor") ---
      // Nguồn: SEYOUL_PDRN_Creative_MX_US_2026-10-19.xlsx (sheet "Creative doi thu", 11 dòng)
      // và Seyoul_TCollagen_Creative_MX_US_2026-10-20.xlsx (sheet "Creative doi thu", 10 dòng).
      // Đây là dữ liệu creative TikTok tham khảo, thị trường trong file phần lớn "Chưa xác minh",
      // chỉ vài dòng ghi rõ MX/US — nên thêm cả 10 brand vào CẢ MX và US để cron Meta Ad Library
      // tự xác minh lại xem brand đó có chạy ad ở thị trường nào. 10 brand này trước đó CHƯA có
      // trong config MX/US. Không thêm "Olive Young" (đó là nhà bán lẻ, không phải brand mỹ phẩm)
      // và không thêm dòng "SKIN1004 và nhiều brand" (không xác định được brand cụ thể).
      // "VT" giữ nguyên đúng tên trong file (nhiều khả năng là VT Cosmetics, nhưng file chỉ ghi "VT").
      { keyword: "Medicube", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Rejuran", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Anua", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "VT", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "EQQUALBERRY", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "SKIN1004", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Dr. Althea", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Eucerin", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Round Lab", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Beauty of Joseon", type: "brand", category: "Mỹ phẩm & Làm đẹp" },

      // thêm từ khóa/thương hiệu của bạn ở đây (nhớ khai báo đủ type + category)
    ],
  },

  US: {
    label: "United States",
    metaCountryCode: "US",
    items: [
      // --- Mỹ phẩm & Làm đẹp — ngành hàng ---
      { keyword: "skincare", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "makeup", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "beauty products", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "cosmetics", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      // Thêm 11/09/2026 — cụm tìm kiếm ngách, kéo về tập quảng cáo khác với 4 từ rộng ở trên
      { keyword: "vitamin c serum", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "retinol cream", type: "industry", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "natural makeup", type: "industry", category: "Mỹ phẩm & Làm đẹp" },

      // --- Mỹ phẩm & Làm đẹp — thương hiệu DTC độc lập (nguồn: ringly.io) ---
      { keyword: "Kosas", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "ILIA Beauty", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Tower 28 Beauty", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Youth to the People", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Merit Beauty", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Dossier Perfumes", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Phlur", type: "brand", category: "Mỹ phẩm & Làm đẹp" }, // thêm 11/09/2026, nguồn: ringly.io
      { keyword: "Beautycounter", type: "brand", category: "Mỹ phẩm & Làm đẹp" }, // thêm 11/09/2026, nguồn: ringly.io
      { keyword: "Danessa Myricks Beauty", type: "brand", category: "Mỹ phẩm & Làm đẹp" }, // thêm 11/09/2026, nguồn: ringly.io

      // --- Mỹ phẩm & Làm đẹp — thương hiệu lớn/benchmark (nguồn: ringly.io) ---
      { keyword: "Glossier", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Rhode Skin", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Fenty Beauty", type: "brand", category: "Mỹ phẩm & Làm đẹp" },

      // --- Đối thủ từ file creative SEYOUL (26/10/2026 — Đăng gửi 2 file Excel, cột "Brand competitor") ---
      // Nguồn: SEYOUL_PDRN_Creative_MX_US_2026-10-19.xlsx (sheet "Creative doi thu", 11 dòng)
      // và Seyoul_TCollagen_Creative_MX_US_2026-10-20.xlsx (sheet "Creative doi thu", 10 dòng).
      // Đây là dữ liệu creative TikTok tham khảo, thị trường trong file phần lớn "Chưa xác minh",
      // chỉ vài dòng ghi rõ MX/US — nên thêm cả 10 brand vào CẢ MX và US để cron Meta Ad Library
      // tự xác minh lại xem brand đó có chạy ad ở thị trường nào. 10 brand này trước đó CHƯA có
      // trong config MX/US. Không thêm "Olive Young" (đó là nhà bán lẻ, không phải brand mỹ phẩm)
      // và không thêm dòng "SKIN1004 và nhiều brand" (không xác định được brand cụ thể).
      // "VT" giữ nguyên đúng tên trong file (nhiều khả năng là VT Cosmetics, nhưng file chỉ ghi "VT").
      { keyword: "Medicube", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Rejuran", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Anua", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "VT", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "EQQUALBERRY", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "SKIN1004", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Dr. Althea", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Eucerin", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Round Lab", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Beauty of Joseon", type: "brand", category: "Mỹ phẩm & Làm đẹp" },

      // thêm từ khóa/thương hiệu của bạn ở đây (nhớ khai báo đủ type + category)
    ],
  },

};

// GHI CHÚ CHO LẦN CẬP NHẬT SAU:
// - Đã CHỦ ĐỘNG bỏ qua các brand có tên chung chung dễ trùng với từ khóa khác (VD "Yuya" — trùng
//   tên riêng phổ biến) — nếu muốn thêm, nên ghép thêm hậu tố để thu hẹp (xem ví dụ "Caruso Yucatán",
//   "Our Place cookware", "Pestle & Mortar Clothing" ở trên).
// - Nếu job bắt đầu chạy quá lâu (xem thời gian chạy thực tế trong tab Actions trên GitHub), cân
//   nhắc giảm MAX_PAGES_PER_KEYWORD xuống 3-4 thay vì cắt bớt từ khóa, để vẫn giữ độ phủ thương hiệu.
// - Muốn thêm quốc gia mới: thêm 1 key mới vào MARKETS (VD "CO": { label, metaCountryCode, items }),
//   không cần sửa gì khác trong code — fetchAds.js, server.js, giao diện đều tự đọc theo MARKETS. Ưu
//   tiên viết từ khóa NGÀNH HÀNG bằng ngôn ngữ bản địa của thị trường đó (xem KR/TH/MY ở trên) — quảng
//   cáo thật viết bằng ngôn ngữ gì thì từ khóa tìm kiếm nên dùng đúng ngôn ngữ đó mới bắt được nhiều.
// - "Đồ gia dụng" đã bị GỠ HẲN khỏi danh sách (16/09/2026) — nếu sau này muốn thêm lại, nhớ cập nhật
//   ĐỒNG BỘ cả 4 chỗ khác: server/src/jobs/fetchOneKeyword.js (VALID_CATEGORIES), web/pages/index.js
//   (SCAN_CATEGORIES), server/src/lib/guessCategory.js và web/lib/ui.js (guessCategory).

// Giới hạn số lần cuộn trang tối đa lấy về mỗi từ khóa/thương hiệu/quốc gia mỗi lần chạy job,
// để tránh chạy quá lâu và tránh chạm rate limit của Meta.
export const MAX_PAGES_PER_KEYWORD = 5;

// Giới hạn số ad MỚI (chưa từng thấy) được đưa qua bước parse engagement (Playwright)
// mỗi lần chạy — vì đây là bước tốn tài nguyên nhất trong toàn bộ job.
export const MAX_NEW_ADS_FOR_ENGAGEMENT_PER_RUN = 30;
