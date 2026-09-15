# MX Ad Spy — MVP theo dõi quảng cáo Facebook/Instagram tại Mexico

Công cụ nội bộ, quy mô nhỏ, dùng để hỗ trợ nghiên cứu creative đối thủ tại thị trường Mexico.

## ⚠️ CẬP NHẬT QUAN TRỌNG — đổi nguồn dữ liệu (đọc trước khi làm gì khác)

Bản thiết kế ban đầu dùng **Meta Ad Library API chính thức** để lấy dữ liệu. Sau khi triển khai
thật và test trực tiếp qua Graph API Explorer, phát hiện: theo tài liệu chính thức tại
facebook.com/ads/library/api, API này **chỉ** trả dữ liệu cho (1) quảng cáo về vấn đề xã hội/bầu
cử/chính trị ở bất kỳ đâu, hoặc (2) quảng cáo bất kỳ loại nào **nhưng chỉ nếu phân phối đến
EU/UK**. Mexico không thuộc EU/UK, và mỹ phẩm không phải quảng cáo chính trị — nên với đúng mục
tiêu ban đầu của dự án, API chính thức **luôn trả lỗi/rỗng**, bất kể tài khoản có được Meta duyệt
quyền `ads_read` hay hoàn tất xác minh danh tính hay không. Đây là giới hạn sản phẩm cố định của
Meta, không phải lỗi cấu hình.

**Giải pháp đang dùng:** scrape trực tiếp trang **facebook.com/ads/library** (trang public, không
cần đăng nhập) bằng Playwright — xem `server/src/lib/adLibraryScraper.js`. `META_ACCESS_TOKEN`
không còn cần thiết cho luồng lấy dữ liệu chính nữa (vẫn giữ trong secrets phòng khi cần dùng lại
Graph API — ví dụ nếu mở rộng sang EU/UK).

### ⚠️ RỦI RO PHÁP LÝ CẦN CHẤP NHẬN TRƯỚC KHI BẬT CRON TỰ ĐỘNG

Điều khoản dịch vụ của Meta **cấm truy cập/scrape tự động** ngoài API chính thức được cấp phép,
kể cả với trang public không cần đăng nhập. Rủi ro thực tế:
- Meta có thể **chặn IP** của Render/GitHub Actions runner đang gọi — job sẽ lỗi rõ ràng (xem bảng
  `fetch_runs`), không mất dữ liệu đã có, nhưng sẽ ngừng cập nhật cho đến khi xử lý.
- Về lý thuyết Meta có quyền hành động pháp lý dân sự nếu quy mô đủ lớn/mang tính thương mại — với
  quy mô NỘI BỘ, KHÔNG thương mại hóa, tần suất THẤP (mặc định 1 lần/ngày) như dự án này, rủi ro bị
  chú ý thấp hơn nhiều so với các dịch vụ thương mại như PiPiADS/BigSpy, nhưng **không bằng không**.

Đây là quyết định đánh đổi có chủ đích giữa nhóm dự án — chấp nhận rủi ro thấp để đổi lấy dữ liệu
thật tại thị trường Mexico, vì không có con đường hợp pháp/chính thức nào khác cho use case này.
Nếu job bắt đầu lỗi liên tục, đó là tín hiệu để **tạm dừng cron và xem lại**, không phải để cố né
bằng cách đổi proxy/User-Agent.

## Giới hạn dữ liệu thật (rất quan trọng, tránh kỳ vọng sai)

Với quảng cáo thương mại thông thường (không phải chính trị/xã hội), Meta **không** công khai qua
bất kỳ kênh nào — kể cả trang public: spend, impressions (lượt hiển thị), reach, CTR, conversion,
ROAS. Đây là giới hạn chính sách của Meta — áp dụng cho MỌI tool, kể cả PiPiADS/BigSpy. Không có
cách nào lấy được các số này của đối thủ, hợp pháp hay không.

Những gì tool này lấy được, và mức độ tin cậy:

| Dữ liệu | Nguồn | Độ tin cậy |
|---|---|---|
| Creative (text), tên Page, ngày bắt đầu chạy | Scrape trang Ad Library public (Playwright) | **Best-effort** — parse theo cấu trúc/vị trí văn bản, không có selector ổn định, có thể hỏng khi Meta đổi giao diện |
| Like / Comment / Share / Lượt xem video | Render trang snapshot công khai bằng Playwright | **Best-effort** — chỉ có khi ad gắn với 1 bài post công khai; Meta đổi giao diện có thể làm parser hỏng bất kỳ lúc nào |
| Spend, Impressions, ROAS | — | **Không khả dụng, không cố lấy** |

