// Helper dùng chung giữa trang Quảng cáo (pages/index.js) và Dashboard Brand (pages/brands.js) —
// tách riêng để 2 trang không lặp lại cùng 1 logic (màu avatar, tính "độ bền chạy", build link FB...).
import { useState, useEffect } from "react";

// Danh sách thị trường đang theo dõi — khớp với MARKETS trong server/src/config/keywords.js (chỉ
// cần khai báo tên hiển thị ở đây, phần từ khóa/thương hiệu nằm bên server, không lặp lại).
export const MARKET_LABELS = {
  MX: "Mexico",
  US: "United States",
  KR: "Hàn Quốc",
  TH: "Thái Lan",
  MY: "Malaysia",
};
export const MARKET_CODES = Object.keys(MARKET_LABELS);

export const MEDIA_TYPE_LABELS = { video: "Video", image: "Hình ảnh", none: "Không có ảnh/video" };

// Nhãn tiếng Việt cho các từ khóa NGÀNH HÀNG (type: "industry" trong config/keywords.js) — chỉ
// dùng để HIỂN THỊ cho dễ đọc, KHÔNG thay đổi giá trị filter thật gửi lên API (vẫn dùng đúng chuỗi
// keyword gốc, vì đó mới là từ khóa thật đã dùng để search trên Meta Ad Library). Không áp dụng cho
// tên thương hiệu (type: "brand") — tên thương hiệu không dịch.
// LƯU Ý: thêm ngành/từ khóa industry mới ở server/src/config/keywords.js thì nhớ thêm nhãn tương
// ứng ở đây — 2 nơi không tự đồng bộ vì đây chỉ là lớp hiển thị, cố tình tách khỏi dữ liệu thật.
export const INDUSTRY_LABELS_VI = {
  // Mexico
  maquillaje: "Trang điểm",
  "cosméticos": "Mỹ phẩm",
  "cuidado de la piel": "Chăm sóc da",
  belleza: "Làm đẹp",
  "moda mujer": "Thời trang nữ",
  "ropa mujer": "Quần áo nữ",
  "zapatos mujer": "Giày nữ",
  // United States
  skincare: "Chăm sóc da",
  makeup: "Trang điểm",
  "beauty products": "Sản phẩm làm đẹp",
  cosmetics: "Mỹ phẩm",
  "women's fashion": "Thời trang nữ",
  "men's clothing": "Quần áo nam",
  // Hàn Quốc (Korea)
  "스킨케어": "Chăm sóc da (Hàn Quốc)",
  "화장품": "Mỹ phẩm (Hàn Quốc)",
  "메이크업": "Trang điểm (Hàn Quốc)",
  "여성 패션": "Thời trang nữ (Hàn Quốc)",
  "남성 의류": "Quần áo nam (Hàn Quốc)",
  // Thái Lan (Thailand)
  "สกินแคร์": "Chăm sóc da (Thái Lan)",
  "เครื่องสำอาง": "Mỹ phẩm (Thái Lan)",
  "แต่งหน้า": "Trang điểm (Thái Lan)",
  "แฟชั่นผู้หญิง": "Thời trang nữ (Thái Lan)",
  "เสื้อผ้าผู้ชาย": "Quần áo nam (Thái Lan)",
  // Malaysia
  "penjagaan kulit": "Chăm sóc da (Malaysia)",
  kosmetik: "Mỹ phẩm (Malaysia)",
  mekap: "Trang điểm (Malaysia)",
  "fesyen wanita": "Thời trang nữ (Malaysia)",
  "pakaian lelaki": "Quần áo nam (Malaysia)",
};

export function industryLabelVi(keyword) {
  return INDUSTRY_LABELS_VI[keyword] || keyword;
}

