// Danh sách từ khóa/ngành cần theo dõi tại Mexico. CHỈNH SỬA file này theo nhu cầu thực tế.
// Lưu ý: số lượng từ khóa không làm tăng chi phí Meta API (miễn phí), chỉ làm job chạy lâu hơn.
// Mỗi từ khóa nên đủ cụ thể để tránh quá nhiều kết quả không liên quan (Meta giới hạn phân trang).

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

  // --- Thương hiệu quốc tế phổ biến tại Mexico (tham khảo benchmark thị trường,
  //     ads thường thiên về branding hơn là performance) ---
  "Maybelline",
  "NYX Cosmetics",
  "Wet n Wild",

  // thêm từ khóa/thương hiệu của bạn ở đây
];

// Giới hạn số trang tối đa lấy về mỗi từ khóa / mỗi lần chạy job,
// để tránh chạy quá lâu và tránh chạm rate limit của Meta.
export const MAX_PAGES_PER_KEYWORD = 5;

// Giới hạn số ad MỚI (chưa từng thấy) được đưa qua bước parse engagement (Playwright)
// mỗi lần chạy — vì đây là bước tốn tài nguyên nhất trong toàn bộ job.
export const MAX_NEW_ADS_FOR_ENGAGEMENT_PER_RUN = 30;
