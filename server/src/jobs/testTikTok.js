// Test TikWM trên GitHub Actions (26/10/2026) — KHÔNG ghi DB, KHÔNG cần secret, KHÔNG cần Playwright.
// Mục đích: máy VM bị Cloudflare chặn TikWM ở mọi endpoint trừ challenge/info, nhưng IP của
// máy chạy GitHub Actions khác IP của VM nên có thể qua được. Test này trả lời 1 câu duy nhất:
// "Từ máy chạy Actions, TikWM user/info và feed/search có trả JSON không, hay vẫn bị chặn?"
//
// Cách đọc kết quả trong log Actions:
//   - CONTROL challenge/info phải PASS (chứng tỏ mạng + TikWM vẫn sống trên máy Actions).
//   - user/info PASS nghĩa là kéo được số kênh (follower, tổng tim, số video...) bằng handle.
//   - feed/search PASS nghĩa là kéo được danh sách video + tương tác từng video để cộng dồn mẫu.
//   - BLOCKED nghĩa là endpoint đó vẫn bị Cloudflare chặn trên máy Actions — kết luận là đường
//     TikWM này chết, phải chuyển sang hướng khác (kênh chính thức qua trang TikTok, hoặc API
//     chính thức), không phải do handle sai.
// Script LUÔN exit 0 kể cả khi bị chặn, vì "bị chặn" là kết quả test hợp lệ, không phải lỗi
// script — để workflow hiện xanh và đọc được bảng tóm tắt ở cuối log, thay vì đỏ vì fail.
//
// Handle đã xác minh trước khi test (26/10/2026):
//   - Anua: Instagram + TikTok đều là @anua_global (thông cáo báo chí chính thức của Anua).
//   - Medicube: TikTok là @medicube_official (trang TikTok chính thức, 867,6k follower / 8,3m tim
//     ở lần crawl gần nhất); Instagram là @medicube_global_official, KHÔNG phải @medicube_official.
// Chạy tay: node src/jobs/testTikTok.js (từ thư mục server), hoặc qua workflow test-tiktok.yml.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function probe(label, url) {
  console.log(`\n=== ${label} ===`);
  console.log(`URL: ${url}`);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    console.log(`HTTP: ${res.status}, độ dài body: ${text.length} ký tự`);
    if (text.includes("Just a moment") || !text.trim().startsWith("{")) {
      console.log(`KẾT QUẢ: BLOCKED — TikWM trả HTML Cloudflare thay vì JSON.`);
      return { label, result: "BLOCKED" };
    }
    const json = JSON.parse(text);
    console.log(`KẾT QUẢ: PASS — JSON code=${json.code}, msg=${json.msg ?? ""}`);
    console.log(`Các trường cấp data: ${json.data ? Object.keys(json.data).join(", ") : "(không có data)"}`);
    // In chi tiết có ích tùy loại endpoint, không đoán trước tên trường — in những gì có thật.
    if (json.data) {
      const d = json.data;
      if (d.view_count != null || d.user_count != null) {
        console.log(`  hashtag: view_count=${d.view_count}, user_count=${d.user_count}`);
      }
      if (d.stats) console.log(`  stats: ${JSON.stringify(d.stats).slice(0, 500)}`);
      if (d.user) console.log(`  user: ${JSON.stringify(d.user).slice(0, 500)}`);
      if (Array.isArray(d.videos)) {
        console.log(`  số video trả về: ${d.videos.length}`);
        if (d.videos[0]) console.log(`  video đầu tiên: ${JSON.stringify(d.videos[0]).slice(0, 800)}`);
      }
      if (Array.isArray(d)) {
        console.log(`  số video trả về (mảng trực tiếp): ${d.length}`);
        if (d[0]) console.log(`  video đầu tiên: ${JSON.stringify(d[0]).slice(0, 800)}`);
      }
    }
    return { label, result: "PASS" };
  } catch (err) {
    console.log(`KẾT QUẢ: ERROR — ${String(err.message).slice(0, 300)}`);
    return { label, result: "ERROR" };
  }
}

async function main() {
  console.log("Bắt đầu test TikWM — chỉ đọc, không ghi DB, không cần secret.");
  const results = [];
  // 1. Đối chứng: endpoint này đã chạy được từ VM, nên trên Actions nó phải PASS. Nếu nó cũng
  // FAIL thì vấn đề là mạng/TikWM chết chung, không phải riêng 2 endpoint cần test.
  results.push(
    await probe("CONTROL challenge/info hashtag anua", "https://www.tikwm.com/api/challenge/info?challenge_name=anua")
  );
  // 2. Số kênh theo handle đã xác minh.
  results.push(
    await probe("user/info @anua_global", "https://www.tikwm.com/api/user/info?unique_id=anua_global")
  );
  results.push(
    await probe(
      "user/info @medicube_official",
      "https://www.tikwm.com/api/user/info?unique_id=medicube_official"
    )
  );
  // 3. Danh sách video theo từ khóa brand (mẫu để cộng dồn tương tác).
  results.push(
    await probe("feed/search từ khóa anua (5 video)", "https://www.tikwm.com/api/feed/search?keywords=anua&count=5")
  );
  results.push(
    await probe(
      "feed/search từ khóa medicube (5 video)",
      "https://www.tikwm.com/api/feed/search?keywords=medicube&count=5"
    )
  );

  console.log("\n========== TÓM TẮT ==========");
  for (const r of results) console.log(`${r.result} — ${r.label}`);
  console.log("========== HẾT ==========");
  console.log("Gửi toàn bộ log này (hoặc ảnh chụp bảng TÓM TẮT) cho Muse để kết luận.");
  // Luôn exit 0: BLOCKED là kết quả test hợp lệ, không phải lỗi script.
}

main();
