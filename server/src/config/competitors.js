// Danh sách đối thủ cho 3 nguồn mới (26/10/2026) — website chính, YouTube, Facebook, Instagram.
// Quy tắc ghi URL/handle ở đây, áp dụng cho cả 3 job, để khỏi đoán lung tung ở nhiều chỗ:
//   - websiteUrl: trang chính thức, kiểm chứng thật bằng curl ngày 26/10/2026 (trừ 2 trường
//     hợp ghi chú bên dưới). Trang nào chặn bot (Medicube 403) thì job chuyển sang Playwright,
//     không phải URL sai. Trang nào curl lỗi mạng (Dr. Althea) thì job ghi status, không bịa.
//   - youtubeHandle / instagramHandle: CHỈ ghi khi đã xác minh được từ nguồn đáng tin.
//     Tìm kiếm ngày 26/10/2026 không xác minh chắc chắn handle YouTube/Instagram chính thức
//     của hầu hết brand (kết quả toàn video của creator, không phải kênh chính thức), nên
//     job YouTube KHÔNG dùng handle ghi sẵn mà tìm kênh bằng YouTube Search (API nếu có key,
//     không thì Playwright mở trang kết quả tìm kiếm) — tránh lấy nhầm kênh của creator.
//     Instagram: job chỉ chạy khi handle đã cấu hình, hiện tại để trống tất cả — panel sẽ
//     ghi rõ "chưa cấu hình handle", anh gửi handle IG chính thức là thêm vào đây là chạy
//     được ngay, không cần sửa code job.
//   - facebookPage: KHÔNG ghi sẵn ở đây — job lấy Page có nhiều ad nhất của brand từ chính
//     bảng ads (đã xác minh qua Meta Ad Library), tránh đoán slug Facebook sai.
export const COMPETITOR_BRANDS = [
  // websiteUrl kiểm chứng: 200 OK, trừ Medicube (403 Cloudflare, dùng medicube.us 200 làm dự phòng trong job) và Dr. Althea / Rejuran (xem ghi chú).
  { name: "Medicube", websiteUrl: "https://www.medicube.com", websiteFallbackUrl: "https://medicube.us" },
  { name: "Rejuran", websiteUrl: "https://rejuran.co.kr", websiteFallbackUrl: null },
  { name: "Anua", websiteUrl: "https://www.anua.com", websiteFallbackUrl: null },
  { name: "VT", websiteUrl: "https://www.vtcosmetics.com", websiteFallbackUrl: "https://vtcosmetics.com" },
  { name: "EQQUALBERRY", websiteUrl: "https://eqqualberry.com", websiteFallbackUrl: null },
  { name: "SKIN1004", websiteUrl: "https://www.skin1004.com", websiteFallbackUrl: null },
  { name: "Dr. Althea", websiteUrl: "https://dralthea.com", websiteFallbackUrl: null },
  { name: "Eucerin", websiteUrl: "https://www.eucerin.com.mx", websiteFallbackUrl: null },
  { name: "Round Lab", websiteUrl: "https://roundlab.com", websiteFallbackUrl: null },
  { name: "Beauty of Joseon", websiteUrl: "https://beautyofjoseon.com", websiteFallbackUrl: null },
  // Seyoul: websiteUrl = null LÀ CỐ Ý (sửa 26/10/2026). seyoul.com KHÔNG phải website của
  // Seyoul — mở ra là trang rao bán domain của GoDaddy ("You don't have permission to access
  // forsale.godaddy.com/forsale/seyoul.com"), job cũ đã lấy nhầm và hiện lỗi đó trong panel.
  // Ứng viên tìm thấy qua tìm kiếm là seyoulstore.com (giá USD $16.99/$58.99, có phần tiếng Tây
  // Ban Nha) nhưng chưa xác minh được đó có phải landing page Mexico của Đăng hay chỉ là store
  // quốc tế — KHÔNG tự gán, chờ Đăng xác nhận URL landing page MX rồi mới điền vào đây.
  // Khi websiteUrl = null, job ghi status 'not_configured' và panel hiện "Chưa cấu hình website".
  { name: "Seyoul", websiteUrl: null, websiteFallbackUrl: null },
];

// Từ điển phân loại creative (rule-based, chạy trên creative_text đã có trong DB, không cần
// gọi AI cho mọi ad). Mỗi ad có thể thuộc NHIỀU góc bán cùng lúc (VD vừa melasma vừa vitamin C),
// nên tổng số ad theo góc sẽ lớn hơn tổng ad thật — panel ghi chú rõ điều này.
// Từ khóa gồm cả tiếng Tây Ban Nha (quảng cáo MX), tiếng Anh (quảng cáo US) và tên hoạt chất.
export const CREATIVE_ANGLES = [
  { key: "melasma", label: "Melasma / đốm nâu", keywords: ["manchas", "melasma", "hiperpigment", "dark spot", "dark spots", "manchas oscuras", "pigmentación"] },
  { key: "hidratacion", label: "Dưỡng ẩm", keywords: ["hidrat", "humectante", "moisture", "hydrating", "hidratante", "humedad"] },
  { key: "vitamina_c", label: "Vitamin C / làm sáng", keywords: ["vitamina c", "vitamin c", "brightening", "iluminador", "glow", "luminosidad", "radiance"] },
  { key: "retinol", label: "Retinol / chống lão hóa", keywords: ["retinol", "anti-edad", "anti-aging", "arrugas", "wrinkle", "firmeza", "lifting", "elasticidad"] },
  { key: "niacinamide", label: "Niacinamide", keywords: ["niacinamida", "niacinamide"] },
  { key: "pdrn_collagen", label: "PDRN / Collagen / Peptide", keywords: ["pdrn", "colágeno", "collagen", "péptido", "peptide", "polinucleótido"] },
  { key: "protector_solar", label: "Chống nắng", keywords: ["protector solar", "sunscreen", "spf", "protección solar", "sun stick", "sun cream"] },
  { key: "acne_poros", label: "Mụn / lỗ chân lông", keywords: ["acné", "acne", "poros", "pores", "blackhead", "puntos negros", "granos"] },
  { key: "sensible", label: "Da nhạy cảm / làm dịu", keywords: ["sensible", "sensitive", "calmante", "soothing", "centella", "cica", "irritada"] },
  { key: "exfoliacion", label: "Tẩy tế bào chết / peel", keywords: ["exfoli", "peel", "aha", "bha", "pha", "ácido"] },
];

export const CREATIVE_OFFERS = [
  { key: "descuento_pct", label: "Giảm %", pattern: /\d+\s*%/ },
  { key: "dos_por_uno", label: "2x1 / Mua 1 tặng 1", keywords: ["2x1", "2 por 1", "buy 1 get", "compra 1", "lleva 2", "buy one get"] },
  { key: "envio_gratis", label: "Miễn phí vận chuyển", keywords: ["envío gratis", "free shipping", "envio gratis", "shipping free"] },
  // "gratis" đứng một mình KHÔNG tính là tặng kèm (vì "envío gratis" là miễn phí vận chuyển,
  // đã có offer riêng) — chỉ tính tặng kèm khi có từ regalo/gift/obsequio rõ ràng.
  { key: "regalo", label: "Tặng kèm", keywords: ["regalo", "free gift", "obsequio", "gift with"] },
  { key: "kit_bundle", label: "Bộ / Kit / Bundle", keywords: ["kit", "bundle", "pack", "set de", "rutina completa"] },
  { key: "codigo", label: "Mã giảm giá", keywords: ["código", "code", "cupón", "coupon", "promo code"] },
];
