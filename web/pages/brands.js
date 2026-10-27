import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { MARKET_LABELS, MARKET_CODES, CHECKLIST_BRANDS, pageMatchesTracked, isCosmeticsOrUnknownPage, avatarGradient, initials, facebookUrlFor, useDebouncedValue } from "../lib/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
const TABLE_PAGE = 25;

// Checklist 30 brand dùng chung với tab Quảng cáo — sửa ở web/lib/ui.js (CHECKLIST_BRANDS),
// không sửa ở đây để 2 tab không lệch nhau nữa.
const TRACKED_BRANDS = CHECKLIST_BRANDS;

// Gộp Page vào Brand CHỈ theo TÊN PAGE, không theo từ khóa — sửa sau khi kiểm chứng thật
// với API live ngày 26/10/2026: nếu gộp theo từ khóa thì Page "Amazon México Belleza" (23 ad,
// chỉ vì 1 ad trong đó nhắc tới Seyoul nên keywords chứa "Seyoul") sẽ bị tính vào Brand Seyoul,
// và cùng 1 Page sẽ bị tính vào nhiều Brand khác nhau, làm tổng ad bị thổi phồng và sai.
// Quy tắc đúng: Page thuộc Brand khi tên Page chứa tên Brand (chuẩn hóa bỏ khoảng trắng/dấu
// chấm/gạch dưới, VD "Dr.Althea" vẫn khớp "Dr. Althea", "Beauty of Joseon" khớp
// "beautyofjoseon"). Affiliate dạng "X with Brand" cũng khớp vì tên đã chứa tên Brand.
// VT là ngoại lệ: phải khớp theo từ độc lập (\bvt\b) hoặc bắt đầu bằng "VT", vì "vt" có thể
// xuất hiện trong từ khác khi chuẩn hóa bỏ khoảng trắng.
function LineChart({ points, width = 760, height = 180, unit = "ad" }) {
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
            {(() => {
              const d = String(c.day);
              // Ngày từ API là ISO "2025-10-06T00:00:00.000Z" — slice(5) cũ ra "10-06T00:00:00.000Z"
              // (đúng lỗi trong ảnh Đăng gửi). Hiển thị dạng DD/MM, còn ngày không phải ISO thì giữ nguyên phần sau năm.
              return d.length >= 10 && d[4] === "-" ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d.slice(5);
            })()}
          </text>
        ) : null
      )}
      <text x={padding.left} y={padding.top - 4} fontSize="9.5" fill="#9799b8">
        {maxVal} {unit}
      </text>
    </svg>
  );
}

