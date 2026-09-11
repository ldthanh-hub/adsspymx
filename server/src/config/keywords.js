// Danh sách từ khóa/ngành cần theo dõi tại Mexico. CHỈNH SỬA file này theo nhu cầu thực tế.
// Lưu ý: số lượng từ khóa không làm tăng chi phí Meta API (miễn phí), chỉ làm job chạy lâu hơn
// (mỗi từ khóa ~40-70 giây do phải mở trình duyệt scroll trang thật, không phải gọi API).
// Mỗi từ khóa nên đủ cụ thể để tránh quá nhiều kết quả không liên quan.
//
// Danh sách dưới đây được tổng hợp 11/09/2026 từ nghiên cứu thị trường mỹ phẩm Mexico (Statista,
// Merca20, Kokomi Skincare, Quien.com...) — ưu tiên các thương hiệu ĐỘC LẬP/DTC quy mô vừa-nhỏ vì
// đây mới là nhóm chạy ads performance trực tiếp giống Seyoul (đáng học hỏi creative nhất), cộng
// thêm nhóm thương hiệu quốc tế lớn để tham khảo benchmark. Xem thêm ghi chú cuối file khi cần bổ
// sung sau này.

export const KEYWORDS = [
  // --- Từ khóa ngành hàng Mỹ phẩm (khám phá rộng, không giới hạn 1 đối thủ cụ thể) ---
  "maquillaje",
  "cosméticos",
  "cuidado de la piel",
  "skincare",
  "belleza",

  // --- Thương hiệu Mexico / DTC quy mô vừa-nhỏ (thường chạy ads performance mạnh trên FB/IG,
  //     phù hợp nhất để học hỏi creative vì cùng quy mô ngân sách với đa số doanh nghiệp vừa và nhỏ) ---
  "Bissú",
  "Pai Pai",
  "GOC Make Up",
  "Miku Cosmetics",
  "Naked Lab",
  "Sinless Beauty",
  "Beauty Creations",
  "Xantería",
  "Ahal",
  "Be Bella",
  "CEIBA Essentials",
  "Majul",
  "Macré Cosmetics",
  "TEIA",
  "Nube Lob",
  "Zan Zusi",
  "Ere Pérez",

  // --- Thương hiệu quốc tế phổ biến tại Mexico (tham khảo benchmark thị trường,
  //     ads thường thiên về branding hơn là performance) ---
  "Maybelline",
  "NYX Cosmetics",
  "Wet n Wild",
  "L'Oréal Paris",
  "Avon",
  "M.A.C Cosmetics",

  // thêm từ khóa/thương hiệu của bạn ở đây
];

// GHI CHÚ CHO LẦN CẬP NHẬT SAU:
// - Đã CHỦ ĐỘNG bỏ qua các brand có tên chung chung dễ trùng với từ khóa khác (VD "Yuya" — trùng
//   tên riêng phổ biến, sẽ trả về nhiều kết quả không liên quan tới mỹ phẩm) — nếu muốn thêm, nên
//   ghép thêm hậu tố để thu hẹp, ví dụ "Yuya Cosméticos".
// - Nếu job bắt đầu chạy quá 25-30 phút (do danh sách dài), cân nhắc giảm MAX_PAGES_PER_KEYWORD
//   xuống 3-4 thay vì cắt bớt từ khóa, để vẫn giữ độ phủ thương hiệu.

// Giới hạn số trang tối đa lấy về mỗi từ khóa / mỗi lần chạy job,
// để tránh chạy quá lâu và tránh chạm rate limit của Meta.
export const MAX_PAGES_PER_KEYWORD = 5;

// Giới hạn số ad MỚI (chưa từng thấy) được đưa qua bước parse engagement (Playwright)
// mỗi lần chạy — vì đây là bước tốn tài nguyên nhất trong toàn bộ job.
export const MAX_NEW_ADS_FOR_ENGAGEMENT_PER_RUN = 30;