`days_active` (độ bền chạy) là tín hiệu proxy quan trọng nhất: quảng cáo chạy càng lâu thường
đồng nghĩa đang có lời — vì không ai giữ một quảng cáo lỗ chạy mãi.

## Kiến trúc

```
GitHub Actions (cron hàng ngày)
   └─ fetchAds.js
        ├─ Playwright  → scrape facebook.com/ads/library công khai → creative + ngày bắt đầu (mọi ad)
        └─ Playwright  → like/comment/share (chỉ ad MỚI, giới hạn số lượng/lần chạy)
                └─ ghi vào Postgres (Supabase/Neon)

Render/Railway (backend Express, read-only API)
        └─ đọc từ Postgres, trả JSON cho frontend

Vercel (frontend Next.js)
        └─ gọi backend API, hiển thị bảng lọc được
```

Không có bước nào tự lưu trữ lại video/ảnh creative — chỉ lưu link `snapshot_url` trỏ về đúng
trang gốc của Meta. Điều này vừa giảm chi phí storage, vừa tránh rủi ro tái phân phối bản quyền
creative của người khác.

## Các bước triển khai (không cần mua domain)

### Bước 1 — Lấy Meta Access Token (KHÔNG BẮT BUỘC với luồng hiện tại)
Từ khi chuyển sang scrape trang public (xem mục "CẬP NHẬT QUAN TRỌNG" ở đầu file), bước này
**không còn cần thiết** để job chạy được — `fetchAds.js` không gọi Graph API nữa. Chỉ làm bước
này nếu sau này quay lại dùng `metaAdLibrary.js` (ví dụ mở rộng sang EU/UK):
1. Vào [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App** → chọn loại **Business**.
2. Sau khi tạo App, vào **Tools > Graph API Explorer**, chọn đúng App vừa tạo, bấm **Generate Access Token**.
3. Dán token vào biến `META_ACCESS_TOKEN`.
   Lưu ý: token tạo từ Graph API Explorer thường hết hạn sau ~1-2 giờ (dùng để test). Khi vận hành
   thật, cần đổi sang **long-lived token** hoặc token của **System User** trong Business Settings để
   không phải đổi token mỗi ngày — bước này có thể cần xác minh thêm quy trình App Review tùy chính
   sách Meta tại thời điểm bạn triển khai, vì chính sách có thể thay đổi.

### Bước 2 — Tạo database miễn phí
1. Tạo project tại [supabase.com](https://supabase.com) (hoặc [neon.tech](https://neon.tech)) — free tier.
2. Lấy connection string (Settings → Database → Connection string, chọn URI).
3. Chạy schema:
   ```bash
   cd server
   cp .env.example .env   # điền DATABASE_URL vừa lấy
   npm install
   npm run migrate
   ```

### Bước 3 — Deploy backend (Render, free tier)
1. Push thư mục `server/` lên một GitHub repo.
2. Tại [render.com](https://render.com) → **New Web Service** → kết nối repo, chọn thư mục `server`.
3. Build command: `npm install` — Start command: `npm start`.
4. Thêm biến môi trường: `DATABASE_URL`, `META_ACCESS_TOKEN`, `CORS_ORIGIN` (điền sau khi có domain frontend ở Bước 4).
5. Deploy xong sẽ có domain dạng `https://ten-app.onrender.com` — không cần mua domain riêng.

### Bước 4 — Deploy frontend (Vercel, free tier)
1. Push thư mục `web/` lên GitHub repo (có thể cùng repo, khác thư mục).
2. Tại [vercel.com](https://vercel.com) → **Import Project** → trỏ vào thư mục `web`.
3. Thêm biến môi trường `NEXT_PUBLIC_API_BASE` = domain backend ở Bước 3.
4. Deploy xong sẽ có domain dạng `https://ten-app.vercel.app`.
5. Quay lại Render, cập nhật `CORS_ORIGIN` = domain Vercel vừa có, redeploy backend.

### Bước 5 — Bật job tự động (GitHub Actions)
1. Vào repo GitHub → **Settings → Secrets and variables → Actions** → thêm secret `DATABASE_URL` và `META_ACCESS_TOKEN`.
2. Chỉnh danh sách từ khóa trong `server/src/config/keywords.js`.
3. Vào tab **Actions**, chạy thử workflow bằng nút **Run workflow** (workflow_dispatch) — **BẮT BUỘC chạy thử tay trước**, kiểm tra log không lỗi, kiểm tra bảng `ads` trong Supabase có dữ liệu hợp lệ, TRƯỚC KHI để lịch tự động chạy hàng ngày.
4. Sau khi chạy thử ổn, lịch cron (7h sáng giờ Mexico City) sẽ tự chạy mỗi ngày.

## Quét 1 từ khóa theo yêu cầu (khi tìm không ra kết quả)

**Vì sao cần tính năng này**: ô tìm kiếm trên web chỉ lọc TRONG số quảng cáo đã quét sẵn từ danh
sách từ khóa cố định ở `server/src/config/keywords.js` (job `fetch-daily.yml` chạy mỗi sáng) — KHÔNG
tìm trực tiếp trên Meta Ad Library. Nếu bạn gõ 1 từ khóa/thương hiệu chưa từng nằm trong danh sách đó
(VD: "Seyoul", hoặc 1 đối thủ mới xuất hiện), ô tìm kiếm sẽ luôn ra 0 kết quả — KHÔNG PHẢI lỗi hay
do dữ liệu chưa nạp xong. Dùng workflow dưới đây để quét thử 1 lần, không cần sửa code.

**Lưu ý**: không tức thời như search thật — cần vào GitHub thao tác tay, mất khoảng 1-3 phút. Đây là
lựa chọn CHỦ ĐỘNG (không tự động hoàn toàn trong app) — vì backend đang chạy trên Render free tier
không cài được trình duyệt để tự quét, và không muốn thêm token bảo mật mới chỉ để làm việc đó (xem
thêm lý do trong `server/src/jobs/fetchOneKeyword.js`).

**Từ 15/09/2026 — có sẵn trợ giúp ngay trong web**: khi gõ vào ô tìm kiếm mà không ra kết quả, trang
web tự hiện 1 khung "Không thấy...?" ngay bên dưới, đã điền sẵn từ khóa + tự đoán ngành hàng (dựa vào
các từ mô tả trong từ khóa, VD gõ "sérum facial" sẽ tự đoán ra "Mỹ phẩm & Làm đẹp" — tên thương hiệu
không có từ mô tả như "Seyoul" thì để trống, bạn tự chọn) — chỉ cần bấm **"Sao chép thông tin cần
điền"** rồi **"Mở trang chạy quét trên GitHub"**, dán vào 3 ô của form là xong, đỡ phải tự gõ lại từ
đầu như hướng dẫn thủ công bên dưới.

Các bước (làm thủ công, hoặc theo khung gợi ý ở trên):
1. Vào repo trên GitHub → tab **Actions** (thanh trên cùng, cạnh Code/Pull requests).
2. Ở cột bên trái, chọn workflow tên **"Quét 1 từ khóa theo yêu cầu (thủ công)"**.
3. Bấm nút **Run workflow** (góc phải, có ô sổ xuống) → điền (hoặc dán nếu đã bấm "Sao chép" ở web):
   - **keyword**: từ khóa hoặc tên thương hiệu muốn quét (VD: `Seyoul`).
   - **country**: chọn `MX` hoặc `US`.
   - **category**: để trống nếu không chắc — job sẽ TỰ ĐOÁN dựa vào từ khóa (xem
     `server/src/lib/guessCategory.js`), hoặc chọn tay 1 trong 3 ngành hàng nếu muốn chắc chắn. Chỉ
     ảnh hưởng cách hiển thị/phân loại, không ảnh hưởng kết quả quét.
4. Bấm nút xanh **Run workflow** để bắt đầu. Đợi khoảng 1-3 phút, refresh tab Actions tới khi thấy
   dấu ✅ xanh (ID chạy mới nhất, tên "Quét 1 từ khóa theo yêu cầu").
5. Quay lại web, tải lại trang (F5), gõ lại đúng từ khóa vừa quét vào ô tìm kiếm — nếu Meta Ad
   Library có quảng cáo công khai khớp từ khóa đó, giờ sẽ hiện ra.
6. Nếu vẫn không ra kết quả: hoặc đối thủ/thương hiệu đó THẬT SỰ không có quảng cáo công khai đang
   chạy tại thị trường đã chọn (rất có thể xảy ra — không phải lỗi công cụ), hoặc từ khóa cần thử
   viết khác đi (VD tên thương hiệu có dấu/không dấu, thêm/bớt từ mô tả ngành để thu hẹp — xem log
   chi tiết trong tab Actions, bước "Quét từ khóa được yêu cầu", để biết chính xác quét được bao
   nhiêu quảng cáo).

**Về lâu dài**: nếu 1 từ khóa/thương hiệu quét thử ra kết quả tốt và bạn muốn theo dõi THƯỜNG XUYÊN
(không phải chỉ tra 1 lần), hãy thêm hẳn vào danh sách cố định ở `server/src/config/keywords.js` để
nó được quét lại mỗi ngày cùng job chính — workflow này chỉ dành cho tra cứu phát sinh, không thay
thế danh sách theo dõi thường xuyên.

## Checklist bảo mật & xử lý lỗi (đã áp dụng trong code, rà lại trước khi dùng thật)

- [x] `.env` nằm trong `.gitignore` — secret không bao giờ commit vào git.
- [x] Secret truyền qua GitHub Actions Secrets / biến môi trường trên Render — không hardcode trong code.
- [x] API chỉ có route `GET` — không có endpoint ghi/xóa dữ liệu công khai.
- [x] Toàn bộ query SQL dùng parameterized query (`$1, $2...`) — không nối chuỗi, không có SQL injection.
- [x] Input từ client được validate bằng `zod` trước khi chạm DB (đã test: gửi tham số sai kiểu/vượt giới hạn bị chặn với lỗi rõ ràng, không crash server).
- [x] `helmet()` + `cors()` giới hạn đúng domain frontend (không để `*`).
- [x] Rate limit 60 request/phút/IP trên API.
- [x] Error handler tập trung — lỗi thật được log ở server, client chỉ nhận thông điệp chung, không lộ chi tiết DB/stack trace.
- [x] Mỗi từ khóa trong job fetch được `try/catch` riêng — 1 từ khóa lỗi không làm sập cả job, lỗi được ghi vào bảng `fetch_runs` để chẩn đoán thay vì mất dấu vết.
- [x] Giới hạn số trang/số ad xử lý mỗi lần chạy (`MAX_PAGES_PER_KEYWORD`, `MAX_NEW_ADS_FOR_ENGAGEMENT_PER_RUN`) — tránh vượt rate limit Meta và tránh job chạy quá lâu.
- [x] Không lưu trữ lại video/ảnh creative, chỉ lưu link gốc.
- [x] `npm audit`: backend đã sửa hết (0 vulnerability). Frontend còn 1 vulnerability trung gian (PostCSS, qua dependency của Next.js) — xem mục "Vấn đề đã biết" bên dưới.
- [x] Đã build-test thực tế: backend khởi động và trả response đúng (health check, validation lỗi trả về đúng định dạng), frontend build production thành công không lỗi.

### Vấn đề đã biết (known issue) — không chặn triển khai nhưng cần theo dõi

`npm audit` ở `web/` báo 1 lỗ hổng PostCSS (đọc file `.map` ngoài ý muốn qua `sourceMappingURL`) nằm
sâu trong dependency của Next.js 14. Bản vá đầy đủ yêu cầu nâng lên Next.js 16 (breaking change, cần
test lại toàn bộ trước khi áp dụng nên tôi chưa tự ý nâng). Rủi ro thực tế cho app này thấp vì đây là
dashboard nội bộ không nhận CSS từ người dùng bên ngoài — không có đường tấn công trực tiếp. Khuyến
nghị: chạy lại `npm audit` định kỳ, cân nhắc nâng cấp Next.js khi có thời gian test kỹ.

### Việc engagement (like/comment/share/view) cần theo dõi thêm

Vì đây là best-effort parse HTML (không phải API chính thức), tỷ lệ thành công sẽ dao động và có thể
giảm dần nếu Meta đổi giao diện. Theo dõi cột `engagement_parse_ok` trong bảng `ads` — nếu tỷ lệ
`false` tăng đột biến, đó là dấu hiệu cần cập nhật lại selector trong `snapshotParser.js`.

## Cấu trúc thư mục

```
mx-ad-spy/
├── server/           # backend: fetch job + API
│   ├── src/db/        # schema.sql, kết nối DB
│   ├── src/lib/        # gọi Meta API, parse engagement
│   ├── src/jobs/        # job chạy theo lịch
│   ├── src/api/          # Express API
│   └── src/config/        # danh sách từ khóa cần theo dõi
├── web/               # frontend Next.js
└── .github/workflows/  # lịch chạy tự động (GitHub Actions)
```
