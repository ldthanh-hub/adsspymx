// Đoán NGÀNH HÀNG cho 1 từ khóa quét theo yêu cầu (fetchOneKeyword.js) khi người dùng để trống ô
// "category" lúc bấm Run workflow trên GitHub Actions — thay vì bắt buộc tự chọn tay.
//
// CÁCH HOẠT ĐỘNG: so khớp CHUỖI CON (không phân biệt hoa/thường, không dấu) giữa từ khóa nhập vào và
// 1 danh sách từ gợi ý theo từng ngành (Tây Ban Nha/Anh cho MX/US, kèm 1 số từ tiếng Hàn/Thái/Malay
// hay gặp cho KR/TH/MY — xem native-language keywords trong config/keywords.js). CHỈ LÀ HEURISTIC
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
      // Hàn/Thái/Malay (KR/TH/MY) — khớp với các từ khóa ngành native-language trong config/keywords.js
      "스킨케어", "화장품", "메이크업", "สกินแคร์", "เครื่องสำอาง", "แต่งหน้า", "penjagaan kulit", "kosmetik", "mekap",
    ],
  },
  {
    category: "Thời trang",
    terms: [
      "fashion", "moda", "ropa", "clothing", "apparel", "zapato", "shoe", "sneaker", "tenis", "dress",
      "vestido", "bag", "bolsa", "jewelry", "joyeria", "joyería", "accesorio", "accessory", "wear",
      "여성 패션", "남성 의류", "แฟชั่นผู้หญิง", "เสื้อผ้าผู้ชาย", "fesyen wanita", "pakaian lelaki",
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
