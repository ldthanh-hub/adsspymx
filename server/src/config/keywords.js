// Danh sách từ khóa/ngành cần theo dõi tại Mexico. CHỈNH SỬA file này theo nhu cầu thực tế.
// Lưu ý: số lượng từ khóa không làm tăng chi phí Meta API (miễn phí), chỉ làm job chạy lâu hơn.
// Mỗi từ khóa nên đủ cụ thể để tránh quá nhiều kết quả không liên quan (Meta giới hạn phân trang).

export const KEYWORDS = [
  "suplementos",
  "cuidado de la piel",
  "ropa mujer",
  // thêm từ khóa của bạn ở đây
];

// Giới hạn số trang tối đa lấy về mỗi từ khóa / mỗi lần chạy job,
// để tránh chạy quá lâu và tránh chạm rate limit của Meta.
export const MAX_PAGES_PER_KEYWORD = 5;

// Giới hạn số ad MỚI (chưa từng thấy) được đưa qua bước parse engagement (Playwright)
// mỗi lần chạy — vì đây là bước tốn tài nguyên nhất trong toàn bộ job.
export const MAX_NEW_ADS_FOR_ENGAGEMENT_PER_RUN = 30;
