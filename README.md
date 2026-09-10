# MX Ad Spy — MVP theo dõi quảng cáo Facebook/Instagram tại Mexico

Công cụ nội bộ, quy mô nhỏ, dùng để hỗ trợ nghiên cứu creative đối thủ tại thị trường Mexico.
Nguồn dữ liệu duy nhất trong bản MVP này: **Meta Ad Library API** (chính thức, miễn phí, hợp pháp).

## ĐỌC TRƯỚC — Giới hạn dữ liệu thật (rất quan trọng, tránh kỳ vọng sai)

Với quảng cáo thương mại thông thường (không phải chính trị/xã hội), Meta **không** công khai qua
bất kỳ kênh hợp pháp nào: spend, impressions (lượt hiển thị), reach, CTR, conversion, ROAS. Đây là
giới hạn chính sách của Meta — áp dụng cho MỌI tool, kể cả PiPiADS/BigSpy. Không có cách hợp pháp
nào lấy được các số này của đối thủ.

Những gì tool này lấy được, và mức độ tin cậy:

| Dữ liệu | Nguồn | Độ tin cậy |
|---|---|---|
| Creative (text, tiêu đề), Page, nền tảng chạy | Meta Ad Library API | Chính thức, 100% tin cậy |
| Ngày bắt đầu / kết thúc chạy → `days_active` | Meta Ad Library API | Chính thức, 100% tin cậy |
| Like / Comment / Share / Lượt xem video | Render trang snapshot công khai bằng Playwright | **Best-effort** — chỉ có khi ad gắn với 1 bài post công khai; Meta đổi giao diện có thể làm parser hỏng bất kỳ lúc nào |
| Spend, Impressions, ROAS | — | **Không khả dụng, không cố lấy** |

`days_active` (độ bền chạy) là tín hiệu proxy quan trọng nhất: quảng cáo chạy càng lâu thường
đồng nghĩa đang có lời — vì không ai giữ một quảng cáo lỗ chạy mãi.

## Kiến trúc

```
GitHub Actions (cron hàng ngày)
   └─ fetchAds.js
        ├─ Meta Ad Library API  → creative + ngày chạy  (mọi ad)
        └─ Playwright            → like/comment/share    (chỉ ad MỚI, giới hạn số lượng/lần chạy)
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

### Bước 1 — Lấy Meta Access Token
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
