import { useEffect, useState, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

export default function Home() {
  const [ads, setAds] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAds = useCallback(async () => {
    if (!API_BASE) {
      setError("Chưa cấu hình NEXT_PUBLIC_API_BASE — xem web/.env.example");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set("keyword", keyword);
      if (activeOnly) params.set("active_only", "true");
      params.set("limit", "50");

      const res = await fetch(`${API_BASE}/api/ads?${params.toString()}`);
      if (!res.ok) throw new Error(`API trả về lỗi ${res.status}`);
      const body = await res.json();
      setAds(body.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [keyword, activeOnly]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>MX Ad Spy — theo dõi quảng cáo Mexico</h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
        Dữ liệu creative + độ bền chạy từ Meta Ad Library. Like/comment/share/view là best-effort,
        không phải mọi quảng cáo đều có (xem README).
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <input
          placeholder="Lọc theo từ khóa/ngành..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, flex: 1 }}
        />
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Chỉ đang chạy
        </label>
        <button onClick={fetchAds} style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer" }}>
          Làm mới
        </button>
      </div>

      {loading && <p>Đang tải...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #eee" }}>
            <th style={{ padding: 8 }}>Page</th>
            <th style={{ padding: 8 }}>Từ khóa</th>
            <th style={{ padding: 8 }}>Nội dung</th>
            <th style={{ padding: 8 }}>Ngày chạy</th>
            <th style={{ padding: 8 }}>Trạng thái</th>
            <th style={{ padding: 8 }}>Like / Cmt / Share / View</th>
            <th style={{ padding: 8 }}>Link gốc</th>
          </tr>
        </thead>
        <tbody>
          {ads.map((ad) => (
            <tr key={ad.ad_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: 8 }}>{ad.page_name}</td>
              <td style={{ padding: 8 }}>{ad.keyword}</td>
              <td style={{ padding: 8, maxWidth: 280 }}>
                {(ad.creative_text || "").slice(0, 120) || <em style={{ color: "#999" }}>(không có text)</em>}
              </td>
              <td style={{ padding: 8 }}>{ad.days_active ?? "-"} ngày</td>
              <td style={{ padding: 8 }}>{ad.is_active ? "Đang chạy" : "Đã dừng"}</td>
              <td style={{ padding: 8 }}>
                {ad.engagement_parse_ok
                  ? `${ad.likes_count ?? "-"} / ${ad.comments_count ?? "-"} / ${ad.shares_count ?? "-"} / ${ad.video_views ?? "-"}`
                  : <span style={{ color: "#999" }}>không có</span>}
              </td>
              <td style={{ padding: 8 }}>
                <a href={ad.snapshot_url} target="_blank" rel="noreferrer">
                  Xem
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!loading && ads.length === 0 && !error && <p style={{ color: "#999" }}>Chưa có dữ liệu.</p>}
    </main>
  );
}