function BarList({ rows, valueKey, max, onSelect, formatValue }) {
  const maxVal = max || Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div className="bar-row" key={r.page_name} onClick={onSelect ? () => onSelect(r.page_name) : undefined} style={onSelect ? { cursor: "pointer" } : undefined}>
          <span className="bar-dot" style={{ background: avatarGradient(r.page_name) }} />
          <span className="bar-label" title={r.page_name}>
            {r.page_name}
          </span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(4, (Number(r[valueKey]) / maxVal) * 100)}%` }} />
          </div>
          <span className="bar-value">{formatValue ? formatValue(r[valueKey]) : r[valueKey]}</span>
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
  // Tín hiệu ngoài Meta — fetch riêng, lỗi ở đây KHÔNG được làm hỏng dashboard Meta chính:
  // backend cũ chưa có endpoint /api/signals/* sẽ trả 404, frontend bắt và hiện "Chưa có dữ liệu".
  const [websiteData, setWebsiteData] = useState([]);
  const [socialData, setSocialData] = useState([]);
  const [creativeData, setCreativeData] = useState({ angles: [], offers: [], examples: [] });
  const [tiktokSignals, setTiktokSignals] = useState([]);
  const [trendsSignals, setTrendsSignals] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null); // tên Brand đang LỌC toàn bộ dashboard (null = tất cả brand)

  const [brandTrend, setBrandTrend] = useState([]);
  const [brandTrendLoading, setBrandTrendLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(TABLE_PAGE);
  const [countryFilter, setCountryFilter] = useState("MX"); // mặc định thị trường gốc; "" = gộp MX+US (từ 26/10/2026, không còn gộp KR/TH/MY)
  const [timeFilter, setTimeFilter] = useState(""); // "" = mọi thời gian; "7"/"30"/"90" = ad chạy trong N ngày gần nhất (26/10/2026 — Đăng yêu cầu)

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
          // window_days chỉ gửi cho /api/brands + /api/keywords (cùng dùng statsConditions):
          // biểu đồ xu hướng (/api/trend) giữ nguyên cửa sổ 30 ngày theo ngày phát hiện của nó.
          const windowParam = timeFilter ? `&window_days=${timeFilter}` : "";
          // Riêng /api/brands KHÔNG lọc category (26/10/2026 — sửa lỗi Medicube biến mất):
          // Page quét qua từ khóa brand thì guessCategory trả null nên categories trống, gọi
          // kèm category mỹ phẩm sẽ nuốt mất cả brand dù DB có đủ ad. Lọc mỹ phẩm/chưa có
          // category chuyển xuống trackedPages (isCosmeticsOrUnknownPage) — bảng từ khóa và
          // biểu đồ xu hướng vẫn lấy đúng category mỹ phẩm như cũ.
          const brandSuffix = `?country=${encodeURIComponent(c)}${windowParam}`;
          const [brandsRes, kwRes, trendRes] = await Promise.all([
            fetch(`${API_BASE}/api/brands${brandSuffix}`),
            fetch(`${API_BASE}/api/keywords${suffix}${windowParam}`),
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
  }, [countryFilter, timeFilter]);

  // Kéo tín hiệu ngoài Meta 1 lần khi mở trang (không phụ thuộc countryFilter vì 3 nguồn
  // này đều gắn với Mexico / hashtag toàn cầu, không chia MX/US như Meta).
  useEffect(() => {
    if (!API_BASE) return;
    (async () => {
      const load = async (path, setter) => {
        try {
          const res = await fetch(`${API_BASE}${path}`);
          if (res.ok) setter((await res.json()).data || []);
        } catch {
          // Backend cũ chưa có endpoint: giữ mảng rỗng, panel hiện "Chưa có dữ liệu".
        }
      };
      await Promise.all([
        load("/api/signals/tiktok", setTiktokSignals),
        load("/api/signals/trends", setTrendsSignals),
      ]);
    })();
  }, []);

  // Kéo website + social 1 lần khi mở trang (backend cũ 404 thì giữ rỗng, panel hiện "Chưa có dữ liệu").
  useEffect(() => {
    if (!API_BASE) return;
    (async () => {
      const load = async (path, setter) => {
        try {
          const res = await fetch(`${API_BASE}${path}`);
          if (res.ok) setter((await res.json()).data || []);
        } catch {
          // Backend cũ chưa có endpoint: giữ rỗng.
        }
      };
      await Promise.all([load("/api/competitors/website", setWebsiteData), load("/api/competitors/social", setSocialData)]);
    })();
  }, []);

  // Creative: khi đang lọc brand thì gọi API với từ khóa của Page đang chọn (VD "medicube"),
  // không phải tên Page đầy đủ — vì API lọc theo logic tìm brand (tên Page chứa brand, nội
  // dung nhắc brand, hoặc từ khóa đúng tên brand), dùng tên Page đầy đủ sẽ chỉ ra đúng 1 Page
  // mà mất hết affiliate cùng từ khóa. Tìm dòng trong effect bằng visibleStats (Brand gộp hoặc
  // Page, tùy chế độ hiện) — effect chạy sau render nên không vướng thứ tự khai báo memo.
  useEffect(() => {
    if (!API_BASE) return;
    (async () => {
      try {
        let url = `${API_BASE}/api/competitors/creative`;
        if (selectedBrand) {
          const tracked = TRACKED_BRANDS.find((tb) => tb.name === selectedBrand);
          const row = visibleStats.find((b) => b.page_name === selectedBrand);
          const kw = tracked ? tracked.keys[0] : row && row.keywords && row.keywords[0] ? row.keywords[0] : selectedBrand;
          url += `?brand=${encodeURIComponent(kw)}`;
        }
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          setCreativeData(json.data || { angles: [], offers: [], examples: [] });
        }
      } catch {
        // Backend cũ: giữ rỗng.
      }
    })();
  }, [selectedBrand, brandStats]);

  // Đổi brand đang lọc HOẶC đổi khoảng thời gian thì quay lại trang đầu của bảng (tránh
  // trường hợp bảng đã lọc chỉ còn vài dòng mà visibleCount đang ở mức cao, nút Xem thêm
  // hiện sai).
  useEffect(() => {
    setVisibleCount(TABLE_PAGE);
  }, [selectedBrand, timeFilter]);

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

  // LỌC TOÀN BỘ DASHBOARD THEO BRAND (Đăng yêu cầu 26/10/2026): trước đây bấm 1 brand chỉ
  // hiện panel phân tích sâu, còn thẻ thống kê, biểu đồ xu hướng, Top 10, bảng vẫn lấy hết
  // tất cả brand — giờ selectedBrand là bộ lọc CHUNG cho mọi số liệu Meta trên trang.
  // "Brand" ở đây = nhóm Page cùng từ khóa với Page đang chọn (VD chọn Page "Medicube with
  // DIBS on Trends" có từ khóa "medicube" thì lọc ra cả Page chính lẫn affiliate "X with
  // Medicube" — đúng định nghĩa brand chính + affiliate đã dùng ở ô Tìm thương hiệu, không
  // phải chỉ 1 Page đơn lẻ). Khi không chọn brand nào thì filteredBrandStats = toàn bộ visibleStats
  // (11 Brand gộp mặc định, hoặc tất cả Page khi đang hiện tất cả).
  // GỘP PAGE THÀNH BRAND (Đăng phản hồi 26/10/2026: dashboard vẫn kéo hết toàn bộ Brand,
  // không theo danh sách): mặc định, mọi số liệu trên trang tính từ brandGroups — mỗi brand
  // đang theo dõi là 1 dòng duy nhất, tổng ad / đang chạy / tương tác là TỔNG của tất cả Page
  // thuộc brand đó (VD Seyoul Mexico + Seyoul MX + Seyoul Cosméticos gộp thành 1 dòng "Seyoul",
  // không còn 4 dòng Seyoul riêng lẻ như ảnh Đăng gửi).
  // Không còn chế độ xem tất cả Page — muốn xem long-tail thì bảo em thêm lại 1 nút duy nhất.
  const trackedPages = useMemo(
    // Giữ Page chưa có category (quét từ khóa brand, VD Medicube) hoặc có category mỹ phẩm;
    // loại Page đã xếp rõ sang ngành khác (VD "Mundo de Artesanías y Manualidades" khớp chuỗi
    // "anua" và "Roca Natura" khớp từ "Natura" nhưng đều là đồ gia dụng) — xem isCosmeticsOrUnknownPage.
    () => brandStats.filter((page) => isCosmeticsOrUnknownPage(page) && TRACKED_BRANDS.some((tb) => pageMatchesTracked(page, tb))),
    [brandStats]
  );
  const brandGroups = useMemo(() => {
    const groups = [];
    for (const tb of TRACKED_BRANDS) {
      const pages = trackedPages
        .filter((page) => pageMatchesTracked(page, tb))
        .sort((a, b) => Number(b.total) - Number(a.total));
      if (!pages.length) continue;
      const total = pages.reduce((s, b) => s + Number(b.total || 0), 0);
      const sumField = (f) => pages.reduce((s, b) => s + Number(b[f] || 0), 0);
      groups.push({
        page_name: tb.name,
        page_id: pages[0].page_id || null, // Page lớn nhất của brand — link Facebook ở bảng mở Page này
        total: String(total),
        active: String(sumField("active")),
        max_days_active: Math.max(0, ...pages.map((b) => Number(b.max_days_active) || 0)),
        avg_days_active: Math.round(
          pages.reduce((s, b) => s + (Number(b.avg_days_active) || 0) * Number(b.total || 0), 0) / Math.max(1, total)
        ),
        total_likes: String(sumField("total_likes")),
        total_comments: String(sumField("total_comments")),
        total_shares: String(sumField("total_shares")),
        total_video_views: String(sumField("total_video_views")),
        engagement_parsed: String(sumField("engagement_parsed")),
        categories: [...new Set(pages.flatMap((b) => b.categories || []))],
        keywords: [...new Set([...tb.keys, ...pages.flatMap((b) => b.keywords || [])])],
        first_seen_at: pages.map((b) => b.first_seen_at).filter(Boolean).sort()[0] || null,
        last_seen_at: pages.map((b) => b.last_seen_at).filter(Boolean).sort().pop() || null,
        isBrandGroup: true,
        pages: pages.map((b) => ({ page_name: b.page_name, total: b.total, active: b.active })),
      });
    }
    return groups.sort((a, b) => Number(b.total) - Number(a.total));
  }, [trackedPages]);
  const missingTrackedBrands = useMemo(
    () => TRACKED_BRANDS.filter((tb) => !brandGroups.some((g) => g.page_name === tb.name)).map((tb) => tb.name),
    [brandGroups]
  );
  // Xóa 2 nút chuyển chế độ (Đăng yêu cầu 26/10/2026): dashboard CHỈ hiện checklist, không
  // còn chế độ "Hiện tất cả Page đã phát hiện" nữa — visibleStats luôn là brandGroups.
  const visibleStats = brandGroups;
  // basePages dùng cho panel affiliate: luôn là Page thật (không phải dòng Brand đã gộp, vì
  // dòng gộp không có tên dạng "X with Brand"), và đã lọc về brand trong checklist.
  const basePages = trackedPages;

  const selectedRow = useMemo(
    () => (selectedBrand ? visibleStats.find((b) => b.page_name === selectedBrand) || null : null),
    [selectedBrand, visibleStats]
  );
  const filteredBrandStats = useMemo(() => {
    if (!selectedBrand) return visibleStats;
    if (!selectedRow) return visibleStats.filter((b) => b.page_name === selectedBrand);
    const keys = (selectedRow.keywords || []).map((k) => String(k).toLowerCase());
    if (!keys.length) return visibleStats.filter((b) => b.page_name === selectedBrand);
    return visibleStats.filter(
      (b) => b.page_name === selectedBrand || (b.keywords || []).some((k) => keys.includes(String(k).toLowerCase()))
    );
  }, [selectedBrand, selectedRow, visibleStats]);
  // Xu hướng hiệu dụng cho biểu đồ chính: khi đang lọc thì dùng xu hướng RIÊNG của brand
  // (đã fetch qua /api/trend?brand=...), khi không lọc thì dùng xu hướng chung toàn hệ thống.
  const effectiveTrendPoints = useMemo(
    () =>
      selectedBrand
        ? brandTrend.map((tr) => ({ day: String(tr.day).slice(0, 10), value: Number(tr.ads_discovered) }))
        : trend.map((tr) => ({ day: String(tr.day).slice(0, 10), value: Number(tr.ads_discovered) })),
    [selectedBrand, brandTrend, trend]
  );

  // BỎ ngưỡng >=5 ad (Đăng đính chính 26/10/2026, sau khi chốt ngưỡng lúc 10:45 cùng ngày):
  // affiliate của đối thủ thường chỉ có 1-2 ad, và mục tiêu của anh là khai thác TỐI ĐA brand
  // đối thủ — nên danh sách mặc định quay lại đầy đủ (MX+US, thuần mỹ phẩm), không lọc số ad.
  // Khi đang tìm trong bảng thì tìm cả theo từ khóa gắn với Page, không giới hạn số ad.
  const totals = useMemo(() => {
    const totalAds = filteredBrandStats.reduce((s, b) => s + Number(b.total || 0), 0);
    const totalActive = filteredBrandStats.reduce((s, b) => s + Number(b.active || 0), 0);
    const longest = filteredBrandStats.reduce((m, b) => Math.max(m, Number(b.max_days_active) || 0), 0);
    return { totalBrands: filteredBrandStats.length, totalAds, totalActive, longest };
  }, [filteredBrandStats]);

  const industryBreakdown = useMemo(() => {
    const base = keywordStats.filter((k) => k.type === "industry" && k.category === "Mỹ phẩm & Làm đẹp");
    if (!selectedBrand) return base.sort((a, b) => Number(b.total) - Number(a.total));
    // Khi đang lọc brand: chỉ hiện các từ khóa ngành đã dẫn tới ad của brand đang lọc.
    const keys = new Set();
    for (const b of filteredBrandStats) for (const k of b.keywords || []) keys.add(String(k));
    return base
      .filter((k) => keys.has(k.keyword))
      .sort((a, b) => Number(b.total) - Number(a.total));
  }, [keywordStats, selectedBrand, filteredBrandStats]);

  const topActiveBrands = useMemo(
    () => [...filteredBrandStats].sort((a, b) => Number(b.active) - Number(a.active)).slice(0, 10),
    [filteredBrandStats]
  );

  // Tương tác của 1 Page = like + comment + share (KHÔNG cộng video_views — view khác đơn vị).
  // Backend cũ chưa có total_likes/... thì các số này về 0 — panel sẽ ghi chú rõ, không đọc 0
  // là "không ai tương tác". Số 0 cũng có thể là ad không parse được (xem engagement_parsed).
  const interactionsOf = (b) => Number(b.total_likes || 0) + Number(b.total_comments || 0) + Number(b.total_shares || 0);

  const topEngagementBrands = useMemo(
    () => [...filteredBrandStats].sort((a, b) => interactionsOf(b) - interactionsOf(a)).slice(0, 10),
    [filteredBrandStats]
  );

  // Affiliate / Page đăng chung: tên Page chứa " with " (VD "Chris Han with Medicube",
  // "Sandygal with ANUA_Global") — phần sau "with" là brand được nhắc tới. Đây là nhóm Page
  // mà danh sách chính đếm riêng từng Page, panel này gom lại để thấy brand nào được affiliate
  // nhắc nhiều nhất, dù mỗi affiliate chỉ có 1-2 ad.
  const affiliatePages = useMemo(() => {
    // Nguồn là Page thật: nếu đang lọc 1 Brand gộp thì chỉ lấy Page của brand đó, nếu không
    // lọc thì lấy Page của các brand đang theo dõi (hoặc tất cả Page khi đang hiện tất cả).
    const source = selectedRow && selectedRow.isBrandGroup ? selectedRow.pages : selectedBrand ? filteredBrandStats : basePages;
    const rows = source
      .filter((b) => /\s+with\s+/i.test(b.page_name))
      .map((b) => ({ ...b, affiliateBrand: b.page_name.split(/\s+with\s+/i).pop().trim() }))
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, 10);
    return rows;
  }, [filteredBrandStats, selectedRow, selectedBrand, basePages]);

  const selectedAffiliates = useMemo(() => {
    if (!selectedRow || selectedRow.isBrandGroup) return [];
    const base = selectedRow.page_name;
    return basePages
      .filter(
        (b) =>
          b.page_name !== base &&
          (b.page_name.toLowerCase().includes(base.toLowerCase()) ||
            (b.keywords || []).some((k) => String(k).toLowerCase() === base.toLowerCase()))
      )
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, 10);
  }, [selectedRow, basePages]);

  const fmtNum = (n) => (n == null || n === "" ? "—" : Number(n).toLocaleString());

  // Tín hiệu của brand đang lọc: signal brand (VD "Medicube") khớp khi tên signal brand
  // trùng từ khóa của Page đang chọn, hoặc tên Page đang chọn chứa tên signal brand.
  // Brand không nằm trong danh sách tín hiệu 11 brand (VD Luum Skincare) thì panel tín hiệu
  // sẽ trống với ghi chú riêng, không phải "chưa chạy workflow".
  const signalMatchesFilter = (signalBrand) => {
    if (!selectedBrand) return true;
    const sb = String(signalBrand).toLowerCase();
    const keys = (selectedRow?.keywords || []).map((k) => String(k).toLowerCase());
    return keys.includes(sb) || selectedBrand.toLowerCase().includes(sb) || sb.includes(selectedBrand.toLowerCase());
  };

  // Nhãn tiếng Việt cho key góc bán / offer (khớp config/competitors.js — sửa ở đó thì sửa ở đây theo).
  const CREATIVE_LABELS = {
    melasma: "Melasma / đốm nâu",
    hidratacion: "Dưỡng ẩm",
    vitamina_c: "Vitamin C / làm sáng",
    retinol: "Retinol / chống lão hóa",
    niacinamide: "Niacinamide",
    pdrn_collagen: "PDRN / Collagen / Peptide",
    protector_solar: "Chống nắng",
    acne_poros: "Mụn / lỗ chân lông",
    sensible: "Da nhạy cảm / làm dịu",
    exfoliacion: "Tẩy tế bào chết / peel",
    descuento_pct: "Giảm %",
    dos_por_uno: "2x1 / Mua 1 tặng 1",
    envio_gratis: "Miễn phí vận chuyển",
    regalo: "Tặng kèm",
    kit_bundle: "Bộ / Kit / Bundle",
    codigo: "Mã giảm giá",
  };

  // Rút gọn lỗi website thành 1 dòng dễ hiểu: bỏ tiền tố "page.goto:", bỏ phần "Call log"
  // dài của Playwright, chỉ giữ lý do chính (VD ERR_SSL_PROTOCOL_ERROR, ERR_CONNECTION_CLOSED).
  const shortWebsiteError = (msg) => {
    if (!msg) return "Không mở được website";
    let s = String(msg).replace(/^page\.goto:\s*/i, "").split("Call log:")[0].trim();
    if (s.length > 90) s = s.slice(0, 90) + "…";
    return s || "Không mở được website";
  };

  const websiteFiltered = useMemo(
    () => [...websiteData].filter((r) => signalMatchesFilter(r.brand)).sort((a, b) => a.brand.localeCompare(b.brand)),
    // signalMatchesFilter dùng selectedBrand/selectedRow nên deps phải gồm cả 2, dù hàm này
    // được khai báo ở dưới (trong render, memo này chạy sau khi hàm đã khai báo xong).
    [websiteData, selectedBrand, selectedRow]
  );

  // Social: gom theo brand -> { youtube, facebook } để vẽ 1 dòng / brand.
  const socialByBrand = useMemo(() => {
    const map = new Map();
    for (const r of socialData) {
      if (!signalMatchesFilter(r.brand)) continue;
      if (!map.has(r.brand)) map.set(r.brand, { brand: r.brand });
      map.get(r.brand)[r.source] = r;
    }
    return [...map.values()].sort((a, b) => a.brand.localeCompare(b.brand));
  }, [socialData, selectedBrand, selectedRow]);


  // TikTok: xếp theo lượt xem hashtag tích lũy (số này là tổng tích lũy, so sánh được giữa
  // các brand — khác với Trends, mỗi brand chuẩn hóa riêng). VT và Round Lab dùng hashtag
  // cụ thể đã ghi trong config/signals.js, không phải tên brand thô.
  const tiktokSorted = useMemo(
    () =>
      [...tiktokSignals]
        .filter((r) => signalMatchesFilter(r.brand))
        .sort((a, b) => Number(b.view_count || 0) - Number(a.view_count || 0)),
    [tiktokSignals, selectedBrand, selectedRow]
  );

  // Trends: KHÔNG xếp hạng theo interest_avg — mỗi brand chuẩn hóa riêng về đỉnh 100 của
  // chính nó, xếp hạng sẽ gây hiểu nhầm. Sắp xếp theo tên để đọc từng brand độc lập.
  const trendsSorted = useMemo(
    () => [...trendsSignals].filter((r) => signalMatchesFilter(r.brand)).sort((a, b) => a.brand.localeCompare(b.brand)),
    [trendsSignals, selectedBrand, selectedRow]
  );

  // Bar cho dashboard sau khi doi bang -> bieu do (27/10/2026, Dang chot): BarList can
  // page_name + 1 valueKey nen map truoc o day. Thu tu bar = gia tri giam dan.
  const engagementBars = useMemo(
    () => topEngagementBrands.map((b) => ({ page_name: b.page_name, interaction: interactionsOf(b) })),
    [topEngagementBrands]
  );
  const angleBars = useMemo(
    () =>
      [...creativeData.angles]
        .map((r) => ({ page_name: CREATIVE_LABELS[r.angle] || r.angle, active: Number(r.active_ads || 0) }))
        .sort((a, b) => b.active - a.active),
    [creativeData.angles]
  );
  const offerBars = useMemo(
    () =>
      [...creativeData.offers]
        .map((r) => ({ page_name: CREATIVE_LABELS[r.offer] || r.offer, active: Number(r.active_ads || 0) }))
        .sort((a, b) => b.active - a.active),
    [creativeData.offers]
  );
  const tiktokBars = useMemo(
    () => tiktokSorted.map((r) => ({ page_name: r.brand, views: Number(r.view_count || 0) })),
    [tiktokSorted]
  );
  // Duong Trends 90 ngay cua brand dang chon (diem da keo ve san trong trendsSignals).
  // Ngay Trends dang "26 jul 2026" (tieng Tay Ban Nha) -> doi sang ISO de LineChart hien DD/MM dung.
  const selectedTrendPoints = useMemo(() => {
    if (!selectedBrand) return [];
    const row = trendsSignals.find((r) => signalMatchesFilter(r.brand));
    if (!row || !row.points) return [];
    const months = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", sep: "09", sept: "09", oct: "10", nov: "11", dic: "12" };
    return row.points.map((pt) => {
      const m = String(pt.date || "").match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i);
      const day =
        m && months[m[2].toLowerCase()]
          ? `${m[3]}-${months[m[2].toLowerCase()]}-${String(m[1]).padStart(2, "0")}`
          : String(pt.date || "");
      return { day, value: Number(pt.value || 0) };
    });
  }, [selectedBrand, trendsSignals, selectedRow]);

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
        filteredBrandStats.filter(
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
      filteredBrandStats.filter(
        (b) => !b.categories || b.categories.length === 0 || (b.categories.length === 1 && b.categories[0] === "Mỹ phẩm & Làm đẹp")
      )
    );
  }, [filteredBrandStats, debouncedTableSearch, tableSort]);

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
            <div className="panel" style={{ marginBottom: 18 }}>
              <div className="table-head">
                <h3>Lọc theo Brand</h3>
                {selectedBrand && (
                  <button className="btn-load-more" onClick={() => setSelectedBrand(null)}>
                    Xóa lọc — xem tất cả brand
                  </button>
                )}
              </div>
              <p className="panel-sub">
                Trang này chỉ hiện checklist 30 brand (11 brand của Đăng + 19 brand lớn tại Mỹ và Mexico), mỗi brand gộp tất cả Page thành 1 dòng. Chọn 1 brand thì toàn bộ số liệu trên trang chỉ tính cho brand đó. Bấm tên brand trong bất kỳ bảng nào cũng lọc giống vậy.
              </p>
              <div className="table-controls" style={{ marginTop: 8 }}>
                <select
                  value={selectedBrand || ""}
                  onChange={(e) => setSelectedBrand(e.target.value || null)}
                  style={{ minWidth: 260 }}
                >
                  <option value="">Tất cả brand</option>
                  {[...visibleStats]
                    .sort((a, b) => Number(b.total) - Number(a.total))
                    .map((b) => (
                      <option key={b.page_name} value={b.page_name}>
                        {b.page_name} ({b.total} ad)
                        {b.isBrandGroup ? ` — ${b.pages.length} Page` : ""}
                      </option>
                    ))}
                </select>
                <select
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value)}
                  style={{ minWidth: 180 }}
                  title="Lọc ad chạy trong khoảng thời gian"
                >
                  <option value="">Mọi thời gian</option>
                  <option value="7">7 ngày qua</option>
                  <option value="30">30 ngày qua</option>
                  <option value="90">90 ngày qua</option>
                </select>
                {selectedBrand && (
                  <span className="muted small" style={{ alignSelf: "center" }}>
                    Đang lọc: <strong>{selectedBrand}</strong> —{" "}
                    {selectedRow && selectedRow.isBrandGroup
                      ? `${selectedRow.pages.length} Page thuộc brand này, `
                      : `${filteredBrandStats.length} Page thuộc brand này, `}
                    {totals.totalAds} ad.
                  </span>
                )}
                {timeFilter && (
                  <span className="muted small" style={{ alignSelf: "center" }}>
                    Đang lọc {timeFilter} ngày qua: tính ad đang chạy, hoặc ad đã dừng nhưng lần
                    cuối tool còn thấy trong khoảng (Meta không trả ngày dừng chính xác nên đây là
                    xấp xỉ theo lần thấy cuối, không phải ngày dừng thật).
                  </span>
                )}
              </div>
              {missingTrackedBrands.length > 0 && (
                <p className="panel-sub" style={{ marginTop: 8 }}>
                  Trong thị trường đang chọn, các brand sau chưa có Page nào nên không hiện trong
                  danh sách: {missingTrackedBrands.join(", ")}. Đây là bình thường với brand mới
                  thêm vào checklist — cron Meta quét từ khóa mới mỗi ngày lúc 20:00 giờ Việt Nam,
                  sau lần quét đầu tiên thì Page của brand đó mới xuất hiện ở đây (không cần deploy
                  lại, dữ liệu tự vào DB là dashboard tự hiện).
                  {timeFilter && (
                    <>
                      {" "}Khi đang lọc {timeFilter} ngày qua, brand không có ad chạy trong khoảng
                      cũng nằm trong danh sách này — không có nghĩa là brand chưa từng có Page.
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="stat-row">
              <div className="stat-card">
                <span className="stat-value">{totals.totalBrands}</span>
                <span className="stat-label">
                  {selectedBrand ? "Page thuộc brand đang lọc" : "Brand trong checklist (đã gộp Page)"}
                </span>
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
              <h3>
                {selectedBrand ? `Ad mới phát hiện của brand đang lọc — 30 ngày qua` : "Ad mới phát hiện theo ngày — 30 ngày qua"}
              </h3>
              <p className="panel-sub">
                Đây là ngày công cụ NHÌN THẤY ad lần đầu (không phải ngày Facebook thật sự bắt đầu chạy ad) — phản ánh
                nhịp độ phát hiện của chính pipeline, không phải xu hướng chi tiêu thị trường thật.
                {selectedBrand &&
                  " Khi đang lọc brand, biểu đồ này tính theo logic tìm brand (tên Page chứa brand, nội dung nhắc brand, hoặc từ khóa đúng tên brand), nên có thể gồm cả ad affiliate nhắc tới brand."}
              </p>
              {selectedBrand && brandTrendLoading ? (
                <p className="muted">Đang tải xu hướng của brand...</p>
              ) : (
                <LineChart points={effectiveTrendPoints} />
              )}
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
                  Tương tác = like + bình luận + chia sẻ cộng dồn mọi ad (không tính video views). Chỉ parse được ad gắn post công khai nên số có thể thiếu — số 0 nghĩa là chưa parse được tương tác, không phải “không ai tương tác”.
                </p>
                <BarList rows={engagementBars} valueKey="interaction" onSelect={(name) => setSelectedBrand(name)} formatValue={fmtNum} />
                <p className="panel-sub">Bấm tên brand để xem phân tích sâu bên dưới.</p>
              </div>
              <div className="panel">
                <h3>Affiliate / Page đăng chung — top 10 theo tổng ad</h3>
                <p className="panel-sub">
                  Page dạng “X with Brand” là ad đăng chung/affiliate — mỗi Page thường chỉ 1-2 ad, nhưng gộp lại mới thấy brand nào đang được đẩy qua affiliate mạnh nhất.
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
                    Xóa lọc
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
                {selectedRow.isBrandGroup && (
                  <p className="panel-sub" style={{ marginTop: 12 }}>
                    Các Page thuộc brand này ({selectedRow.pages.length} Page):{" "}
                    {selectedRow.pages.map((pg) => `${pg.page_name} (${pg.total} ad, ${pg.active} đang chạy)`).join(" • ")}.
                    Số liệu phía trên là TỔNG của tất cả các Page này, link Facebook ở bảng dưới mở Page lớn nhất.
                  </p>
                )}
                <p className="panel-sub" style={{ marginTop: 12 }}>
                  Xu hướng của brand này xem ở biểu đồ "Ad mới phát hiện của brand đang lọc" phía trên — không vẽ
                  lại ở đây để khỏi trùng.
                </p>
                <div style={{ marginTop: 12 }}>
                  <Link href={`/?brand=${encodeURIComponent(selectedRow.page_name)}`} className="btn-view-ads">
                    Xem quảng cáo của brand này
                  </Link>
                </div>
              </div>
            )}

            <div className="panel">
              <h3>Tín hiệu ngoài Meta — TikTok + Google Trends</h3>
              <p className="panel-sub">
                2 nguồn này có đơn vị riêng, không cộng chung với số Meta ở trên. Dữ liệu do job fetch-signals kéo 1 lần/ngày (GitHub Actions, 08:00 giờ Mexico), không phải realtime. Cả 2 nguồn hiện chỉ cover 11 brand gốc (10 đối thủ + Seyoul), chưa mở rộng lên checklist 30 — khi lọc 1 brand mới thì 2 bảng dưới trống là đúng, bỏ lọc brand để xem đủ 11 brand gốc.
              </p>
              {selectedBrand &&
                tiktokSignals.length > 0 &&
                trendsSignals.length > 0 &&
                ![...tiktokSignals, ...trendsSignals].some((r) => signalMatchesFilter(r.brand)) && (
                  <p className="panel-sub" style={{ color: "#8e6b00" }}>
                    Đang lọc brand "{selectedBrand}" — brand này chưa nằm trong danh sách tín hiệu
                    11 brand gốc, nên TikTok / Google Trends dưới đây trống là đúng. Bỏ lọc brand
                    để xem tín hiệu của 11 brand gốc.
                  </p>
                )}

              <h4 style={{ margin: "16px 0 6px", fontSize: 13 }}>TikTok — lượt xem hashtag tích lũy</h4>
              <p className="panel-sub">
                Lượt xem hashtag CỘNG DỒN từ trước tới nay, không phải lượt xem trong 1 ngày — muốn thấy tăng trưởng thì so snapshot hôm nay với hôm trước. VT dùng hashtag “vtcosmetics”, Round Lab dùng “roundlabskincare”.
              </p>
              {tiktokSorted.length === 0 ? (
                <p className="chart-empty">
                  {selectedBrand && tiktokSignals.length > 0
                    ? "Brand đang lọc chưa có trong danh sách tín hiệu 11 brand (TikTok chỉ theo dõi 10 đối thủ + Seyoul)."
                    : "Chưa có dữ liệu TikTok — chạy workflow fetch-signals lần đầu."}
                </p>
              ) : (
                <BarList rows={tiktokBars} valueKey="views" formatValue={fmtNum} />
              )}

              <h4 style={{ margin: "20px 0 6px", fontSize: 13 }}>Google Trends Mexico — chỉ số quan tâm tương đối, 90 ngày</h4>
              <p className="panel-sub">
                Chỉ số 0-100 chuẩn hóa RIÊNG cho từng brand (100 là ngày cao nhất của chính brand đó trong 90 ngày), không phải lượt tìm kiếm tuyệt đối — không so trung bình giữa các brand với nhau. Đọc đúng cách: so chỉ số gần nhất với trung bình của chính brand đó (đang lên hay xuống).
              </p>
              {selectedBrand && selectedTrendPoints.length > 0 && (
                <>
                  <p className="panel-sub">Đường 90 ngày của brand đang chọn (chỉ số 0-100, chuẩn hóa riêng cho brand này):</p>
                  <LineChart points={selectedTrendPoints} unit="điểm" />
                </>
              )}
              {trendsSorted.length === 0 ? (
                <p className="chart-empty">
                  {selectedBrand && trendsSignals.length > 0
                    ? "Brand đang lọc chưa có trong danh sách tín hiệu 11 brand (Trends chỉ theo dõi 10 đối thủ + Seyoul)."
                    : "Chưa có dữ liệu Google Trends — chạy workflow fetch-signals lần đầu."}
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Thương hiệu</th>
                        <th>Từ khóa</th>
                        <th>Trung bình 90 ngày</th>
                        <th>Đỉnh</th>
                        <th>Gần nhất</th>
                        <th>Cập nhật</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trendsSorted.map((r) => (
                        <tr key={r.brand}>
                          <td>
                            <strong>{r.brand}</strong>
                          </td>
                          <td>{r.keyword}</td>
                          <td>{r.interest_avg ?? "—"}</td>
                          <td>{r.interest_max ?? "—"}</td>
                          <td>{r.interest_last ?? "—"}</td>
                          <td>{r.fetched_at ? String(r.fetched_at).slice(0, 10) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="panel">
              <h3>Đối thủ mở rộng — Website, Creative, Social</h3>
              <p className="panel-sub">
                Dữ liệu do job fetch-competitors kéo 1 lần/ngày (GitHub Actions, 09:00 giờ Mexico), không phải realtime. Chưa có dữ liệu nghĩa là job chưa chạy lần nào — vào tab Actions, workflow “Fetch đối thủ mở rộng”, bấm Run workflow để kéo lần đầu.
                {selectedBrand && " Đang lọc theo brand đang chọn ở đầu trang."}
              </p>

              <h4 style={{ margin: "16px 0 6px", fontSize: 13 }}>Website chính — giá + offer</h4>
              <p className="panel-sub">
                Xem đối thủ đang bán với offer nào hôm nay để so với offer của Seyoul. Job chỉ đọc TRANG CHỦ — khuyến mãi để ở trang shop riêng sẽ không thấy ở đây; giá thấp - cao chỉ tính trên sản phẩm parse được, không phải toàn shop.
              </p>
              {websiteFiltered.length === 0 ? (
                <p className="chart-empty">Chưa có dữ liệu website — chạy workflow fetch-competitors lần đầu.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Thương hiệu</th>
                        <th>Website</th>
                        <th>Promo / Offer tìm thấy</th>
                        <th>Giá thấp - cao</th>
                        <th>Trạng thái</th>
                        <th>Cập nhật</th>
                      </tr>
                    </thead>
                    <tbody>
                      {websiteFiltered.map((r) => (
                        <tr key={r.brand}>
                          <td>
                            <strong>{r.brand}</strong>
                          </td>
                          <td>
                            {r.website_url ? (
                              <a href={r.website_url} target="_blank" rel="noreferrer">
                                {r.website_url.replace("https://", "").replace("www.", "")}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {r.status === "success"
                              ? r.promo_texts && r.promo_texts.length
                                ? r.promo_texts.slice(0, 3).join(" • ")
                                : "Không tìm thấy dòng khuyến mãi rõ ràng"
                              : "—"}
                          </td>
                          <td>
                            {r.price_min == null ? "—" : `${fmtNum(r.price_min)} - ${fmtNum(r.price_max)}`}
                          </td>
                          <td>
                            {r.status === "success"
                              ? "OK"
                              : r.status === "not_configured"
                                ? "Chưa cấu hình website chính thức"
                                : `Không mở được: ${shortWebsiteError(r.error_message)}`}
                          </td>
                          <td>{r.fetched_at ? String(r.fetched_at).slice(0, 10) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4 style={{ margin: "20px 0 6px", fontSize: 13 }}>Creative Meta — góc bán + offer (phân loại rule-based)</h4>
              <p className="panel-sub">
                Phân loại bằng từ khóa cố định trên nội dung ad trong DB (không gọi AI cho mọi ad). Một ad có thể thuộc nhiều góc và nhiều offer cùng lúc nên đừng cộng các dòng lại. AI chỉ tóm tắt tối đa 10 ad bền nhất đang chạy; nếu AI lỗi thì phần đó để trống nhưng số liệu rule vẫn đầy đủ.
                {selectedBrand && " Bảng này đã lọc theo brand đang chọn."}
              </p>
              {creativeData.angles.length === 0 && creativeData.offers.length === 0 ? (
                <p className="chart-empty">Chưa có dữ liệu creative — chạy workflow fetch-competitors lần đầu (nguồn creative).</p>
              ) : (
                <>
                  <p className="panel-sub" style={{ margin: "12px 0 6px" }}><strong>Góc bán</strong> — số ad đang chạy</p>
                  <BarList rows={angleBars} valueKey="active" />

                  <p className="panel-sub" style={{ margin: "12px 0 6px" }}><strong>Offer</strong> — số ad đang chạy</p>
                  <BarList rows={offerBars} valueKey="active" />

                  {creativeData.examples.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <p className="panel-sub">Ad bền nhất đang chạy (kèm tóm tắt AI nếu có):</p>
                      {creativeData.examples.slice(0, 5).map((ex) => (
                        <p key={ex.ad_id} className="panel-sub">
                          <strong>{ex.page_name}</strong> ({ex.days_active ?? "—"} ngày) —{" "}
                          {(ex.angles || []).map((k) => CREATIVE_LABELS[k] || k).join(", ") || "chưa phân loại góc"}
                          {ex.ai_summary ? ` — AI: ${ex.ai_summary}` : ""}
                          {ex.snapshot_url ? (
                            <>
                              {" "}
                              <a href={ex.snapshot_url} target="_blank" rel="noreferrer">
                                Xem ad ↗
                              </a>
                            </>
                          ) : null}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}

              <h4 style={{ margin: "20px 0 6px", fontSize: 13 }}>Social — YouTube + Facebook</h4>
              <p className="panel-sub">
                YouTube: kênh tìm bằng trang kết quả tìm kiếm YouTube (chưa có key API chính thức). Facebook: Page có nhiều ad nhất của brand từ chính bảng ads. Số followers/subscribers là số công khai tại thời điểm job chạy, không phải realtime.
              </p>
              {socialByBrand.length === 0 ? (
                <p className="chart-empty">Chưa có dữ liệu social — chạy workflow fetch-competitors lần đầu (nguồn social).</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Thương hiệu</th>
                        <th>YouTube</th>
                        <th>Facebook</th>
                        <th>Cập nhật</th>
                      </tr>
                    </thead>
                    <tbody>
                      {socialByBrand.map((r) => (
                        <tr key={r.brand}>
                          <td>
                            <strong>{r.brand}</strong>
                          </td>
                          <td>
                            {r.youtube ? (
                              r.youtube.status === "success" ? (
                                <>
                                  {r.youtube.channel_name || "—"} — {fmtNum(r.youtube.followers)} subs
                                  {r.youtube.url ? (
                                    <>
                                      {" "}
                                      <a href={r.youtube.url} target="_blank" rel="noreferrer">
                                        Xem ↗
                                      </a>
                                    </>
                                  ) : null}
                                </>
                              ) : (
                                `Trạng thái: ${r.youtube.status}`
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {r.facebook ? (
                              r.facebook.status === "success" ? (
                                <>
                                  {r.facebook.channel_name || "—"} — {fmtNum(r.facebook.followers)} followers
                                </>
                              ) : (
                                `Trạng thái: ${r.facebook.status}`
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {r.youtube?.fetched_at ? String(r.youtube.fetched_at).slice(0, 10) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                    <option value="engagement">Sắp xếp: Tương tác cao nhất</option>
                  </select>
                </div>
              </div>
              <p className="panel-sub">
                Chỉ liệt kê 30 brand trong checklist (mỗi brand 1 dòng, đã gộp Page) — affiliate 1-2 ad vẫn tính trong số tổng của brand.
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
                              {b.isBrandGroup && <span className="muted small"> ({b.pages.length} Page)</span>}
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
