import { useEffect, useState, useCallback, useMemo, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
const PAGE_SIZE = 60;

// 5 từ khóa ngành hàng chung (không phải tên thương hiệu cụ thể) — dùng để tách 2 nhóm trong
// sidebar "Ngành hàng" / "Thương hiệu", giúp research theo brand nhanh hơn (yêu cầu của user).
const INDUSTRY_TERMS = new Set(["maquillaje", "cosméticos", "cuidado de la piel", "skincare", "belleza"]);

// Bảng màu gradient cố định (không random mỗi lần render) để card của cùng 1 brand luôn cùng màu —
// giúp mắt nhận diện nhanh brand quen thuộc khi lướt qua nhiều card, giống cách PipiAds tô màu
// theo advertiser.
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

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function avatarGradient(name) {
  const [from, to] = AVATAR_GRADIENTS[hashString(name || "?") % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatRelativeDate(iso) {
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
function enduranceTier(days) {
  if (days == null) return { label: null, tone: "muted" };
  if (days >= 180) return { label: "🔥 Bền lâu", tone: "hot" };
  if (days >= 60) return { label: "Đang ổn định", tone: "good" };
  if (days >= 14) return { label: "Mới ổn định", tone: "ok" };
  return { label: "Mới xuất hiện", tone: "new" };
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function Home() {
  const [ads, setAds] = useState([]);
  const [keywordStats, setKeywordStats] = useState([]);
  const [selectedKeyword, setSelectedKeyword] = useState(null); // null = tất cả
  const [statusFilter, setStatusFilter] = useState("active"); // active | all
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [sortMode, setSortMode] = useState("endurance"); // endurance | newest

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const offsetRef = useRef(0);

  const fetchKeywordStats = useCallback(async () => {
    if (!API_BASE) return;
    try {
      const res = await fetch(`${API_BASE}/api/keywords`);
      if (!res.ok) return;
      const body = await res.json();
      setKeywordStats(body.data || []);
    } catch {
      /* stats sidebar không critical — im lặng bỏ qua, bảng chính vẫn hoạt động */
    }
  }, []);

  const fetchAds = useCallback(
    async (offset) => {
      if (!API_BASE) {
        setError("Chưa cấu hình NEXT_PUBLIC_API_BASE — xem web/.env.example");
        return;
      }
      const isFirstPage = offset === 0;
      isFirstPage ? setLoading(true) : setLoadingMore(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (selectedKeyword) params.set("keyword", selectedKeyword);
        if (debouncedSearch) params.set("page_name", debouncedSearch);
        if (statusFilter === "active") params.set("active_only", "true");
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));

        const res = await fetch(`${API_BASE}/api/ads?${params.toString()}`);
        if (!res.ok) throw new Error(`API trả về lỗi ${res.status}`);
        const body = await res.json();
        const rows = body.data || [];
        setAds((prev) => (isFirstPage ? rows : [...prev, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
        offsetRef.current = offset + rows.length;
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedKeyword, debouncedSearch, statusFilter]
  );

  useEffect(() => {
    fetchKeywordStats();
  }, [fetchKeywordStats]);

  useEffect(() => {
    offsetRef.current = 0;
    fetchAds(0);
  }, [fetchAds]);

  const refreshAll = () => {
    fetchKeywordStats();
    offsetRef.current = 0;
    fetchAds(0);
  };

  const sortedAds = useMemo(() => {
    const copy = [...ads];
    if (sortMode === "newest") {
      copy.sort((a, b) => new Date(b.first_seen_at || 0) - new Date(a.first_seen_at || 0));
    } else {
      copy.sort((a, b) => (b.days_active ?? -1) - (a.days_active ?? -1));
    }
    return copy;
  }, [ads, sortMode]);

  const totals = useMemo(() => {
    const totalAds = keywordStats.reduce((sum, k) => sum + Number(k.total || 0), 0);
    const totalActive = keywordStats.reduce((sum, k) => sum + Number(k.active || 0), 0);
    const brandCount = keywordStats.filter((k) => !INDUSTRY_TERMS.has(k.keyword)).length;
    return { totalAds, totalActive, brandCount };
  }, [keywordStats]);

  const lastUpdated = useMemo(() => {
    let max = null;
    for (const ad of ads) {
      if (ad.last_seen_at && (!max || ad.last_seen_at > max)) max = ad.last_seen_at;
    }
    return formatRelativeDate(max);
  }, [ads]);

  const industryItems = keywordStats.filter((k) => INDUSTRY_TERMS.has(k.keyword));
  const brandItems = keywordStats.filter((k) => !INDUSTRY_TERMS.has(k.keyword));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">MX</span>
          <div>
            <h1>Ad Spy</h1>
            <p>Theo dõi quảng cáo mỹ phẩm đối thủ tại Mexico</p>
          </div>
        </div>

        <div className="search-wrap">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Tìm theo tên Page / thương hiệu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button className="btn-refresh" onClick={refreshAll} disabled={loading}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0014.9 2.5M19.5 9A8 8 0 004.6 6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="btn-label">Làm mới</span>
        </button>

        <button className="btn-mobile-filter" onClick={() => setSidebarOpen((v) => !v)}>
          Bộ lọc
        </button>
      </header>

      <div className="layout">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-section">
            <div className="sidebar-title">Trạng thái</div>
            <div className="pill-toggle">
              <button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>
                Đang chạy
              </button>
              <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>
                Tất cả
              </button>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-title">Sắp xếp</div>
            <div className="pill-toggle">
              <button className={sortMode === "endurance" ? "active" : ""} onClick={() => setSortMode("endurance")}>
                Chạy lâu nhất
              </button>
              <button className={sortMode === "newest" ? "active" : ""} onClick={() => setSortMode("newest")}>
                Mới phát hiện
              </button>
            </div>
          </div>

          <div className="sidebar-section scroll">
            <div className="sidebar-title">
              Ngành hàng
              <span className="count-chip">{industryItems.length}</span>
            </div>
            <button
              className={`kw-row ${selectedKeyword === null ? "active" : ""}`}
              onClick={() => setSelectedKeyword(null)}
            >
              <span>Tất cả</span>
              <span className="kw-count">{totals.totalAds}</span>
            </button>
            {industryItems.map((k) => (
              <button
                key={k.keyword}
                className={`kw-row ${selectedKeyword === k.keyword ? "active" : ""}`}
                onClick={() => setSelectedKeyword(k.keyword)}
              >
                <span>{k.keyword}</span>
                <span className="kw-count">
                  {k.total}
                  {Number(k.active) > 0 && <i className="dot" />}
                </span>
              </button>
            ))}

            <div className="sidebar-title" style={{ marginTop: 18 }}>
              Thương hiệu
              <span className="count-chip">{brandItems.length}</span>
            </div>
            {brandItems.map((k) => (
              <button
                key={k.keyword}
                className={`kw-row ${selectedKeyword === k.keyword ? "active" : ""}`}
                onClick={() => setSelectedKeyword(k.keyword)}
              >
                <span
                  className="brand-dot"
                  style={{ background: avatarGradient(k.keyword) }}
                />
                <span className="kw-label">{k.keyword}</span>
                <span className="kw-count">
                  {k.total}
                  {Number(k.active) > 0 && <i className="dot" />}
                </span>
              </button>
            ))}
            {brandItems.length === 0 && industryItems.length === 0 && (
              <p className="muted small">Chưa có dữ liệu — job fetch chưa chạy lần nào.</p>
            )}
          </div>
        </aside>

        <main className="content">
          <div className="stat-row">
            <div className="stat-card">
              <span className="stat-value">{totals.totalAds}</span>
              <span className="stat-label">Tổng ad đã ghi nhận</span>
            </div>
            <div className="stat-card accent-good">
              <span className="stat-value">{totals.totalActive}</span>
              <span className="stat-label">Đang chạy</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{totals.brandCount}</span>
              <span className="stat-label">Thương hiệu theo dõi</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{lastUpdated || "—"}</span>
              <span className="stat-label">Cập nhật gần nhất</span>
            </div>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {loading && (
            <div className="grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div className="card skeleton" key={i} />
              ))}
            </div>
          )}

          {!loading && !error && sortedAds.length === 0 && (
            <div className="empty-state">
              <p>Không tìm thấy quảng cáo nào khớp bộ lọc hiện tại.</p>
              <p className="muted small">Thử bỏ bớt bộ lọc, hoặc đổi từ khóa/thương hiệu ở sidebar.</p>
            </div>
          )}

          {!loading && sortedAds.length > 0 && (
            <>
              <div className="grid">
                {sortedAds.map((ad) => {
                  const tier = enduranceTier(ad.days_active);
                  const hasEngagement =
                    ad.engagement_parse_ok &&
                    (ad.likes_count != null || ad.comments_count != null || ad.shares_count != null || ad.video_views != null);
                  return (
                    <article className="card" key={ad.ad_id}>
                      <div className="card-banner" style={{ background: avatarGradient(ad.page_name) }}>
                        <span className="card-initials">{initials(ad.page_name)}</span>
                        <span className={`status-pill ${ad.is_active ? "is-live" : "is-off"}`}>
                          {ad.is_active ? "● Đang chạy" : "Đã dừng"}
                        </span>
                        {tier.label && <span className={`tier-pill tone-${tier.tone}`}>{tier.label}</span>}
                      </div>

                      <div className="card-body">
                        <div className="card-head">
                          <h3 title={ad.page_name}>{ad.page_name}</h3>
                          <span className="days-count">
                            {ad.days_active ?? "?"}
                            <small>ngày</small>
                          </span>
                        </div>
                        <span className="keyword-tag">{ad.keyword}</span>
                        <p className="creative-text">
                          {ad.creative_text || <em className="muted">(không có nội dung text)</em>}
                        </p>
                      </div>

                      <div className="card-footer">
                        <div className="engagement">
                          {hasEngagement ? (
                            <>
                              <span title="Lượt thích">❤ {ad.likes_count ?? "-"}</span>
                              <span title="Bình luận">💬 {ad.comments_count ?? "-"}</span>
                              <span title="Chia sẻ">↗ {ad.shares_count ?? "-"}</span>
                              <span title="Lượt xem">▶ {ad.video_views ?? "-"}</span>
                            </>
                          ) : (
                            <span className="muted small">Không có số liệu tương tác công khai</span>
                          )}
                        </div>
                        <a href={ad.snapshot_url} target="_blank" rel="noreferrer" className="btn-view">
                          Xem gốc ↗
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>

              {hasMore && (
                <div className="load-more-wrap">
                  <button className="btn-load-more" onClick={() => fetchAds(offsetRef.current)} disabled={loadingMore}>
                    {loadingMore ? "Đang tải..." : "Tải thêm"}
                  </button>
                </div>
              )}
            </>
          )}

          <p className="footnote muted small">
            Dữ liệu creative + độ bền chạy từ Meta Ad Library (scrape trang công khai). Like/comment/share/view là
            best-effort, không phải mọi quảng cáo đều có — xem README của dự án để biết chi tiết giới hạn dữ liệu.
          </p>
        </main>
      </div>

      <style jsx>{`
        :root {
          color-scheme: light;
        }
        .app {
          min-height: 100vh;
          background: #f4f5fb;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1c1d2b;
        }

        .topbar {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 14px 24px;
          background: #14152b;
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          white-space: nowrap;
        }
        .brand-mark {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6c5ce7, #a29bfe);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 13px;
          color: #fff;
          flex-shrink: 0;
        }
        .brand h1 {
          font-size: 16px;
          margin: 0;
          color: #fff;
          line-height: 1.2;
        }
        .brand p {
          font-size: 11.5px;
          margin: 0;
          color: #9799b8;
        }

        .search-wrap {
          flex: 1;
          max-width: 480px;
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-icon {
          position: absolute;
          left: 12px;
          color: #8a8cae;
          pointer-events: none;
        }
        .search-wrap input {
          width: 100%;
          padding: 9px 12px 9px 36px;
          border-radius: 9px;
          border: 1px solid #2b2c47;
          background: #1e1f3a;
          color: #fff;
          font-size: 13.5px;
          outline: none;
        }
        .search-wrap input::placeholder {
          color: #797ba3;
        }
        .search-wrap input:focus {
          border-color: #6c5ce7;
        }

        .btn-refresh {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #6c5ce7;
          color: #fff;
          border: none;
          padding: 9px 14px;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .btn-refresh:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .btn-refresh:hover:not(:disabled) {
          background: #5b4bd6;
        }

        .btn-mobile-filter {
          display: none;
          background: #1e1f3a;
          color: #fff;
          border: 1px solid #2b2c47;
          padding: 9px 14px;
          border-radius: 9px;
          font-size: 13px;
          cursor: pointer;
        }

        .layout {
          display: grid;
          grid-template-columns: 250px 1fr;
          align-items: start;
        }

        .sidebar {
          position: sticky;
          top: 61px;
          height: calc(100vh - 61px);
          overflow: hidden;
          background: #181a30;
          padding: 18px 14px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .sidebar-section.scroll {
          overflow-y: auto;
          flex: 1;
        }
        .sidebar-title {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #82849f;
          font-weight: 700;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .count-chip {
          background: #2b2c47;
          color: #b6b8d6;
          border-radius: 20px;
          padding: 1px 7px;
          font-size: 10px;
          font-weight: 600;
        }

        .pill-toggle {
          display: flex;
          background: #23244a;
          border-radius: 9px;
          padding: 3px;
          gap: 3px;
        }
        .pill-toggle button {
          flex: 1;
          border: none;
          background: transparent;
          color: #9799b8;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 6px;
          border-radius: 7px;
          cursor: pointer;
        }
        .pill-toggle button.active {
          background: #6c5ce7;
          color: #fff;
        }

        .kw-row {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: #c6c7e0;
          font-size: 13px;
          padding: 7px 8px;
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
        }
        .kw-row:hover {
          background: #23244a;
        }
        .kw-row.active {
          background: #2b2c5c;
          color: #fff;
          font-weight: 600;
        }
        .kw-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .kw-row span:first-child:not(.brand-dot) {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .brand-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .kw-count {
          font-size: 11px;
          color: #82849f;
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .kw-count .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #00d68f;
          display: inline-block;
        }

        .content {
          padding: 20px 24px 48px;
          max-width: 1400px;
        }

        .stat-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(140px, 1fr));
          gap: 14px;
          margin-bottom: 20px;
        }
        .stat-card {
          background: #fff;
          border-radius: 12px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          border: 1px solid #ebecf5;
        }
        .stat-value {
          font-size: 22px;
          font-weight: 800;
          color: #1c1d2b;
        }
        .accent-good .stat-value {
          color: #00b894;
        }
        .stat-label {
          font-size: 12px;
          color: #8a8cae;
        }

        .error-banner {
          background: #fdecea;
          color: #c0392b;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 16px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 16px;
        }

        .card {
          background: #fff;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid #ebecf5;
          display: flex;
          flex-direction: column;
          transition: box-shadow 0.15s ease, transform 0.15s ease;
        }
        .card:hover {
          box-shadow: 0 8px 24px rgba(20, 21, 43, 0.1);
          transform: translateY(-2px);
        }
        .card.skeleton {
          height: 280px;
          background: linear-gradient(100deg, #eef0f7 30%, #f7f8fc 50%, #eef0f7 70%);
          background-size: 200% 100%;
          animation: shimmer 1.3s infinite;
          border: none;
        }
        @keyframes shimmer {
          from {
            background-position: 200% 0;
          }
          to {
            background-position: -200% 0;
          }
        }

        .card-banner {
          position: relative;
          height: 78px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card-initials {
          color: #fff;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0.02em;
          opacity: 0.95;
        }
        .status-pill {
          position: absolute;
          top: 8px;
          left: 8px;
          font-size: 10.5px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 20px;
          background: rgba(0, 0, 0, 0.28);
          color: #fff;
          backdrop-filter: blur(2px);
        }
        .status-pill.is-live {
          background: rgba(0, 184, 148, 0.9);
        }
        .status-pill.is-off {
          background: rgba(45, 52, 54, 0.55);
        }
        .tier-pill {
          position: absolute;
          top: 8px;
          right: 8px;
          font-size: 10.5px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 20px;
          color: #fff;
          background: rgba(0, 0, 0, 0.28);
        }
        .tier-pill.tone-hot {
          background: #e17055;
        }
        .tier-pill.tone-good {
          background: rgba(9, 132, 227, 0.9);
        }

        .card-body {
          padding: 12px 14px 6px;
          flex: 1;
        }
        .card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .card-head h3 {
          font-size: 14px;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 170px;
        }
        .days-count {
          font-size: 15px;
          font-weight: 800;
          color: #14152b;
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1;
          flex-shrink: 0;
        }
        .days-count small {
          font-size: 9px;
          font-weight: 600;
          color: #8a8cae;
          text-transform: uppercase;
        }

        .keyword-tag {
          display: inline-block;
          margin-top: 6px;
          font-size: 10.5px;
          font-weight: 700;
          color: #6c5ce7;
          background: #f1effd;
          padding: 2px 8px;
          border-radius: 20px;
        }

        .creative-text {
          font-size: 12.5px;
          color: #4c4e63;
          margin: 8px 0 0;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.45;
          min-height: 68px;
        }

        .card-footer {
          padding: 10px 14px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          border-top: 1px solid #f1f2f8;
          margin-top: 8px;
        }
        .engagement {
          display: flex;
          gap: 8px;
          font-size: 11px;
          color: #6b6d87;
          flex-wrap: wrap;
        }
        .btn-view {
          font-size: 11.5px;
          font-weight: 700;
          color: #fff;
          background: #14152b;
          padding: 6px 10px;
          border-radius: 8px;
          text-decoration: none;
          white-space: nowrap;
        }
        .btn-view:hover {
          background: #2b2c5c;
        }

        .load-more-wrap {
          display: flex;
          justify-content: center;
          margin-top: 24px;
        }
        .btn-load-more {
          background: #fff;
          border: 1px solid #d9dbe9;
          padding: 10px 22px;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-load-more:hover {
          border-color: #6c5ce7;
          color: #6c5ce7;
        }
        .btn-load-more:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .empty-state {
          background: #fff;
          border: 1px dashed #d9dbe9;
          border-radius: 12px;
          padding: 48px 20px;
          text-align: center;
        }

        .footnote {
          margin-top: 32px;
          line-height: 1.5;
        }
        .muted {
          color: #9799b8;
        }
        .small {
          font-size: 11.5px;
        }

        @media (max-width: 900px) {
          .layout {
            grid-template-columns: 1fr;
          }
          .btn-mobile-filter {
            display: block;
          }
          .brand p {
            display: none;
          }
          .topbar {
            flex-wrap: wrap;
            row-gap: 10px;
            padding: 12px 16px;
          }
          .search-wrap {
            order: 3;
            flex-basis: 100%;
            max-width: none;
          }
          .btn-label {
            display: none;
          }
          .btn-refresh {
            padding: 9px 11px;
          }
          .sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 78vw;
            max-width: 300px;
            height: 100vh;
            z-index: 30;
            box-shadow: 12px 0 40px rgba(0, 0, 0, 0.3);
            transform: translateX(-100%);
            transition: transform 0.2s ease;
          }
          .sidebar.open {
            transform: translateX(0);
          }
          .content {
            padding: 16px;
          }
          .stat-row {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
