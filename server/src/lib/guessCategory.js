// Đoán NGÀNH HÀNG cho 1 từ khóa quét theo yêu cầu (fetchOneKeyword.js) khi người dùng để trống ô
// "category" lúc bấm Run workflow trên GitHub Actions — thay vì bắt buộc tự chọn tay.
//
// CÁCH HOẠT ĐỘNG: so khớp CHUỖI CON (không phân biệt hoa/thường, không dấu) giữa từ khóa nhập vào và
// 1 danh sách từ gợi ý cho ngành Mỹ phẩm & Làm đẹp (Tây Ban Nha/Anh cho MX/US — thu hẹp 26/10/2026,
// đã gỡ rule "Thời trang" và các từ tiếng Hàn/Thái/Malay của KR/TH/MY). CHỈ LÀ HEURISTIC
// BEST-EFFORT — không chính xác 100%, đặc biệt với tên thương hiệu
// không chứa từ mô tả ngành hàng (VD "Kosas" sẽ không đoán ra được, phải để trống/tự chọn). Ưu tiên
// đoán còn hơn không có gì, nhưng KHÔNG dùng field này cho logic quan trọng — chỉ để phân loại/hiển
// thị (giống hệt cách category đã được dùng ở nơi khác trong dự án, xem schema.sql).
//
// ĐỒNG BỘ: có 1 bản heuristic tương tự ở web/lib/ui.js (guessCategory) để gợi ý ngay trong giao diện
// TRƯỚC KHI người dùng qua GitHub chạy job — sửa danh sách từ khóa ở đây thì nhớ sửa cả bên đó, và
// ngược lại, để 2 nơi đoán ra cùng 1 kết quả (tránh giao diện gợi ý 1 đằng, job chạy ra 1 nẻo).

const RULES = [
  {
    category: "Mỹ phẩm & Làm đẹp",
    terms: [
      "skincare", "skin care", "makeup", "make up", "maquillaje", "cosmetic", "cosmetico", "cosmético",
      "belleza", "beauty", "piel", "serum", "serum facial", "sérum", "crema", "cream", "sunscreen",
      "protector solar", "perfume", "fragrance", "fragancia", "lipstick", "labial", "retinol", "vitamin c",
    ],
  },
];

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // bỏ dấu — so khớp không phân biệt có/không dấu
}

export function guessCategory(keyword) {
  const norm = normalize(keyword);
  if (!norm) return null;
  for (const rule of RULES) {
    if (rule.terms.some((term) => norm.includes(normalize(term)))) {
      return rule.category;
    }
  }
  return null; // không đoán được — để trống, không suy diễn liều lĩnh
}
