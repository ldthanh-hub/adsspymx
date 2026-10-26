import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { MARKET_LABELS, MARKET_CODES, avatarGradient, initials, facebookUrlFor, useDebouncedValue } from "../lib/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
const TABLE_PAGE = 25;

// DANH SÁCH BRAND ĐANG THEO DÕI (26/10/2026, khớp config/signals.js và config/competitors.js):
// Dashboard mặc định CHỈ hiện 11 brand này (đã gộp Page thành Brand), không phải toàn bộ Page
// đã phát hiện qua từ khóa ngành (Luum, L'Oréal, MAC... là nhiễu đối với mục đích phân tích đối
// thủ của Đăng). Muốn xem tất cả Page thì bấm "Hiện tất cả Page đã phát hiện" ở ô Lọc theo Brand.
// keys: từ khóa dùng cho API creative/trends (không dùng để gộp Page — xem pageMatchesTracked).
// CHECKLIST 30 BRAND (26/10/2026 — Đăng yêu cầu: chỉ cần checklist này là đủ, xóa 2 nút
// chuyển chế độ, dashboard không còn chế độ "xem tất cả Page" nữa):
//   Nhóm A — Brand của Đăng (11, từ 2 file Excel creative SEYOUL + Seyoul): giữ nguyên.
//   Nhóm B — Brand lớn mới (19): US skincare/mỹ phẩm lớn + MX lớn, đã kiểm chứng qua tìm kiếm
//   ngày 26/10/2026 (xem ghi chú ở keywords.js). Brand nào đã có sẵn trong config quét từ trước
//   (Bissú, Ahal, Maybelline, L'Oréal Paris, Avon, M.A.C, Pai Pai, Kosas...) thì KHÔNG thêm
//   vào đây để tránh trùng — chúng vẫn được quét, chỉ không nằm trong checklist Dashboard này
//   vì checklist này là danh sách Đăng chốt để theo dõi tập trung, không phải toàn bộ config quét.
const TRACKED_BRANDS = [
  // Nhóm A — Brand của Đăng
  { name: "Medicube", keys: ["medicube"] },
  { name: "Rejuran", keys: ["rejuran"] },
  { name: "Anua", keys: ["anua"] },
  { name: "VT", keys: ["vt"] },
  { name: "EQQUALBERRY", keys: ["eqqualberry"] },
  { name: "SKIN1004", keys: ["skin1004"] },
  { name: "Dr. Althea", keys: ["dralthea", "dr. althea", "dr althea"] },
  { name: "Eucerin", keys: ["eucerin"] },
  { name: "Round Lab", keys: ["roundlab", "round lab"] },
  { name: "Beauty of Joseon", keys: ["beautyofjoseon", "beauty of joseon"] },
  { name: "Seyoul", keys: ["seyoul"] },
  // Nhóm B — Brand lớn mới, cả MX+US
  { name: "CeraVe", keys: ["cerave"] },
  { name: "La Roche-Posay", keys: ["la roche-posay", "larocheposay"] },
  { name: "Neutrogena", keys: ["neutrogena"] },
  { name: "Cetaphil", keys: ["cetaphil"] },
  { name: "Olay", keys: ["olay"] },
  { name: "Nivea", keys: ["nivea"] },
  { name: "Lancôme", keys: ["lancôme", "lancome"] },
  // Nhóm B — Brand lớn mới, chủ yếu Mỹ
  { name: "The Ordinary", keys: ["the ordinary", "theordinary"] },
  { name: "Clinique", keys: ["clinique"] },
  { name: "Paula's Choice", keys: ["paula's choice", "paulas choice"] },
  { name: "SkinCeuticals", keys: ["skinceuticals"] },
  { name: "Estée Lauder", keys: ["estée lauder", "estee lauder"] },
  { name: "Aveeno", keys: ["aveeno"] },
  { name: "Drunk Elephant", keys: ["drunk elephant", "drunkelephant"] },
  { name: "Glow Recipe", keys: ["glow recipe", "glowrecipe"] },
  // Nhóm B — Brand lớn mới, chủ yếu Mexico
  { name: "Natura", keys: ["natura"] },
  { name: "Arabela", keys: ["arabela"] },
  { name: "Jafra", keys: ["jafra"] },
  { name: "Mary Kay", keys: ["mary kay", "marykay"] },
];

