import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { MARKET_LABELS, MARKET_CODES, avatarGradient, initials, facebookUrlFor, useDebouncedValue } from "../lib/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
const TABLE_PAGE = 25;

function LineChart({ points, width = 760, height = 180 }) {
  // points: [{day, value}] đã sort theo ngày tăng dần. Vẽ area chart SVG tay, không dùng lib
  // ngoài — dữ liệu nhỏ (tối đa 30 điểm), không cần thư viện chart nặng.
  if (!points || points.length === 0) {
    return <p className="chart-empty">Chưa có dữ liệu xu hướng — cần chạy job fetch thêm vài ngày.</p>;
  }
  const padding = { top: 14, right: 14, bottom: 26, left: 32 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxVal = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + innerH - (p.value / maxVal) * innerH,
    ...p,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${padding.top + innerH} L${coords[0].x.toFixed(1)},${
    padding.top + innerH
  } Z`;

  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6c5ce7" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#6c5ce7" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + innerH * t}
          y2={padding.top + innerH * t}
          stroke="#eef0f7"
          strokeWidth="1"
        />
      ))}
      <path d={areaPath} fill="url(#areaFill)" />
      <path d={linePath} fill="none" stroke="#6c5ce7" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="2.6" fill="#6c5ce7" />
      ))}
      {coords.map((c, i) =>
        i % labelEvery === 0 ? (
          <text key={i} x={c.x} y={height - 8} fontSize="9.5" fill="#9799b8" textAnchor="middle">
            {c.day.slice(5)}
          </text>
        ) : null
      )}
      <text x={padding.left} y={padding.top - 4} fontSize="9.5" fill="#9799b8">
        {maxVal} ad
      </text>
    </svg>
  );
}

function BarList({ rows, valueKey, max }) {
  const maxVal = max || Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div className="bar-row" key={r.page_name}>
          <span className="bar-dot" style={{ background: avatarGradient(r.page_name) }} />
          <span className="bar-label" title={r.page_name}>
            {r.page_name}
          </span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(4, (Number(r[valueKey]) / maxVal) * 100)}%` }} />
          </div>
          <span className="bar-value">{r[valueKey]}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="chart-empty">Chưa có dữ liệu.</p>}
    </div>
  );
}

