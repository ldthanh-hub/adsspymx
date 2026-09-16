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

      // --- Thời trang — ngành hàng ---
      { keyword: "moda mujer", type: "industry", category: "Thời trang" },
      { keyword: "ropa mujer", type: "industry", category: "Thời trang" },
      { keyword: "zapatos mujer", type: "industry", category: "Thời trang" },
      { keyword: "tenis mujer", type: "industry", category: "Thời trang" }, // thêm 11/09/2026 — góc tìm giày thể thao/sneaker, khác tập kết quả với "zapatos mujer" (giày nói chung)

      // --- Thời trang — thương hiệu Mexico DTC (nguồn: abito.com.mx) ---
      { keyword: "Abito", type: "brand", category: "Thời trang" },
      { keyword: "Collectiva Concepción", type: "brand", category: "Thời trang" },
      { keyword: "Caruso Yucatán", type: "brand", category: "Thời trang" }, // thêm hậu tố "Yucatán" để tránh trùng brand/tên riêng "Caruso" khác không liên quan
      { keyword: "Costavana", type: "brand", category: "Thời trang" },
      { keyword: "Someone Somewhere", type: "brand", category: "Thời trang" },
      // Thêm 11/09/2026 — nguồn: revistacodigo.com ("10 tiendas de moda independientes en México")
      { keyword: "Mal de Amores joyería", type: "brand", category: "Thời trang" }, // thêm "joyería" vì "Mal de Amores" trùng tên nhiều bài hát/phim, cần thu hẹp
      { keyword: "Sandra Weil", type: "brand", category: "Thời trang" },

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

      // --- Thời trang — ngành hàng ---
      { keyword: "women's fashion", type: "industry", category: "Thời trang" },
      { keyword: "men's clothing", type: "industry", category: "Thời trang" },

      // --- Thời trang — thương hiệu DTC (nguồn: ringly.io) ---
      { keyword: "Everlane", type: "brand", category: "Thời trang" },
      { keyword: "Quince", type: "brand", category: "Thời trang" },
      { keyword: "Allbirds", type: "brand", category: "Thời trang" },
      { keyword: "Rothy's", type: "brand", category: "Thời trang" },
      { keyword: "Reformation", type: "brand", category: "Thời trang" },
      { keyword: "Mejuri", type: "brand", category: "Thời trang" },
      { keyword: "Vuori Clothing", type: "brand", category: "Thời trang" },
      { keyword: "Cuyana", type: "brand", category: "Thời trang" }, // thêm 11/09/2026, nguồn: glossy.co
      { keyword: "Faherty Brand", type: "brand", category: "Thời trang" }, // thêm "Brand" tránh trùng tên riêng "Faherty"; nguồn: glossy.co

      // thêm từ khóa/thương hiệu của bạn ở đây (nhớ khai báo đủ type + category)
    ],
  },

  KR: {
    label: "Hàn Quốc",
    metaCountryCode: "KR",
    items: [
      // --- Mỹ phẩm & Làm đẹp — ngành hàng (tiếng Hàn, vì quảng cáo thật đa số viết tiếng Hàn) ---
      { keyword: "스킨케어", type: "industry", category: "Mỹ phẩm & Làm đẹp" }, // "skincare"
      { keyword: "화장품", type: "industry", category: "Mỹ phẩm & Làm đẹp" }, // "mỹ phẩm/cosmetics"
      { keyword: "메이크업", type: "industry", category: "Mỹ phẩm & Làm đẹp" }, // "makeup"

      // --- Mỹ phẩm & Làm đẹp — thương hiệu K-beauty phổ biến (benchmark — tìm kiếm không ra brand
      // DTC/indie nào có nguồn báo chí đủ rõ ràng, nên dùng nhóm thương hiệu lớn/phổ biến đã xác
      // minh thật, nguồn: Wikipedia) ---
      { keyword: "Innisfree", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Nature Republic", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Skin Food", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Mamonde", type: "brand", category: "Mỹ phẩm & Làm đẹp" },

      // --- Thời trang — ngành hàng (tiếng Hàn) ---
      { keyword: "여성 패션", type: "industry", category: "Thời trang" }, // "women's fashion"
      { keyword: "남성 의류", type: "industry", category: "Thời trang" }, // "men's clothing"

      // --- Thời trang — thương hiệu DTC độc lập (nguồn: russh.com, "31 of the best Korean fashion
      // brands to shop in 2026" — bài viết nhấn mạnh đây là các label độc lập/DTC quy mô vừa) ---
      { keyword: "Ader Error", type: "brand", category: "Thời trang" },
      { keyword: "We11done", type: "brand", category: "Thời trang" },
      { keyword: "MatinKim", type: "brand", category: "Thời trang" },
      { keyword: "Dunst clothing", type: "brand", category: "Thời trang" }, // thêm "clothing" tránh trùng tên riêng "Dunst" (VD diễn viên Kirsten Dunst)
      { keyword: "Marge Sherwood", type: "brand", category: "Thời trang" },
      { keyword: "Andersson Bell", type: "brand", category: "Thời trang" },

      // thêm từ khóa/thương hiệu của bạn ở đây (nhớ khai báo đủ type + category)
    ],
  },

  TH: {
    label: "Thái Lan",
    metaCountryCode: "TH",
    items: [
      // --- Mỹ phẩm & Làm đẹp — ngành hàng (tiếng Thái) ---
      { keyword: "สกินแคร์", type: "industry", category: "Mỹ phẩm & Làm đẹp" }, // "skincare"
      { keyword: "เครื่องสำอาง", type: "industry", category: "Mỹ phẩm & Làm đẹp" }, // "mỹ phẩm/cosmetics"
      { keyword: "แต่งหน้า", type: "industry", category: "Mỹ phẩm & Làm đẹp" }, // "trang điểm/makeup"

      // --- Mỹ phẩm & Làm đẹp — thương hiệu DTC độc lập (nguồn: tatlerasia.com, "15 Thai beauty
      // brands to know in 2026") ---
      { keyword: "Baby Bright", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Gravich", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Fyne beauty", type: "brand", category: "Mỹ phẩm & Làm đẹp" }, // thêm "beauty" tránh trùng tên riêng "Fyne" (VD địa danh/rượu whisky Loch Fyne)
      { keyword: "Dr Pong", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Rati skincare", type: "brand", category: "Mỹ phẩm & Làm đẹp" }, // thêm "skincare" tránh trùng tên riêng "Rati" (tên nữ thần trong thần thoại Hindu)
      { keyword: "Jux beauty", type: "brand", category: "Mỹ phẩm & Làm đẹp" }, // thêm "beauty" tránh trùng từ viết tắt "Jux" ở ngành khác

      // --- Thời trang — ngành hàng (tiếng Thái) ---
      { keyword: "แฟชั่นผู้หญิง", type: "industry", category: "Thời trang" }, // "women's fashion"
      { keyword: "เสื้อผ้าผู้ชาย", type: "industry", category: "Thời trang" }, // "men's clothing"

      // --- Thời trang — thương hiệu DTC (nguồn: tatlerasia.com, "2026 guide to Southeast Asian
      // fashion brands") ---
      { keyword: "Gentlewoman Bangkok", type: "brand", category: "Thời trang" }, // thêm "Bangkok" tránh trùng nghĩa gốc "gentlewoman"
      { keyword: "Disaya", type: "brand", category: "Thời trang" },
      { keyword: "Kloset fashion", type: "brand", category: "Thời trang" }, // thêm "fashion" tránh trùng từ thông dụng "kloset"/"closet"
      { keyword: "Mitr clothing", type: "brand", category: "Thời trang" }, // thêm "clothing" tránh trùng từ ngắn dễ nhầm

      // thêm từ khóa/thương hiệu của bạn ở đây (nhớ khai báo đủ type + category)
    ],
  },

  MY: {
    label: "Malaysia",
    metaCountryCode: "MY",
    items: [
      // --- Mỹ phẩm & Làm đẹp — ngành hàng (tiếng Mã Lai — quảng cáo tại Malaysia thường pha trộn
      // Mã Lai/Anh, riêng "kosmetik"/"mekap" là từ mượn quen dùng trong tiếng Mã Lai đời thường) ---
      { keyword: "penjagaan kulit", type: "industry", category: "Mỹ phẩm & Làm đẹp" }, // "chăm sóc da/skincare"
      { keyword: "kosmetik", type: "industry", category: "Mỹ phẩm & Làm đẹp" }, // "mỹ phẩm/cosmetics"
      { keyword: "mekap", type: "industry", category: "Mỹ phẩm & Làm đẹp" }, // "trang điểm/makeup"

      // --- Mỹ phẩm & Làm đẹp — thương hiệu DTC độc lập (nguồn: buro247.my, "18 Malaysian Skincare
      // Brands Every Beauty Lover Should Know") ---
      { keyword: "Lumi Beauty", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Handmade Heroes", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Chandra Skin", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "The Mineraw", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Cuura", type: "brand", category: "Mỹ phẩm & Làm đẹp" },
      { keyword: "Meizlab", type: "brand", category: "Mỹ phẩm & Làm đẹp" },

      // --- Thời trang — ngành hàng (tiếng Mã Lai) ---
      { keyword: "fesyen wanita", type: "industry", category: "Thời trang" }, // "women's fashion"
      { keyword: "pakaian lelaki", type: "industry", category: "Thời trang" }, // "men's clothing"

      // --- Thời trang — thương hiệu Malaysia (nguồn: growyourclothingbrand.com, "12 Malaysian
      // Clothing Brands Worth Knowing (2026)") ---
      { keyword: "Naelofar", type: "brand", category: "Thời trang" },
      { keyword: "Poplook", type: "brand", category: "Thời trang" },
      { keyword: "Pestle & Mortar Clothing", type: "brand", category: "Thời trang" }, // thêm "Clothing" — "Pestle & Mortar" trùng tên dụng cụ bếp (cối chày), rất dễ lẫn với nội dung nấu ăn
      { keyword: "Christy Ng", type: "brand", category: "Thời trang" },
      { keyword: "TNTCO", type: "brand", category: "Thời trang" },

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
