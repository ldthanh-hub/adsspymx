// Danh sách brand theo dõi tín hiệu NGOÀI Meta (Google Trends, Mercado Libre, TikTok).
// Mỗi brand có 3 từ khóa RIÊNG vì mỗi nguồn "hiểu" tên brand khác nhau — KHÔNG dùng chung 1
// chuỗi cho cả 3 nguồn, vì sẽ lấy sai số:
//   - tiktokHashtag: tên hashtag TikTok, KHÔNG có dấu # và KHÔNG có khoảng trắng. Kiểm chứng
//     thật bằng TikWM challenge/info ngày 26/10/2026 (xem ghi chú từng brand bên dưới).
//   - mercadoQuery: cụm tìm trên Mercado Libre Mexico (listado.mercadolibre.com.mx).
//   - trendsKeyword: từ khóa Google Trends, vùng MX (Mexico), khung "today 3-m" (90 ngày).
//
// Kết quả kiểm chứng TikTok ngày 26/10/2026 (TikWM challenge/info, lượt xem hashtag tích lũy):
//   Medicube 21,4 tỷ / 2,0 triệu creator; SKIN1004 20,3 tỷ / 2,0 triệu; Eucerin 9,0 tỷ / 331 nghìn;
//   Anua 7,3 tỷ / 509 nghìn; Beauty of Joseon 4,2 tỷ / 369 nghìn; Dr. Althea 3,4 tỷ / 167 nghìn;
//   EQQUALBERRY 1,5 tỷ / 62 nghìn; Rejuran 1,3 tỷ / 155 nghìn; Seyoul 336 triệu / 67 nghìn.
//   2 trường hợp ĐẶC BIỆT, đã chọn hashtag cụ thể thay vì tên brand thô:
//   - VT: hashtag "vt" quá chung (6,1 tỷ view, lẫn nội dung không liên quan tới mỹ phẩm) nên
//     dùng "vtcosmetics" (2,5 tỷ view, 143 nghìn creator) — vẫn là hashtag cộng đồng, không phải
//     số chính thức của công ty, đọc kèm ghi chú này khi phân tích.
//   - Round Lab: hashtag "roundlab" trả về rỗng trên TikWM, nên dùng "roundlabskincare"
//     (4,2 triệu view, 1.445 creator) — nhỏ hơn hẳn các brand khác, phản ánh đúng độ phủ
//     TikTok thấp hơn, không phải lỗi quét.
export const SIGNAL_BRANDS = [
  { name: "Medicube", tiktokHashtag: "medicube", mercadoQuery: "medicube", trendsKeyword: "Medicube" },
  { name: "Rejuran", tiktokHashtag: "rejuran", mercadoQuery: "rejuran", trendsKeyword: "Rejuran" },
  { name: "Anua", tiktokHashtag: "anua", mercadoQuery: "anua", trendsKeyword: "Anua" },
  { name: "VT", tiktokHashtag: "vtcosmetics", mercadoQuery: "VT Cosmetics", trendsKeyword: "VT Cosmetics" },
  { name: "EQQUALBERRY", tiktokHashtag: "eqqualberry", mercadoQuery: "eqqualberry", trendsKeyword: "EQQUALBERRY" },
  { name: "SKIN1004", tiktokHashtag: "skin1004", mercadoQuery: "SKIN1004", trendsKeyword: "SKIN1004" },
  { name: "Dr. Althea", tiktokHashtag: "dralthea", mercadoQuery: "Dr Althea", trendsKeyword: "Dr. Althea" },
  { name: "Eucerin", tiktokHashtag: "eucerin", mercadoQuery: "eucerin", trendsKeyword: "Eucerin" },
  { name: "Round Lab", tiktokHashtag: "roundlabskincare", mercadoQuery: "Round Lab", trendsKeyword: "Round Lab" },
  { name: "Beauty of Joseon", tiktokHashtag: "beautyofjoseon", mercadoQuery: "Beauty of Joseon", trendsKeyword: "Beauty of Joseon" },
  { name: "Seyoul", tiktokHashtag: "seyoul", mercadoQuery: "seyoul", trendsKeyword: "Seyoul" },
];

// Độ trễ giữa các brand trong cùng 1 nguồn (giây) — tránh bị Google/Mercado/TikWM đánh dấu
// là quét ồ ạt. TikTok và Mercado chịu được nhanh hơn, Google Trends nhạy nhất nên job dùng
// chung 5 giây cho mọi nguồn để an toàn.
export const SIGNAL_DELAY_SECONDS = 5;