export default function BrandsDashboard() {
  const [brandStats, setBrandStats] = useState([]);
  const [keywordStats, setKeywordStats] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [tableSearch, setTableSearch] = useState("");
  const debouncedTableSearch = useDebouncedValue(tableSearch, 300);
  const [tableSort, setTableSort] = useState("total"); // total | active | endurance
  const [visibleCount, setVisibleCount] = useState(TABLE_PAGE);
  const [countryFilter, setCountryFilter] = useState("MX"); // mặc định thị trường gốc; "" = gộp tất cả

  useEffect(() => {
    if (!API_BASE) {
      setError("Chưa cấu hình NEXT_PUBLIC_API_BASE — xem web/.env.example");
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const suffix = countryFilter ? `?country=${encodeURIComponent(countryFilter)}` : "";
        const [brandsRes, kwRes, trendRes] = await Promise.all([
          fetch(`${API_BASE}/api/brands${suffix}`),
          fetch(`${API_BASE}/api/keywords${suffix}`),
          fetch(`${API_BASE}/api/trend${suffix}`),
        ]);
        if (!brandsRes.ok || !kwRes.ok || !trendRes.ok) throw new Error("API trả về lỗi khi tải dashboard");
        setBrandStats((await brandsRes.json()).data || []);
        setKeywordStats((await kwRes.json()).data || []);
        setTrend((await trendRes.json()).data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [countryFilter]);

  const totals = useMemo(() => {
    const totalAds = brandStats.reduce((s, b) => s + Number(b.total || 0), 0);
    const totalActive = brandStats.reduce((s, b) => s + Number(b.active || 0), 0);
    const longest = brandStats.reduce((m, b) => Math.max(m, Number(b.max_days_active) || 0), 0);
    return { totalBrands: brandStats.length, totalAds, totalActive, longest };
  }, [brandStats]);

  const trendPoints = useMemo(
    () => trend.map((t) => ({ day: t.day, value: Number(t.ads_discovered) })),
    [trend]
  );

  const industryBreakdown = useMemo(
    () => keywordStats.filter((k) => k.type === "industry").sort((a, b) => Number(b.total) - Number(a.total)),
    [keywordStats]
  );

  const topActiveBrands = useMemo(
    () => [...brandStats].sort((a, b) => Number(b.active) - Number(a.active)).slice(0, 10),
    [brandStats]
  );

  const filteredTable = useMemo(() => {
    let rows = brandStats;
    const text = debouncedTableSearch.trim().toLowerCase();
    if (text) rows = rows.filter((b) => b.page_name.toLowerCase().includes(text));
    const sorted = [...rows].sort((a, b) => {
      if (tableSort === "active") return Number(b.active) - Number(a.active);
      if (tableSort === "endurance") return Number(b.max_days_active || 0) - Number(a.max_days_active || 0);
      return Number(b.total) - Number(a.total);
    });
    return sorted;
  }, [brandStats, debouncedTableSearch, tableSort]);

  return (
    <Layout active="brands">
      <main className="content">
        <div className="page-head">
          <div className="page-head-row">
            <div>
              <h2>Dashboard Brand — {countryFilter ? MARKET_LABELS[countryFilter] || countryFilter : "Tất cả thị trường"}</h2>
              <p className="muted">
                Số liệu THẬT từ dữ liệu đã cào được (không có CTR/CVR/CPA hay lượt tìm kiếm — Meta Ad Library công khai
                không cung cấp các số này, xem README).
              </p>
            </div>
            <div className="market-toggle">
              <button className={countryFilter === "" ? "active" : ""} onClick={() => setCountryFilter("")}>
                Tất cả
              </button>
              {MARKET_CODES.map((code) => (
                <button key={code} className={countryFilter === code ? "active" : ""} onClick={() => setCountryFilter(code)}>
                  {MARKET_LABELS[code]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <p className="muted">Đang tải...</p>
        ) : (
          <>
            <div className="stat-row">
              <div className="stat-card">
                <span className="stat-value">{totals.totalBrands}</span>
                <span className="stat-label">Thương hiệu đã phát hiện</span>
              </div>
              <div className="stat-card accent-good">
                <span className="stat-value">{totals.totalActive}</span>
                <span className="stat-label">Ad đang chạy</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{totals.totalAds}</span>
                <span className="stat-label">Tổng ad đã ghi nhận</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{totals.longest}</span>
                <span className="stat-label">Ngày chạy dài nhất</span>
              </div>
            </div>

            <div className="panel">
              <h3>Ad mới phát hiện theo ngày — 30 ngày qua</h3>
              <p className="panel-sub">
                Đây là ngày công cụ NHÌN THẤY ad lần đầu (không phải ngày Facebook thật sự bắt đầu chạy ad) — phản ánh
                nhịp độ phát hiện của chính pipeline, không phải xu hướng chi tiêu thị trường thật.
              </p>
              <LineChart points={trendPoints} />
            </div>

            <div className="panel-grid">
              <div className="panel">
                <h3>Top 10 thương hiệu — nhiều ad đang chạy nhất</h3>
                <BarList rows={topActiveBrands} valueKey="active" />
              </div>
              <div className="panel">
                <h3>Phân bổ theo ngành hàng</h3>
                <div className="bar-list">
                  {industryBreakdown.map((k) => {
                    const maxVal = Math.max(1, ...industryBreakdown.map((x) => Number(x.total)));
                    return (
                      <div className="bar-row" key={k.keyword}>
                        <span className="bar-label">{k.keyword}</span>
                        <div className="bar-track">
                          <div
                            className="bar-fill alt"
                            style={{ width: `${Math.max(4, (Number(k.total) / maxVal) * 100)}%` }}
                          />
                        </div>
                        <span className="bar-value">{k.total}</span>
                      </div>
                    );
                  })}
                  {industryBreakdown.length === 0 && <p className="chart-empty">Chưa có dữ liệu.</p>}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="table-head">
                <h3>Danh sách đối thủ ({filteredTable.length})</h3>
                <div className="table-controls">
                  <input
                    placeholder="Tìm tên thương hiệu..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                  />
                  <select value={tableSort} onChange={(e) => setTableSort(e.target.value)}>
                    <option value="total">Sắp xếp: Tổng ad</option>
                    <option value="active">Sắp xếp: Đang chạy nhiều nhất</option>
                    <option value="endurance">Sắp xếp: Chạy bền nhất</option>
                  </select>
                </div>
              </div>
              <p className="panel-sub">
                Ngành hàng gắn cứng theo cấu hình từ khóa/thương hiệu (server/src/config/keywords.js), không suy đoán
                bằng cách so chuỗi tên. Sản phẩm/website/TikTok chưa có nguồn dữ liệu tự động — có thể bổ sung thủ
                công sau.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Thương hiệu</th>
                      <th>Ngành hàng</th>
                      <th>Tổng ad</th>
                      <th>Đang chạy</th>
                      <th>Bền nhất</th>
                      <th>Facebook</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTable.slice(0, visibleCount).map((b) => {
                      const fbUrl = facebookUrlFor(b.page_id);
                      const industries = b.categories || [];
                      return (
                        <tr key={b.page_name}>
                          <td>
                            <div className="brand-cell">
                              <span className="mini-avatar" style={{ background: avatarGradient(b.page_name) }}>
                                {initials(b.page_name)}
                              </span>
                              {b.page_name}
                            </div>
                          </td>
                          <td>
                            {industries.length ? (
                              industries.map((k) => (
                                <span className="tag" key={k}>
                                  {k}
                                </span>
                              ))
                            ) : (
                              <span className="muted small">—</span>
                            )}
                          </td>
                          <td>{b.total}</td>
                          <td>{Number(b.active) > 0 ? <span className="active-badge">{b.active}</span> : "0"}</td>
                          <td>{b.max_days_active ?? "—"} ngày</td>
                          <td>
                            {fbUrl ? (
                              <a href={fbUrl} target="_blank" rel="noreferrer">
                                Xem ↗
                              </a>
                            ) : (
                              <span className="muted small">—</span>
                            )}
                          </td>
                          <td>
                            <Link href={`/?brand=${encodeURIComponent(b.page_name)}`} className="btn-view-ads">
                              Xem quảng cáo
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {visibleCount < filteredTable.length && (
                <div className="load-more-wrap">
                  <button className="btn-load-more" onClick={() => setVisibleCount((v) => v + TABLE_PAGE)}>
                    Xem thêm ({filteredTable.length - visibleCount} còn lại)
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* jsx global: LineChart/BarList là component con riêng (không phải JSX literal ngay trong
          BrandsDashboard) nên style scoped thường (style jsx) không áp dụng được vào bên trong
          chúng — phải để global mới style đúng .bar-row/.bar-track/.line-chart bên trong. */}
      <style jsx global>{`
        .content {
          padding: 20px 24px 48px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .page-head-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .page-head h2 {
          font-size: 19px;
          margin: 4px 0 2px;
        }
        .page-head p {
          font-size: 12.5px;
          margin: 0 0 18px;
        }
        .market-toggle {
          display: flex;
          flex-wrap: wrap;
          background: #f1f2f8;
          border-radius: 9px;
          padding: 3px;
          gap: 3px;
        }
        .market-toggle button {
          border: none;
          background: transparent;
          color: #6b6d87;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 12px;
          border-radius: 7px;
          cursor: pointer;
          white-space: nowrap;
        }
        .market-toggle button.active {
          background: #6c5ce7;
          color: #fff;
        }
        .muted {
          color: #9799b8;
        }
        .small {
          font-size: 11.5px;
        }

        .error-banner {
          background: #fdecea;
          color: #c0392b;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 16px;
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

        .panel {
          background: #fff;
          border: 1px solid #ebecf5;
          border-radius: 14px;
          padding: 18px 20px;
          margin-bottom: 18px;
        }
        .panel h3 {
          font-size: 14px;
          margin: 0 0 4px;
        }
        .panel-sub {
          font-size: 11.5px;
          color: #9799b8;
          margin: 0 0 12px;
          line-height: 1.5;
        }

        .panel-grid {
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 18px;
        }
        .panel-grid .panel {
          margin-bottom: 0;
        }

        .line-chart {
          width: 100%;
          height: 180px;
          display: block;
        }
        .chart-empty {
          font-size: 12.5px;
          color: #9799b8;
          padding: 20px 0;
          text-align: center;
        }

        .bar-list {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .bar-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .bar-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .bar-label {
          font-size: 12px;
          width: 120px;
          flex-shrink: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bar-track {
          flex: 1;
          height: 9px;
          background: #f1f2f8;
          border-radius: 6px;
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #6c5ce7, #a29bfe);
          border-radius: 6px;
        }
        .bar-fill.alt {
          background: linear-gradient(90deg, #00b894, #55efc4);
        }
        .bar-value {
          font-size: 11.5px;
          font-weight: 700;
          color: #4c4e63;
          width: 28px;
          text-align: right;
          flex-shrink: 0;
        }

        .table-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .table-head h3 {
          margin: 0;
        }
        .table-controls {
          display: flex;
          gap: 8px;
        }
        .table-controls input,
        .table-controls select {
          padding: 7px 10px;
          border-radius: 8px;
          border: 1px solid #dcdee8;
          font-size: 12.5px;
        }

        .table-wrap {
          overflow-x: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
          margin-top: 10px;
        }
        th {
          text-align: left;
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #9799b8;
          padding: 8px 10px;
          border-bottom: 1px solid #ebecf5;
          white-space: nowrap;
        }
        td {
          padding: 9px 10px;
          border-bottom: 1px solid #f4f5fa;
          white-space: nowrap;
        }
        tr:hover td {
          background: #fafafe;
        }
        .brand-cell {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
        }
        .mini-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 9px;
          font-weight: 800;
          flex-shrink: 0;
        }
        .tag {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          color: #6c5ce7;
          background: #f1effd;
          padding: 1px 7px;
          border-radius: 20px;
          margin: 0 3px 3px 0;
        }
        .active-badge {
          color: #00b894;
          font-weight: 700;
        }
        .btn-view-ads {
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          background: #14152b;
          padding: 5px 9px;
          border-radius: 7px;
          text-decoration: none;
          white-space: nowrap;
        }
        .btn-view-ads:hover {
          background: #2b2c5c;
        }

        .load-more-wrap {
          display: flex;
          justify-content: center;
          margin-top: 16px;
        }
        .btn-load-more {
          background: #fff;
          border: 1px solid #d9dbe9;
          padding: 9px 20px;
          border-radius: 9px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-load-more:hover {
          border-color: #6c5ce7;
          color: #6c5ce7;
        }

        @media (max-width: 900px) {
          .stat-row {
            grid-template-columns: repeat(2, 1fr);
          }
          .panel-grid {
            grid-template-columns: 1fr;
          }
          .content {
            padding: 16px;
          }
        }
      `}</style>
    </Layout>
  );
}
