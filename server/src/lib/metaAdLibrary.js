// Client gọi Meta Ad Library API (Graph API endpoint /ads_archive).
//
// QUAN TRỌNG — đọc trước khi sửa fields bên dưới:
// Với quảng cáo THƯƠNG MẠI thông thường (không phải chính trị/xã hội), Meta chỉ trả về
// creative + thời gian chạy + page + platform. KHÔNG có spend, impressions, reach, CTR
// dưới bất kỳ hình thức nào qua API này — đây là giới hạn chính sách của Meta, không phải
// giới hạn code. Đừng thêm các field 'spend'/'impressions' vào đây và mong có dữ liệu thật,
// API sẽ trả lỗi hoặc trả rỗng vì ad không thuộc diện chính trị/xã hội.

const GRAPH_VERSION = "v20.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}/ads_archive`;

const FIELDS = [
  "id",
  "ad_creation_time",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_snapshot_url",
  "page_id",
  "page_name",
  "publisher_platforms",
  "languages",
].join(",");

const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gọi 1 trang kết quả, có retry với backoff khi gặp lỗi rate limit (code 4, 17, 32, hoặc HTTP 429).
 * Ném lỗi rõ ràng (không nuốt im lặng) sau khi hết số lần retry — để job phía trên quyết định
 * bỏ qua keyword này và log vào fetch_runs, thay vì crash toàn bộ tiến trình.
 */
async function fetchPage(url, attempt = 1) {
  const res = await fetch(url);
  const body = await res.json();

  if (!res.ok || body.error) {
    const code = body?.error?.code;
    const isRateLimited = res.status === 429 || code === 4 || code === 17 || code === 32;

    if (isRateLimited && attempt <= MAX_RETRIES) {
      const backoffMs = attempt * 5000; // 5s, 10s, 15s
      console.warn(
        `[metaAdLibrary] Rate limited (attempt ${attempt}/${MAX_RETRIES}), chờ ${backoffMs}ms...`
      );
      await sleep(backoffMs);
      return fetchPage(url, attempt + 1);
    }

    throw new Error(
      `Meta Ad Library API lỗi: ${body?.error?.message || res.statusText} (code=${code}, http=${res.status})`
    );
  }

  return body;
}

/**
 * Tìm quảng cáo theo từ khóa tại một quốc gia, tự động phân trang.
 * @param {string} keyword
 * @param {object} opts
 * @param {string} opts.accessToken
 * @param {string} [opts.country='MX']
 * @param {number} [opts.maxPages=5]
 * @returns {Promise<Array>} danh sách ad thô từ API
 */
export async function searchAds(keyword, { accessToken, country = "MX", maxPages = 5 }) {
  if (!accessToken) {
    throw new Error("Thiếu META_ACCESS_TOKEN — không thể gọi Meta Ad Library API.");
  }

  const results = [];
  let after = null;
  let page = 0;

  while (page < maxPages) {
    const params = new URLSearchParams({
      search_terms: keyword,
      ad_type: "ALL",
      ad_reached_countries: JSON.stringify([country]),
      ad_active_status: "ALL", // lấy cả active lẫn đã dừng, để tính days_active chính xác
      fields: FIELDS,
      limit: "100",
      access_token: accessToken,
    });
    if (after) params.set("after", after);

    const body = await fetchPage(`${BASE_URL}?${params.toString()}`);
    const data = body.data || [];
    results.push(...data);

    after = body.paging?.cursors?.after;
    page += 1;

    if (!after || data.length === 0) break;

    // Nghỉ nhẹ giữa các trang — hạ tần suất gọi để tránh chạm rate limit không cần thiết.
    await sleep(500);
  }

  return results;
}