// Gộp Page vào Brand CHỈ theo TÊN PAGE, không theo từ khóa — sửa sau khi kiểm chứng thật
// với API live ngày 26/10/2026: nếu gộp theo từ khóa thì Page "Amazon México Belleza" (23 ad,
// chỉ vì 1 ad trong đó nhắc tới Seyoul nên keywords chứa "Seyoul") sẽ bị tính vào Brand Seyoul,
// và cùng 1 Page sẽ bị tính vào nhiều Brand khác nhau, làm tổng ad bị thổi phồng và sai.
// Quy tắc đúng: Page thuộc Brand khi tên Page chứa tên Brand (chuẩn hóa bỏ khoảng trắng/dấu
// chấm/gạch dưới, VD "Dr.Althea" vẫn khớp "Dr. Althea", "Beauty of Joseon" khớp
// "beautyofjoseon"). Affiliate dạng "X with Brand" cũng khớp vì tên đã chứa tên Brand.
// VT là ngoại lệ: phải khớp theo từ độc lập (\bvt\b) hoặc bắt đầu bằng "VT", vì "vt" có thể
// xuất hiện trong từ khác khi chuẩn hóa bỏ khoảng trắng.
function pageMatchesTracked(page, tracked) {
  const name = String(page.page_name || "");
  // VT, Natura, Olay: khớp theo TỪ độc lập — "Naturales" không được tính là "Natura",
  // "VT" không được tính khi nằm trong từ khác.
  if (tracked.name === "VT") {
    return /\bvt\b/i.test(name) || /^vt[\s_\-]/i.test(name) || name.trim().toLowerCase() === "vt";
  }
  if (tracked.name === "Natura" || tracked.name === "Olay") {
    return new RegExp(`\\b${tracked.name}\\b`, "i").test(name);
  }
  const norm = (s) => String(s).toLowerCase().replace(/[\s._\-]+/g, "");
  return norm(name).includes(norm(tracked.name));
}

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
  // Tín hiệu ngoài Meta — fetch riêng, lỗi ở đây KHÔNG được làm hỏng dashboard Meta chính:
  // backend cũ chưa có endpoint /api/signals/* sẽ trả 404, frontend bắt và hiện "Chưa có dữ liệu".
  const [websiteData, setWebsiteData] = useState([]);
  const [socialData, setSocialData] = useState([]);
  const [creativeData, setCreativeData] = useState({ angles: [], offers: [], examples: [] });
  const [tiktokSignals, setTiktokSignals] = useState([]);
  const [mercadoSignals, setMercadoSignals] = useState([]);
  const [trendsSignals, setTrendsSignals] = useState([]);
  const [signalRuns, setSignalRuns] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null); // tên Brand đang LỌC toàn bộ dashboard (null = tất cả brand)

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
        load("/api/signals/mercado", setMercadoSignals),
        load("/api/signals/trends", setTrendsSignals),
        load("/api/signals/runs", setSignalRuns),
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

  // Đổi brand đang lọc thì quay lại trang đầu của bảng (tránh trường hợp bảng đã lọc chỉ
  // còn vài dòng mà visibleCount đang ở mức cao, nút Xem thêm hiện sai).
  useEffect(() => {
    setVisibleCount(TABLE_PAGE);
  }, [selectedBrand]);

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
    () => brandStats.filter((page) => TRACKED_BRANDS.some((tb) => pageMatchesTracked(page, tb))),
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

  // Social: gom theo brand -> { youtube, facebook, instagram } để vẽ 1 dòng / brand.
  const socialByBrand = useMemo(() => {
    const map = new Map();
    for (const r of socialData) {
      if (!signalMatchesFilter(r.brand)) continue;
      if (!map.has(r.brand)) map.set(r.brand, { brand: r.brand });
      map.get(r.brand)[r.source] = r;
    }
    return [...map.values()].sort((a, b) => a.brand.localeCompare(b.brand));
  }, [socialData, selectedBrand, selectedRow]);


  // Mercado: gom listing theo brand — tổng đã bán chỉ tính các listing có sold_quantity,
  // listing không parse được số bán thì không cộng vào (không đoán), giá lấy min/max có thật.
  const mercadoSummary = useMemo(() => {
    const map = new Map();
    for (const row of mercadoSignals.filter((r) => signalMatchesFilter(r.brand))) {
      const prev = map.get(row.brand) || {
        brand: row.brand,
        count: 0,
        totalSold: 0,
        soldKnown: 0,
        minPrice: null,
        maxPrice: null,
        top: null,
        fetched_at: row.fetched_at,
      };
      prev.count += 1;
      if (row.sold_quantity != null) {
        prev.totalSold += Number(row.sold_quantity);
        prev.soldKnown += 1;
        if (!prev.top || Number(row.sold_quantity) > Number(prev.top.sold_quantity)) prev.top = row;
      }
      if (row.price != null) {
        prev.minPrice = prev.minPrice == null ? Number(row.price) : Math.min(prev.minPrice, Number(row.price));
        prev.maxPrice = prev.maxPrice == null ? Number(row.price) : Math.max(prev.maxPrice, Number(row.price));
      }
      if (row.fetched_at > prev.fetched_at) prev.fetched_at = row.fetched_at;
      map.set(row.brand, prev);
    }
    return [...map.values()].sort((a, b) => b.totalSold - a.totalSold);
  }, [mercadoSignals, selectedBrand, selectedRow]);

  // Trạng thái chạy gần nhất theo nguồn — để panel hiện đúng "đang chạy tốt / bị chặn / lỗi"
  // thay vì im lặng khi không có số.
  const runStatusBySource = useMemo(() => {
    const map = {};
    for (const r of signalRuns) {
      if (!map[r.source] || (r.finished_at || "") > (map[r.source].finished_at || "")) map[r.source] = r;
    }
    return map;
  }, [signalRuns]);

  const mercadoBlocked = useMemo(
    () => signalRuns.filter((r) => r.source === "mercado" && (r.status === "blocked" || r.status === "error")),
    [signalRuns]
  );

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
                Trang này CHỈ hiện checklist 30 brand (11 brand của Đăng + 19 brand mỹ phẩm/chăm sóc
                da lớn tại Mỹ và Mexico, chốt ngày 26/10/2026), mỗi brand là 1 dòng duy nhất đã gộp
                tất cả Page của brand đó (VD Seyoul Mexico + Seyoul MX + Seyoul Cosméticos gộp thành
                1 dòng "Seyoul") — không còn kéo hết hàng trăm Page phát hiện qua từ khóa ngành
                như Luum, MAC. Chọn 1 brand thì TOÀN BỘ số liệu trên trang này chỉ tính cho brand
                đó: thẻ thống kê, biểu đồ xu hướng, Top 10, bảng tương tác, affiliate, bảng danh
                sách và cả 3 panel tín hiệu Google / Mercado / TikTok. Bấm tên brand trong bất kỳ
                bảng nào cũng lọc giống vậy.
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
                {selectedBrand && (
                  <span className="muted small" style={{ alignSelf: "center" }}>
                    Đang lọc: <strong>{selectedBrand}</strong> —{" "}
                    {selectedRow && selectedRow.isBrandGroup
                      ? `${selectedRow.pages.length} Page thuộc brand này, `
                      : `${filteredBrandStats.length} Page thuộc brand này, `}
                    {totals.totalAds} ad.
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
              <h3>Tín hiệu ngoài Meta — Google, Mercado Libre, TikTok</h3>
              <p className="panel-sub">
                3 nguồn này có đơn vị và độ tin cậy RIÊNG, không cộng chung với số Meta ở trên.
                Dữ liệu do job fetch-signals kéo 1 lần/ngày (GitHub Actions, 08:00 giờ Mexico),
                không phải realtime. Chưa có dữ liệu nghĩa là job chưa chạy lần nào — vào GitHub
                repo, tab Actions, workflow "Fetch tín hiệu ngoài Meta", bấm Run workflow để kéo lần đầu.
              </p>

              <h4 style={{ margin: "16px 0 6px", fontSize: 13 }}>TikTok — lượt xem hashtag tích lũy</h4>
              <p className="panel-sub">
                Nguồn: TikWM challenge/info, không cần key, đã kiểm chứng thật ngày 26/10/2026.
                Đây là lượt xem hashtag CỘNG DỒN từ trước tới nay, không phải lượt xem trong 1 ngày —
                muốn thấy tăng trưởng thì so snapshot hôm nay với hôm trước. VT dùng hashtag
                "vtcosmetics", Round Lab dùng "roundlabskincare" (xem ghi chú trong config/signals.js).
              </p>
              {tiktokSorted.length === 0 ? (
                <p className="chart-empty">
                  {selectedBrand && tiktokSignals.length > 0
                    ? "Brand đang lọc chưa có trong danh sách tín hiệu 11 brand (TikTok chỉ theo dõi 10 đối thủ + Seyoul)."
                    : "Chưa có dữ liệu TikTok — chạy workflow fetch-signals lần đầu."}
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Thương hiệu</th>
                        <th>Hashtag</th>
                        <th>Lượt xem hashtag</th>
                        <th>Số creator</th>
                        <th>Cập nhật</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiktokSorted.map((r) => (
                        <tr key={r.brand}>
                          <td>
                            <strong>{r.brand}</strong>
                          </td>
                          <td>#{r.hashtag}</td>
                          <td>{fmtNum(r.view_count)}</td>
                          <td>{fmtNum(r.user_count)}</td>
                          <td>{r.fetched_at ? String(r.fetched_at).slice(0, 10) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4 style={{ margin: "20px 0 6px", fontSize: 13 }}>Mercado Libre Mexico — listing và số đã bán</h4>
              <p className="panel-sub">
                Nguồn: Mercado Libre Mexico (site MLM). Số đã bán là sold_quantity tích lũy của từng
                listing, không phải doanh thu và không phải tổng bán của cả brand (1 brand có nhiều
                listing trùng sản phẩm). TÌNH TRẠNG THẬT ngày 26/10/2026: API Mercado chặn IP máy chủ
                (403), và trang web Mercado chặn bot bằng tường captcha reCAPTCHA (kiểm chứng thật
                bằng trình duyệt live: mở listado.mercadolibre.com.mx/medicube là bị chuyển sang
                trang "Seguridad — Mercado Libre", phải tích "No soy un robot" mới thấy 1.790 kết
                quả) — job tự động KHÔNG tự giải captcha được, nên bảng này sẽ trống và trạng thái
                ghi rõ là captcha, không bịa số. Xem trực tiếp tại listado.mercadolibre.com.mx và
                gõ tên brand vào ô tìm kiếm để xem giá/listing trong lúc chờ đường lấy số hợp lệ khác.
              </p>
              {mercadoBlocked.length > 0 && (
                <p className="panel-sub" style={{ color: "#c0392b" }}>
                  Mercado đang bị chặn/lỗi ở các brand:{" "}
                  {mercadoBlocked.map((r) => `${r.brand} (${r.status})`).join(", ")}. Các brand còn lại
                  (nếu có số) vẫn hiện bình thường.
                </p>
              )}
              {mercadoSummary.length === 0 ? (
                <p className="chart-empty">
                  {selectedBrand && mercadoSignals.length > 0
                    ? "Brand đang lọc chưa có trong danh sách tín hiệu 11 brand (Mercado chỉ theo dõi 10 đối thủ + Seyoul)."
                    : "Chưa có dữ liệu Mercado — chạy workflow fetch-signals lần đầu. Trong lúc chờ, xem trực tiếp tại listado.mercadolibre.com.mx và gõ tên brand vào ô tìm kiếm."}
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Thương hiệu</th>
                        <th>Số listing</th>
                        <th>Tổng đã bán (listing có số)</th>
                        <th>Khoảng giá (MX$)</th>
                        <th>Listing bán chạy nhất</th>
                        <th>Cập nhật</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mercadoSummary.map((r) => (
                        <tr key={r.brand}>
                          <td>
                            <strong>{r.brand}</strong>
                          </td>
                          <td>{r.count}</td>
                          <td>
                            {fmtNum(r.totalSold)} <span className="muted small">({r.soldKnown}/{r.count} listing có số)</span>
                          </td>
                          <td>
                            {r.minPrice == null ? "—" : `${fmtNum(r.minPrice)} - ${fmtNum(r.maxPrice)}`}
                          </td>
                          <td>
                            {r.top ? (
                              <a href={r.top.permalink} target="_blank" rel="noreferrer">
                                {r.top.title ? r.top.title.slice(0, 60) : "Xem"} ({fmtNum(r.top.sold_quantity)} đã bán)
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{r.fetched_at ? String(r.fetched_at).slice(0, 10) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4 style={{ margin: "20px 0 6px", fontSize: 13 }}>Google Trends Mexico — chỉ số quan tâm tương đối, 90 ngày</h4>
              <p className="panel-sub">
                Chỉ số 0-100 được chuẩn hóa RIÊNG cho từng brand (100 là tuần/ngày cao nhất của chính
                brand đó trong 90 ngày), không phải số lượt tìm kiếm tuyệt đối, và không so sánh trực
                tiếp chỉ số trung bình giữa các brand với nhau. Đọc đúng cách: xem chỉ số gần nhất so
                với trung bình của chính brand đó (đang lên hay đang xuống), và xem đỉnh 100 rơi vào
                ngày nào trong chuỗi điểm của brand đó.
              </p>
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
                3 panel dưới đây là dữ liệu MỚI, tách riêng khỏi số Meta và tín hiệu Google /
                Mercado / TikTok ở trên. Dữ liệu do job fetch-competitors kéo 1 lần/ngày (GitHub
                Actions, 09:00 giờ Mexico), không phải realtime. Chưa có dữ liệu nghĩa là job chưa
                chạy lần nào — vào GitHub repo, tab Actions, workflow "Fetch đối thủ mở rộng",
                bấm Run workflow để kéo lần đầu.
                {selectedBrand && " Đang lọc theo brand đang chọn ở đầu trang."}
              </p>

              <h4 style={{ margin: "16px 0 6px", fontSize: 13 }}>Website chính — giá + offer</h4>
              <p className="panel-sub">
                <strong>Đọc panel này để làm gì:</strong> xem đối thủ ĐANG BÁN với offer nào ngay
                hôm nay để so với offer của Seyoul — ví dụ Round Lab đang "20% off toàn shop cuối
                tuần + miễn phí vận chuyển từ $25", SKIN1004 đang "giảm tới 50% + tặng merch" (đợt
                xả hàng, không phải giá thường xuyên), Beauty of Joseon "miễn phí vận chuyển từ $70
                + tích điểm đổi quà". Nếu đối thủ đang giảm sâu mà Seyoul giữ nguyên giá thì đó là
                lý do khách so sánh và chần chừ — còn nếu đối thủ không có khuyến mãi rõ ràng thì
                Seyoul không cần đua giảm giá, chỉ cần nhấn góc bán khác biệt.
              </p>
              <p className="panel-sub">
                Job mở website chính thức của từng brand bằng trình duyệt thật, trích nguyên văn
                các dòng khuyến mãi tìm thấy và tối đa 20 sản phẩm đầu tiên parse được giá. Giá
                thấp - cao chỉ tính trên các sản phẩm parse được, không phải toàn shop. <strong>Giới
                hạn cần biết:</strong> job chỉ đọc TRANG CHỦ — brand nào để khuyến mãi ở trang
                shop / trang khuyến mãi riêng mà trang chủ không ghi thì sẽ hiện "Không tìm thấy
                dòng khuyến mãi rõ ràng", không phải là brand đó không có khuyến mãi. Trang nào
                không mở được thì cột Trạng thái ghi rõ lý do ngắn gọn (lỗi SSL, kết nối bị đóng,
                bị chặn), không hiện log kỹ thuật dài trong cột Promo nữa.
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
                Phân loại bằng từ khóa cố định trên nội dung ad đã có trong DB (không gọi AI cho
                mọi ad, nên chạy được ngay, không tốn tiền). Một ad có thể thuộc nhiều góc và nhiều
                offer cùng lúc, nên tổng số ad theo góc sẽ lớn hơn tổng ad thật — đừng cộng các
                dòng lại. AI tóm tắt (Pollinations miễn phí, DeepSeek đang hết số dư nên không dùng)
                chỉ làm cho tối đa 10 ad bền nhất đang chạy, nếu AI lỗi thì phần đó để trống nhưng
                số liệu rule vẫn đầy đủ.
                {selectedBrand && " Bảng này đã lọc theo brand đang chọn."}
              </p>
              {creativeData.angles.length === 0 && creativeData.offers.length === 0 ? (
                <p className="chart-empty">Chưa có dữ liệu creative — chạy workflow fetch-competitors lần đầu (nguồn creative).</p>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Góc bán</th>
                          <th>Tổng ad</th>
                          <th>Đang chạy</th>
                          <th>Bền nhất (ngày)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creativeData.angles.map((r) => (
                          <tr key={r.angle}>
                            <td>{CREATIVE_LABELS[r.angle] || r.angle}</td>
                            <td>{r.total_ads}</td>
                            <td>{r.active_ads}</td>
                            <td>{r.max_days_active ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-wrap" style={{ marginTop: 12 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Offer</th>
                          <th>Tổng ad</th>
                          <th>Đang chạy</th>
                          <th>Bền nhất (ngày)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creativeData.offers.map((r) => (
                          <tr key={r.offer}>
                            <td>{CREATIVE_LABELS[r.offer] || r.offer}</td>
                            <td>{r.total_ads}</td>
                            <td>{r.active_ads}</td>
                            <td>{r.max_days_active ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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

              <h4 style={{ margin: "20px 0 6px", fontSize: 13 }}>Social — YouTube + Facebook + Instagram</h4>
              <p className="panel-sub">
                YouTube: có key API (GitHub secret YOUTUBE_API_KEY, anh tự tạo trên Google Cloud)
                thì dùng API chính thức, không có key thì tìm kênh bằng trang kết quả tìm kiếm
                YouTube qua trình duyệt thật — nếu YouTube chặn bot thì trạng thái ghi blocked.
                Facebook: lấy Page có nhiều ad nhất của brand từ chính bảng ads, không đoán slug.
                Instagram: chưa cấu hình handle chính thức cho brand nào nên hiện tại ghi
                not_configured — anh gửi handle IG chính thức là thêm vào config là chạy được.
                Số followers/subscribers ở đây là số công khai tại thời điểm job chạy, không phải
                số realtime.
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
                        <th>Instagram</th>
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
                            {r.instagram ? `Trạng thái: ${r.instagram.status} (chưa cấu hình handle)` : "—"}
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
                Bảng này CHỈ liệt kê 30 brand trong checklist (mỗi brand 1 dòng, đã gộp Page) —
                không phải toàn bộ Page đã phát hiện. Ngành hàng gắn cứng theo cấu hình từ khóa/thương
                hiệu (server/src/config/keywords.js), không suy đoán bằng cách so chuỗi tên. Danh sách
                đầy đủ, không lọc số ad tối thiểu — affiliate 1-2 ad vẫn hiện trong số tổng của brand.
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
