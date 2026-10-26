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
  const [tableSort, setTableSort] = useState("total"); // total | active | endurance | engagement
  const [selectedBrand, setSelectedBrand] = useState(null); // page_name đang phân tích sâu
  const [brandTrend, setBrandTrend] = useState([]);
  const [brandTrendLoading, setBrandTrendLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(TABLE_PAGE);
  const [countryFilter, setCountryFilter] = useState("MX"); // mặc định thị trường gốc; "" = gộp MX+US (từ 26/10/2026, không còn gộp KR/TH/MY)

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
        // Gọi riêng từng thị trường rồi gộp ở client (lý do xem web/pages/index.js) — đúng cả
        // backend cũ lẫn mới, không bị trống dashboard trong lúc Render deploy bản mới.
        const countries = countryFilter ? [countryFilter] : ["MX", "US"];
        const cat = encodeURIComponent("Mỹ phẩm & Làm đẹp");
        const brandMap = new Map();
        const kwMap = new Map();
        const trendMap = new Map();
        for (const c of countries) {
          const suffix = `?country=${encodeURIComponent(c)}&category=${cat}`;
          const [brandsRes, kwRes, trendRes] = await Promise.all([
            fetch(`${API_BASE}/api/brands${suffix}`),
            fetch(`${API_BASE}/api/keywords${suffix}`),
            fetch(`${API_BASE}/api/trend${suffix}`),
          ]);
          if (!brandsRes.ok || !kwRes.ok || !trendRes.ok) throw new Error("API trả về lỗi khi tải dashboard");
          for (const b of (await brandsRes.json()).data || []) {
            const prev = brandMap.get(b.page_name);
            if (prev) {
              const prevTotal = Number(prev.total);
              const bTotal = Number(b.total);
              prev.total = String(prevTotal + bTotal);
              prev.active = String(Number(prev.active) + Number(b.active));
              prev.max_days_active = Math.max(Number(prev.max_days_active) || 0, Number(b.max_days_active) || 0);
              // Trung bình ngày chạy gộp = trung bình có trọng số theo tổng ad từng thị trường.
              prev.avg_days_active = Math.round(
                ((Number(prev.avg_days_active) || 0) * prevTotal + (Number(b.avg_days_active) || 0) * bTotal) /
                  Math.max(1, prevTotal + bTotal)
              );
              for (const k of ["total_likes", "total_comments", "total_shares", "total_video_views", "engagement_parsed"]) {
                prev[k] = String(Number(prev[k] || 0) + Number(b[k] || 0));
              }
              prev.categories = [...new Set([...(prev.categories || []), ...(b.categories || [])])];
            } else brandMap.set(b.page_name, { ...b });
          }
          for (const k of (await kwRes.json()).data || []) {
            const prev = kwMap.get(k.keyword);
            if (prev) {
              prev.total = String(Number(prev.total) + Number(k.total));
              prev.active = String(Number(prev.active) + Number(k.active));
            } else kwMap.set(k.keyword, { ...k });
          }
          for (const tr of (await trendRes.json()).data || []) {
            trendMap.set(tr.day, (trendMap.get(tr.day) || 0) + Number(tr.ads_discovered));
          }
        }
        setBrandStats([...brandMap.values()].sort((a, b) => Number(b.total) - Number(a.total)));
        setKeywordStats([...kwMap.values()].sort((a, b) => Number(b.total) - Number(a.total)));
        setTrend([...trendMap.entries()].map(([day, ads_discovered]) => ({ day, ads_discovered })).sort((a, b) => a.day.localeCompare(b.day)));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [countryFilter]);

  // Xu hướng RIÊNG của brand đang chọn: gọi /api/trend?brand=... từng thị trường rồi gộp ngày
  // (giống cách gộp dashboard chính) — brand ở đây khớp OR giống /api/ads nên xu hướng của 1
  // brand đã cấu hình (VD "Medicube") sẽ gồm cả ad affiliate nhắc tới brand đó, không chỉ Page chính.
  useEffect(() => {
    if (!selectedBrand || !API_BASE) {
      setBrandTrend([]);
      return;
    }
    (async () => {
      setBrandTrendLoading(true);
      try {
        const countries = countryFilter ? [countryFilter] : ["MX", "US"];
        const cat = encodeURIComponent("Mỹ phẩm & Làm đẹp");
        const map = new Map();
        for (const c of countries) {
          const res = await fetch(
            `${API_BASE}/api/trend?country=${encodeURIComponent(c)}&category=${cat}&brand=${encodeURIComponent(selectedBrand)}`
          );
          if (!res.ok) throw new Error("API trả về lỗi khi tải xu hướng brand");
          for (const tr of (await res.json()).data || []) {
            map.set(tr.day, (map.get(tr.day) || 0) + Number(tr.ads_discovered));
          }
        }
        setBrandTrend(
          [...map.entries()].map(([day, ads_discovered]) => ({ day, ads_discovered })).sort((a, b) => a.day.localeCompare(b.day))
        );
      } catch {
        setBrandTrend([]);
      } finally {
        setBrandTrendLoading(false);
      }
    })();
  }, [selectedBrand, countryFilter]);

  // BỎ ngưỡng >=5 ad (Đăng đính chính 26/10/2026, sau khi chốt ngưỡng lúc 10:45 cùng ngày):
  // affiliate của đối thủ thường chỉ có 1-2 ad, và mục tiêu của anh là khai thác TỐI ĐA brand
  // đối thủ — nên danh sách mặc định quay lại đầy đủ (MX+US, thuần mỹ phẩm), không lọc số ad.
  // Khi đang tìm trong bảng thì tìm cả theo từ khóa gắn với Page, không giới hạn số ad.
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
    () =>
      keywordStats
        .filter((k) => k.type === "industry" && k.category === "Mỹ phẩm & Làm đẹp")
        .sort((a, b) => Number(b.total) - Number(a.total)),
    [keywordStats]
  );

  const topActiveBrands = useMemo(
    () => [...brandStats].sort((a, b) => Number(b.active) - Number(a.active)).slice(0, 10),
    [brandStats]
  );

  // Tương tác của 1 Page = like + comment + share (KHÔNG cộng video_views — view khác đơn vị).
  // Backend cũ chưa có total_likes/... thì các số này về 0 — panel sẽ ghi chú rõ, không đọc 0
  // là "không ai tương tác". Số 0 cũng có thể là ad không parse được (xem engagement_parsed).
  const interactionsOf = (b) => Number(b.total_likes || 0) + Number(b.total_comments || 0) + Number(b.total_shares || 0);

  const topEngagementBrands = useMemo(
    () => [...brandStats].sort((a, b) => interactionsOf(b) - interactionsOf(a)).slice(0, 10),
    [brandStats]
  );

  // Affiliate / Page đăng chung: tên Page chứa " with " (VD "Chris Han with Medicube",
  // "Sandygal with ANUA_Global") — phần sau "with" là brand được nhắc tới. Đây là nhóm Page
  // mà danh sách chính đếm riêng từng Page, panel này gom lại để thấy brand nào được affiliate
  // nhắc nhiều nhất, dù mỗi affiliate chỉ có 1-2 ad.
  const affiliatePages = useMemo(() => {
    const rows = brandStats
      .filter((b) => /\s+with\s+/i.test(b.page_name))
      .map((b) => ({ ...b, affiliateBrand: b.page_name.split(/\s+with\s+/i).pop().trim() }))
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, 10);
    return rows;
  }, [brandStats]);

  const selectedRow = useMemo(
    () => (selectedBrand ? brandStats.find((b) => b.page_name === selectedBrand) || null : null),
    [selectedBrand, brandStats]
  );

  const selectedAffiliates = useMemo(() => {
    if (!selectedRow) return [];
    const base = selectedRow.page_name;
    return brandStats
      .filter(
        (b) =>
          b.page_name !== base &&
          (b.page_name.toLowerCase().includes(base.toLowerCase()) ||
            (b.keywords || []).some((k) => String(k).toLowerCase() === base.toLowerCase()))
      )
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, 10);
  }, [selectedRow, brandStats]);

  const brandTrendPoints = useMemo(
    () => brandTrend.map((t) => ({ day: t.day, value: Number(t.ads_discovered) })),
    [brandTrend]
  );

  const filteredTable = useMemo(() => {
    const text = debouncedTableSearch.trim().toLowerCase();
    // Khi ĐANG tìm kiếm theo tên brand thì tìm cả theo từ khóa gắn với Page (b.keywords) —
    // VD gõ "Medicube" sẽ ra cả Page "X with Medicube" dù mỗi Page chỉ có 1-2 ad.
    const sortRows = (rows) =>
      [...rows].sort((a, b) => {
        if (tableSort === "active") return Number(b.active) - Number(a.active);
        if (tableSort === "endurance") return Number(b.max_days_active || 0) - Number(a.max_days_active || 0);
        if (tableSort === "engagement") return interactionsOf(b) - interactionsOf(a);
        return Number(b.total) - Number(a.total);
      });
    if (text) {
      return sortRows(
        brandStats.filter(
          (b) =>
            b.page_name.toLowerCase().includes(text) ||
            (b.keywords || []).some((k) => String(k).toLowerCase().includes(text))
        )
      );
    }
    // Chỉ liệt kê thương hiệu thuần Mỹ phẩm & Làm đẹp (xem ghi chú ở web/pages/index.js) —
    // loại Page lẫn category Thời trang (VD SHEIN Mexico) khỏi danh sách đối thủ mỹ phẩm.
    // Không lọc số ad tối thiểu: affiliate 1-2 ad vẫn hiện đầy đủ.
    return sortRows(
      brandStats.filter(
        (b) => !b.categories || b.categories.length === 0 || (b.categories.length === 1 && b.categories[0] === "Mỹ phẩm & Làm đẹp")
      )
    );
  }, [brandStats, debouncedTableSearch, tableSort]);

  return (
    <Layout active="brands">
      <main className="content">
        <div className="page-head">
          <div className="page-head-row">
            <div>
              <h2>Dashboard Brand — {countryFilter ? MARKET_LABELS[countryFilter] || countryFilter : "Tất cả (MX + US)"}</h2>
              <p className="muted">
                Số liệu THẬT từ dữ liệu đã cào được (không có CTR/CVR/CPA hay lượt tìm kiếm — Meta Ad Library công khai
                không cung cấp các số này, xem README).
              </p>
            </div>
            <div className="market-toggle">
              <button className={countryFilter === "" ? "active" : ""} onClick={() => setCountryFilter("")}>
                Tất cả (MX + US)
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

            <div className="panel-grid">
              <div className="panel">
                <h3>Top 10 brand — tương tác cao nhất</h3>
                <p className="panel-sub">
                  Tương tác = like + comment + share cộng dồn mọi ad (không tính video views — view khác đơn vị).
                  Số liệu là best-effort từ Meta Ad Library: ad không gắn post công khai thì không parse được
                  tương tác, nên brand có tỉ lệ parse thấp thì số này bị thiếu, không phải "không ai tương tác".
                  Nếu backend chưa deploy bản mới, các cột này sẽ hiện 0 — tải lại sau khi Render deploy xong.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Thương hiệu</th>
                        <th>Like</th>
                        <th>Bình luận</th>
                        <th>Chia sẻ</th>
                        <th>Views</th>
                        <th>Tương tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topEngagementBrands.map((b) => (
                        <tr key={b.page_name}>
                          <td>
                            <button className="btn-brand-name" onClick={() => setSelectedBrand(b.page_name)}>
                              {b.page_name}
                            </button>
                          </td>
                          <td>{b.total_likes ?? "—"}</td>
                          <td>{b.total_comments ?? "—"}</td>
                          <td>{b.total_shares ?? "—"}</td>
                          <td>{b.total_video_views ?? "—"}</td>
                          <td>
                            <strong>{interactionsOf(b)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="panel-sub">Bấm tên brand để xem phân tích sâu bên dưới.</p>
              </div>
              <div className="panel">
                <h3>Affiliate / Page đăng chung — top 10 theo tổng ad</h3>
                <p className="panel-sub">
                  Page có tên dạng "X with Brand" là ad đăng chung hoặc affiliate/influencer nhắc tới brand.
                  Mỗi Page này thường chỉ có 1-2 ad, nhưng gộp lại mới thấy brand nào đang được đẩy qua
                  affiliate mạnh nhất — đây chính là nhóm bị ngưỡng tối thiểu ad cũ loại mất.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Page affiliate</th>
                        <th>Brand được nhắc</th>
                        <th>Tổng ad</th>
                        <th>Đang chạy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affiliatePages.map((b) => (
                        <tr key={b.page_name}>
                          <td>{b.page_name}</td>
                          <td>{b.affiliateBrand}</td>
                          <td>{b.total}</td>
                          <td>{Number(b.active) > 0 ? <span className="active-badge">{b.active}</span> : "0"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {affiliatePages.length === 0 && <p className="chart-empty">Chưa phát hiện Page dạng "X with Brand".</p>}
              </div>
            </div>

            {selectedRow && (
              <div className="panel">
                <div className="table-head">
                  <h3>Phân tích sâu: {selectedRow.page_name}</h3>
                  <button className="btn-load-more" onClick={() => setSelectedBrand(null)}>
                    Đóng
                  </button>
                </div>
                <div className="stat-row" style={{ marginTop: 12 }}>
                  <div className="stat-card">
                    <span className="stat-value">{selectedRow.total}</span>
                    <span className="stat-label">Tổng ad</span>
                  </div>
                  <div className="stat-card accent-good">
                    <span className="stat-value">{selectedRow.active}</span>
                    <span className="stat-label">Ad đang chạy</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-value">{interactionsOf(selectedRow)}</span>
                    <span className="stat-label">Tương tác (like + bình luận + chia sẻ)</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-value">
                      {selectedRow.avg_days_active ?? "—"} / {selectedRow.max_days_active ?? "—"}
                    </span>
                    <span className="stat-label">Ngày chạy trung bình / bền nhất</span>
                  </div>
                </div>
                <p className="panel-sub">
                  Tỉ lệ ad parse được tương tác: {selectedRow.engagement_parsed ?? "—"}/{selectedRow.total} ad.
                  Từ khóa gắn với Page: {(selectedRow.keywords || []).join(", ") || "—"}. Xuất hiện lần đầu:{" "}
                  {selectedRow.first_seen_at ? String(selectedRow.first_seen_at).slice(0, 10) : "—"} — thấy lần cuối:{" "}
                  {selectedRow.last_seen_at ? String(selectedRow.last_seen_at).slice(0, 10) : "—"}.
                  {selectedAffiliates.length > 0 && (
                    <>
                      {" "}
                      Page liên quan (cùng tên hoặc cùng từ khóa):{" "}
                      {selectedAffiliates.map((b) => `${b.page_name} (${b.total} ad)`).join(", ")}.
                    </>
                  )}
                </p>
                <h3 style={{ marginTop: 14 }}>Ad mới phát hiện của brand này — 30 ngày qua</h3>
                {brandTrendLoading ? (
                  <p className="muted">Đang tải xu hướng...</p>
                ) : (
                  <LineChart points={brandTrendPoints} />
                )}
                <div style={{ marginTop: 12 }}>
                  <Link href={`/?brand=${encodeURIComponent(selectedRow.page_name)}`} className="btn-view-ads">
                    Xem quảng cáo của brand này
                  </Link>
                </div>
              </div>
            )}

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
                    <option value="engagement">Sắp xếp: Tương tác cao nhất</option>
                  </select>
                </div>
              </div>
              <p className="panel-sub">
                Ngành hàng gắn cứng theo cấu hình từ khóa/thương hiệu (server/src/config/keywords.js), không suy đoán
                bằng cách so chuỗi tên. Danh sách đầy đủ, không lọc số ad tối thiểu — affiliate 1-2 ad vẫn hiện.
                Google Trends / Mercado Libre / TikTok chưa có trong dashboard này — đó là nguồn dữ liệu mới,
                sẽ thêm thành panel riêng sau, không trộn vào số liệu Meta hiện tại.
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
                      <th>Tương tác</th>
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
                          <td>{interactionsOf(b)}</td>
                          <td>
                            <button className="btn-brand-name" onClick={() => setSelectedBrand(b.page_name)}>
                              Phân tích
                            </button>
                          </td>
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
        .btn-brand-name {
          background: none;
          border: none;
          color: #6c5ce7;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          white-space: nowrap;
        }
        .btn-brand-name:hover {
          text-decoration: underline;
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