// Đoán ngành hàng cho 1 từ khóa CHƯA quét (dùng ở panel "Yêu cầu quét từ khóa mới" khi search
// không ra kết quả) — CÙNG logic với server/src/lib/guessCategory.js, để giao diện gợi ý ra đúng
// giá trị mà job quét (fetchOneKeyword.js) cũng sẽ tự đoán nếu để trống. 2 nơi PHẢI đồng bộ danh
// sách từ khóa — sửa 1 bên thì nhớ sửa bên kia. Chỉ là heuristic so chuỗi con, không chính xác 100%
// (đặc biệt với tên thương hiệu không chứa từ mô tả ngành, VD "Kosas" sẽ không đoán ra được).
const CATEGORY_GUESS_RULES = [
  {
    category: "Mỹ phẩm & Làm đẹp",
    terms: [
      "skincare", "skin care", "makeup", "make up", "maquillaje", "cosmetic", "cosmetico", "cosmético",
      "belleza", "beauty", "piel", "serum", "sérum", "crema", "cream", "sunscreen", "protector solar",
      "perfume", "fragrance", "fragancia", "lipstick", "labial", "retinol", "vitamin c",
      // Hàn/Thái/Malay (KR/TH/MY)
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

function normalizeForGuess(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function guessCategory(keyword) {
  const norm = normalizeForGuess(keyword);
  if (!norm) return null;
  for (const rule of CATEGORY_GUESS_RULES) {
    if (rule.terms.some((term) => norm.includes(normalizeForGuess(term)))) {
      return rule.category;
    }
  }
  return null;
}

// TRƯỚC ĐÂY: phân loại "ngành hàng" vs "thương hiệu" bằng cách so chuỗi tên keyword với 1 Set cố
// định ở đây — dễ vỡ mỗi khi thêm ngành mới ở server (phải nhớ sửa cả 2 nơi). TỪ 11/09/2026: server
// trả thẳng field "type" ("industry"/"brand") theo từng keyword qua /api/keywords (gắn cứng từ
// config/keywords.js lúc quét) — dùng trực tiếp field đó, không cần Set này nữa.

const AVATAR_GRADIENTS = [
  ["#6C5CE7", "#a29bfe"],
  ["#00b894", "#55efc4"],
  ["#e17055", "#fab1a0"],
  ["#0984e3", "#74b9ff"],
  ["#d63031", "#ff7675"],
  ["#00b8a9", "#5efce8"],
  ["#e84393", "#fd79a8"],
  ["#fdcb6e", "#ffeaa7"],
  ["#2d3436", "#636e72"],
  ["#6c5ce7", "#fd79a8"],
];

export function hashString(str) {
  let h = 0;
  const s = str || "?";
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function avatarGradient(name) {
  const [from, to] = AVATAR_GRADIENTS[hashString(name) % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

export function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatRelativeDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} giờ trước`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} ngày trước`;
}

// Đánh dấu "độ bền" quảng cáo — tín hiệu nghiên cứu quan trọng nhất của công cụ spy ads: ad chạy
// càng lâu không đổi thường đồng nghĩa nó đang hiệu quả (đối thủ không rút vì vẫn ra đơn).
export function enduranceTier(days) {
  if (days == null) return { label: null, tone: "muted" };
  if (days >= 180) return { label: "🔥 Bền lâu", tone: "hot" };
  if (days >= 60) return { label: "Đang ổn định", tone: "good" };
  if (days >= 14) return { label: "Mới ổn định", tone: "ok" };
  return { label: "Mới xuất hiện", tone: "new" };
}

// page_id lưu trong DB có 3 khả năng (xem adLibraryScraper.js): (1) page handle thật lấy từ link
// Facebook trong card — DÙNG ĐƯỢC để build link; (2) fallback "unknown-<libraryId>" khi không tìm
// thấy gì — KHÔNG dùng được; (3) trùng với page_name (tên hiển thị, có dấu cách) khi không có link
// nhưng có đọc được tên — KHÔNG dùng được làm URL. Chỉ build link khi chắc chắn là 1 handle thật.
export function facebookUrlFor(pageId) {
  if (!pageId) return null;
  if (pageId.startsWith("unknown-")) return null;
  if (pageId.includes(" ")) return null;
  return `https://www.facebook.com/${encodeURIComponent(pageId)}`;
}

export function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
