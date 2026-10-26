import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Dropdown from "../components/Dropdown";
import {
  MARKET_LABELS,
  MARKET_CODES,
  CHECKLIST_BRANDS,
  pageMatchesTracked,
  isCosmeticsOrUnknownPage,
  MEDIA_TYPE_LABELS,
  industryLabelVi,
  guessCategory,
  avatarGradient,
  initials,
  formatRelativeDate,
  enduranceTier,
  facebookUrlFor,
  useDebouncedValue,
} from "../lib/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
const PAGE_SIZE = 60;

// Link thẳng tới trang chạy workflow "Quét 1 từ khóa theo yêu cầu" trên GitHub — xem README mục
// cùng tên để có hướng dẫn từng bước. Đổi lại URL này nếu sau này đổi tên/chuyển repo.
const SCAN_WORKFLOW_URL = "https://github.com/ldthanh-hub/adsspymx/actions/workflows/fetch-oneoff.yml";
// Thu hẹp 26/10/2026: chỉ còn "Mỹ phẩm & Làm đẹp" — đồng bộ với keywords.js (đã gỡ "Thời trang").
const SCAN_CATEGORIES = ["Mỹ phẩm & Làm đẹp"];

export default function Home() {
  const router = useRouter();

  const [ads, setAds] = useState([]);
  const [keywordStats, setKeywordStats] = useState([]);
  const [brandStats, setBrandStats] = useState([]);
  // allBrandStats: Page KHÔNG lọc category (khác brandStats vẫn lọc mỹ phẩm như cũ) — nguồn
  // duy nhất để tính danh sách Page thuộc checklist (Page quét từ khóa brand chưa có category,
  // VD Medicube, chỉ có ở đây). statsLoaded báo fetchStats đã chạy xong để fetchAds ở chế độ
  // khóa checklist không gọi API khi chưa có danh sách Page.
  const [allBrandStats, setAllBrandStats] = useState([]);
  const [statsLoaded, setStatsLoaded] = useState(false);
  // Khóa tab Quảng cáo về checklist 30 brand (Đăng yêu cầu 26/10/2026) — mặc định BẬT: danh
  // sách thường chỉ hiện ad của Page thuộc checklist, bấm "Tất cả ad" mới xem toàn bộ.
  const [checklistOnly, setChecklistOnly] = useState(true);

  const [selectedKeywords, setSelectedKeywords] = useState(new Set());
  const [selectedBrands, setSelectedBrands] = useState(new Set());
  const [brandFilterText, setBrandFilterText] = useState("");
  const [showAllBrands, setShowAllBrands] = useState(false);

  const [statusFilter, setStatusFilter] = useState("active"); // active | inactive | all
  const [countryFilter, setCountryFilter] = useState(""); // "" = tất cả thị trường CÒN LẠI (MX+US) | "MX" | "US" — từ 26/10/2026 không còn nghĩa là gộp KR/TH/MY nữa
  const [mediaTypeFilter, setMediaTypeFilter] = useState(""); // "" = tất cả | "video" | "image"
  const [contentSearch, setContentSearch] = useState(""); // tìm trong nội dung quảng cáo (q)
  // Tìm thương hiệu theo tên (Đăng yêu cầu 26/10/2026): hiện ĐẦY ĐỦ ad liên quan — ad của brand
  // chính + ad affiliate/influencer nhắc tới brand — chứ không chỉ ad của 1 Page khớp chính xác.
  // brandSearch là giá trị ĐÃ áp dụng (khác brandSearchInput là ô đang gõ), để tránh gọi API
  // mỗi lần gõ 1 ký tự. Khi brandSearch có giá trị, fetchAds dùng tham số brand của backend và
  // BỎ lọc category + bỏ chọn ngành hàng/thương hiệu trong dropdown (vì lọc AND với chúng sẽ
  // thu hẹp lại đúng cái cần tránh), đồng thời bypass ngưỡng >=5 ad của dropdown Thương hiệu.
  const [brandSearchInput, setBrandSearchInput] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const debouncedContentSearch = useDebouncedValue(contentSearch, 400);

  // Panel "Yêu cầu quét từ khóa mới" (hiện khi search không ra kết quả) — xem khối JSX phía dưới.
  const [scanCountry, setScanCountry] = useState(""); // "" = chưa chỉnh tay, dùng countryFilter hiện tại làm mặc định
  const [scanCategory, setScanCategory] = useState(""); // "" = để hệ thống tự đoán (xem guessCategory)
  const [copyFeedback, setCopyFeedback] = useState("");
  // Đổi từ khóa tìm kiếm thì reset lựa chọn ngành hàng đã chỉnh tay — tránh giữ nhầm lựa chọn của
  // từ khóa CŨ sang từ khóa MỚI (mỗi từ khóa nên tự đoán lại từ đầu, không kế thừa lựa chọn cũ).
  useEffect(() => {
    setScanCategory("");
  }, [contentSearch]);
  const [sortMode, setSortMode] = useState("endurance"); // endurance | newest

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const offsetRef = useRef(0);

  // Đọc ?brand=X trên URL (đến từ trang Dashboard khi bấm "Xem quảng cáo") để preset sẵn bộ lọc
  // thương hiệu — chỉ áp dụng 1 lần khi router đã sẵn sàng, tránh ghi đè lựa chọn của user sau đó.
  const appliedBrandFromUrl = useRef(false);
  useEffect(() => {
    if (!router.isReady || appliedBrandFromUrl.current) return;
    appliedBrandFromUrl.current = true;
    const brandParam = router.query.brand;
    if (brandParam) {
      setSelectedBrands(new Set([String(brandParam)]));
    }
  }, [router.isReady, router.query.brand]);

  // Danh sách Page thuộc checklist 30 brand — cùng logic gộp với Dashboard (khớp tên Page +
  // giữ Page chưa có category hoặc có category mỹ phẩm, loại Page xếp rõ sang ngành khác).
  // Nguồn ưu tiên allBrandStats (không lọc category); nếu lần gọi đó lỗi thì rớt về brandStats
  // (lọc mỹ phẩm — vẫn đủ 17 brand đã hiện, chỉ thiếu Page chưa có category như Medicube).
  // Đặt TRƯỚC fetchAds vì fetchAds dùng nó trong deps array (deps được tính ngay khi render,
  // khai báo sau fetchAds sẽ lỗi "Cannot access before initialization" lúc build).
  const checklistPages = useMemo(() => {
    const source = allBrandStats.length ? allBrandStats : brandStats;
    return source.filter(
      (b) => isCosmeticsOrUnknownPage(b) && CHECKLIST_BRANDS.some((tb) => pageMatchesTracked(b, tb))
    );
  }, [allBrandStats, brandStats]);

  const fetchStats = useCallback(async () => {
    if (!API_BASE) return;
    try {
      // Mặc định scope MX+US + Mỹ phẩm & Làm đẹp (không truyền = backend gộp tất cả thị trường
      // và ngành cũ trong DB, chính là lý do dropdown trước đây vẫn hiện 24 từ khóa gồm cả từ
      // Hàn/Thái/Mã Lai và brand Thời trang). Khi chọn riêng MX hoặc US thì scope đúng thị trường đó.
      // Gọi riêng từng thị trường rồi gộp ở client thay vì gọi 1 lần country=MX,US — vì backend
      // cũ (trước khi Render deploy bản mới hỗ trợ country list) sẽ coi "MX,US" là 1 chuỗi duy
      // nhất và trả về rỗng; gọi riêng thì đúng cả backend cũ lẫn mới, không bị trống sidebar
      // trong khoảng Render đang deploy.
      const countries = countryFilter ? [countryFilter] : ["MX", "US"];
      const cat = encodeURIComponent("Mỹ phẩm & Làm đẹp");
      const kwLists = [];
      const brandLists = [];
      const allBrandLists = [];
      for (const c of countries) {
        const suffix = `?country=${encodeURIComponent(c)}&category=${cat}`;
        const [kwRes, brandRes, allBrandRes] = await Promise.all([
          fetch(`${API_BASE}/api/keywords${suffix}`),
          fetch(`${API_BASE}/api/brands${suffix}`),
          // Riêng danh sách Page checklist KHÔNG lọc category (26/10/2026 — sửa lỗi Medicube):
          // Page quét từ khóa brand chưa có category sẽ không bao giờ lọt vào brandLists trên.
          fetch(`${API_BASE}/api/brands?country=${encodeURIComponent(c)}`),
        ]);
        // Backend cũ chưa có tham số category (zod sẽ bỏ qua key lạ) nên vẫn trả đủ dữ liệu —
        // lọc Mỹ phẩm & Làm đẹp và gộp ở dưới sẽ xử lý nốt, không phụ thuộc vào backend mới.
        if (kwRes.ok) kwLists.push((await kwRes.json()).data || []);
        if (brandRes.ok) brandLists.push((await brandRes.json()).data || []);
        if (allBrandRes.ok) allBrandLists.push((await allBrandRes.json()).data || []);
      }
      const kwMap = new Map();
      for (const list of kwLists)
        for (const k of list) {
          if (k.type !== "industry" || k.category !== "Mỹ phẩm & Làm đẹp") continue;
          const prev = kwMap.get(k.keyword);
          if (prev) {
            prev.total = String(Number(prev.total) + Number(k.total));
            prev.active = String(Number(prev.active) + Number(k.active));
          } else kwMap.set(k.keyword, { ...k });
        }
      setKeywordStats([...kwMap.values()].sort((a, b) => Number(b.total) - Number(a.total)));
      const brandMap = new Map();
      for (const list of brandLists)
        for (const b of list) {
          const prev = brandMap.get(b.page_name);
          if (prev) {
            prev.total = String(Number(prev.total) + Number(b.total));
            prev.active = String(Number(prev.active) + Number(b.active));
            prev.categories = [...new Set([...(prev.categories || []), ...(b.categories || [])])];
          } else brandMap.set(b.page_name, { ...b });
        }
      setBrandStats([...brandMap.values()].sort((a, b) => Number(b.total) - Number(a.total)));
      // Gộp danh sách Page không lọc category giống cách gộp brandMap ở trên (cùng Page ở 2
      // thị trường thì cộng dồn ad + hợp categories) — nguồn tính checklistPages ở dưới.
      const allBrandMap = new Map();
      for (const list of allBrandLists)
        for (const b of list) {
          const prev = allBrandMap.get(b.page_name);
          if (prev) {
            prev.total = String(Number(prev.total) + Number(b.total));
            prev.active = String(Number(prev.active) + Number(b.active));
            prev.categories = [...new Set([...(prev.categories || []), ...(b.categories || [])])];
          } else allBrandMap.set(b.page_name, { ...b });
        }
      setAllBrandStats([...allBrandMap.values()].sort((a, b) => Number(b.total) - Number(a.total)));
    } catch {
      /* sidebar stats không critical — im lặng bỏ qua, bảng chính vẫn hoạt động */
    }
    setStatsLoaded(true);
  }, [countryFilter]);

  const fetchAds = useCallback(
    async (offset) => {
      if (!API_BASE) {
        setError("Chưa cấu hình NEXT_PUBLIC_API_BASE — xem web/.env.example");
        return;
      }
      // Chế độ khóa checklist chưa có danh sách Page thì chưa gọi API — fetchStats xong sẽ
      // đổi statsLoaded/checklistPages, fetchAds đổi theo và effect dưới tự gọi lại.
      if (!brandSearch && checklistOnly && !statsLoaded) return;
      const isFirstPage = offset === 0;
      isFirstPage ? setLoading(true) : setLoadingMore(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (brandSearch) {
          params.set("brand", brandSearch);
          // Không gửi category khi tìm brand: ad cũ có category trống (VD Medicube quét tay
          // 16/09, category None) vẫn phải hiện, và ad affiliate cũng có thể không gắn category
          // mỹ phẩm. Vẫn giữ lọc quốc gia + trạng thái + loại nội dung ở dưới.
        } else if (checklistOnly) {
          // Khóa tab về checklist 30 brand: chỉ hiện ad của Page thuộc checklist, lọc bằng
          // page_names CHÍNH XÁC (khác brandSearch khớp chuỗi rộng) để phân trang vẫn đúng
          // phía server. Không gửi category — giống đường brandSearch — để ad chưa gắn
          // category (VD Medicube) vẫn hiện. Từ khoá ngành + tìm nội dung vẫn AND thêm được.
          let names = checklistPages.map((p) => p.page_name);
          if (selectedBrands.size) names = names.filter((n) => selectedBrands.has(n));
          if (!names.length) {
            setAds([]);
            setHasMore(false);
            offsetRef.current = 0;
            return;
          }
          params.set("page_names", names.join(","));
          if (selectedKeywords.size) params.set("keyword", Array.from(selectedKeywords).join(","));
          if (debouncedContentSearch) params.set("q", debouncedContentSearch);
        } else {
          if (selectedKeywords.size) params.set("keyword", Array.from(selectedKeywords).join(","));
          if (selectedBrands.size) params.set("page_names", Array.from(selectedBrands).join(","));
          if (debouncedContentSearch) params.set("q", debouncedContentSearch);
          params.set("category", "Mỹ phẩm & Làm đẹp");
        }
        params.set("country", countryFilter || "MX,US");
        if (mediaTypeFilter) params.set("media_type", mediaTypeFilter);
        if (statusFilter === "active") params.set("active_only", "true");
        else if (statusFilter === "inactive") params.set("active_only", "false");
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
    [selectedKeywords, selectedBrands, debouncedContentSearch, statusFilter, countryFilter, mediaTypeFilter, brandSearch, checklistOnly, checklistPages, statsLoaded]
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    offsetRef.current = 0;
    fetchAds(0);
  }, [fetchAds]);

  const submitBrandSearch = () => {
    const value = brandSearchInput.trim();
    if (!value) return;
    setBrandSearch(value);
    // Hiện đầy đủ ad liên quan nên mặc định chuyển trạng thái sang "Tất cả" (cả đang chạy và
    // đã dừng) — nếu giữ mặc định "Đang chạy" thì các ad cũ như Medicube (30 ad, 0 ad đang chạy
    // ở MX/US) sẽ hiện ra 0 kết quả dù DB có đủ ad. User vẫn chỉnh lại trạng thái sau đó nếu muốn.
    setStatusFilter("all");
    // Xóa chọn dropdown để không AND với brand search (xem ghi chú ở fetchAds).
    setSelectedBrands(new Set());
    setSelectedKeywords(new Set());
  };
  const clearBrandSearch = () => {
    setBrandSearch("");
    setBrandSearchInput("");
  };

  // Đồng bộ Brand với Dashboard (26/10/2026 — Đăng yêu cầu): bấm 1 brand trong checklist 30
  // (dùng chung CHECKLIST_BRANDS ở web/lib/ui.js với Dashboard, sửa 1 chỗ là cả 2 tab cùng đổi)
  // thì tab Quảng cáo lọc đúng brand đó, cơ chế y hệt ô "Tìm thương hiệu" — dùng tên brand làm
  // từ khóa tìm (backend khớp OR theo tên Page / nội dung ad / từ khóa quét), hiện cả ad brand
  // chính + affiliate, trạng thái chuyển sang Tất cả, xóa chọn dropdown Thương hiệu + Từ khoá
  // để không AND nhầm. Brand "VT" tìm theo tên sẽ khớp rộng (chuỗi "vt" nằm trong nhiều từ khác)
  // — đó là giới hạn sẵn có của cơ chế tìm brand theo chuỗi, không phải lỗi của dropdown này.
  const selectChecklistBrand = (brand) => {
    setBrandSearchInput(brand.name);
    setBrandSearch(brand.name);
    setStatusFilter("all");
    setSelectedBrands(new Set());
    setSelectedKeywords(new Set());
  };

  const refreshAll = () => {
    fetchStats();
    offsetRef.current = 0;
    fetchAds(0);
  };

  const toggleKeyword = (kw) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      next.has(kw) ? next.delete(kw) : next.add(kw);
      return next;
    });
  };
  const toggleBrand = (name) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
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
    return { totalAds, totalActive, brandCount: brandStats.length };
  }, [keywordStats, brandStats]);

  const lastUpdated = useMemo(() => {
    let max = null;
    for (const ad of ads) {
      if (ad.last_seen_at && (!max || ad.last_seen_at > max)) max = ad.last_seen_at;
    }
    return formatRelativeDate(max);
  }, [ads]);

  // Chỉ hiển thị các ngành hàng đang THEO DÕI (SCAN_CATEGORIES) trong bộ lọc "Từ khoá" (đổi tên
  // từ "Ngành hàng" ngày 26/10/2026 vì dropdown này liệt kê cả từ khóa ngành lẫn từ khóa brand,
  // gọi là Ngành hàng gây hiểu nhầm là chỉ lọc ngành) — lọc bỏ
  // những category đã gỡ khỏi keywords.js (VD "Đồ gia dụng") nhưng vẫn còn thấy ở đây vì ads CŨ quét
  // trước đó chưa bị xoá khỏi DB (gỡ khỏi danh sách theo dõi chỉ ngừng quét thêm, không xoá dữ liệu
  // đã có — xem ghi chú trong config/keywords.js). Đây là lọc HIỂN THỊ thuần frontend, không cần
  // chạy lại workflow quét nào để thấy hiệu lực — ads "Đồ gia dụng" cũ (nếu có) vẫn xem được bình
  // thường qua bộ lọc Thương hiệu/tìm kiếm nội dung, chỉ không còn là 1 lựa chọn trong "Ngành hàng".
  const ACTIVE_INDUSTRY_CATEGORIES = new Set(SCAN_CATEGORIES);
  const industryItems = keywordStats.filter((k) => k.type === "industry" && ACTIVE_INDUSTRY_CATEGORIES.has(k.category));

  // Nhóm các từ khóa ngành hàng theo category để hiển thị có sub-header trong dropdown "Ngành hàng"
  // (trước đây hiển thị 1 danh sách phẳng, khó phân biệt từ khóa nào thuộc ngành nào khi số lượng
  // từ khóa tăng lên sau khi thêm nhiều thị trường). Trong mỗi nhóm vẫn sắp xếp theo total giảm dần
  // (industryItems đã được server trả về ORDER BY total DESC).
  const industryGroups = useMemo(() => {
    const groups = new Map();
    for (const k of industryItems) {
      const cat = k.category || "Khác";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(k);
    }
    const order = [...SCAN_CATEGORIES, "Khác"];
    return [...groups.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    });
  }, [industryItems]);

  const visibleBrands = useMemo(() => {
    const text = brandFilterText.trim().toLowerCase();
    // Khi khóa về checklist thì dropdown Thương hiệu cũng chỉ liệt kê Page thuộc checklist
    // (để không chọn lọt Page ngoài checklist rồi phá khóa); khi mở khóa thì giữ logic cũ:
    // chỉ liệt kê Page thuần Mỹ phẩm & Làm đẹp: loại Page có category lẫn Thời trang
    // (VD SHEIN Mexico có cả 2 category trong DB, nên dù backend đã lọc ad theo category thì
    // Page đó vẫn lọt vào danh sách nếu chỉ lọc theo categories.includes). Page không có
    // categories (dữ liệu cũ hiếm) thì giữ lại để không mất brand thật.
    // Không áp ngưỡng số ad ở sidebar (Đăng đính chính 26/10/2026): affiliate chỉ có 1-2 ad
    // vẫn phải hiện, vì mục tiêu là khai thác tối đa brand đối thủ. Chỉ lọc thuần mỹ phẩm như cũ.
    // Muốn tìm nhanh 1 brand cụ thể thì dùng ô "Tìm thương hiệu" ở dưới thanh lọc.
    let list = checklistOnly
      ? checklistPages
      : brandStats.filter(
          (b) => !b.categories || b.categories.length === 0 || (b.categories.length === 1 && b.categories[0] === "Mỹ phẩm & Làm đẹp")
        );
    if (text) list = list.filter((b) => b.page_name.toLowerCase().includes(text));
    return showAllBrands || text ? list : list.slice(0, 30);
  }, [brandStats, brandFilterText, showAllBrands, checklistOnly, checklistPages]);

  return (
    <Layout
      active="ads"
      headerRight={
        <>
          <div className="search-wrap">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              placeholder="Tìm trong nội dung quảng cáo (VD: descuento, envío gratis...)"
              value={contentSearch}
              onChange={(e) => setContentSearch(e.target.value)}
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
        </>
      }
    >
      <main className="content">
        <div className="filter-bar">
          <Dropdown label="Thị trường" count={countryFilter ? 1 : 0} width={200}>
            <div className="dd-list">
              <button type="button" className={`dd-radio-row ${countryFilter === "" ? "active" : ""}`} onClick={() => setCountryFilter("")}>
                Tất cả (MX + US)
              </button>
              {MARKET_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={`dd-radio-row ${countryFilter === code ? "active" : ""}`}
                  onClick={() => setCountryFilter(code)}
                >
                  {MARKET_LABELS[code]}
                </button>
              ))}
            </div>
          </Dropdown>

          <div className="pill-toggle">
            <span className="pill-group-label">Trạng thái</span>
            <button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>
              Đang chạy
            </button>
            <button className={statusFilter === "inactive" ? "active" : ""} onClick={() => setStatusFilter("inactive")}>
              Đã dừng
            </button>
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>
              Tất cả
            </button>
          </div>

          <div className="pill-toggle">
            <span className="pill-group-label">Loại nội dung</span>
            <button className={mediaTypeFilter === "" ? "active" : ""} onClick={() => setMediaTypeFilter("")}>
              Tất cả
            </button>
            <button className={mediaTypeFilter === "video" ? "active" : ""} onClick={() => setMediaTypeFilter("video")}>
              {MEDIA_TYPE_LABELS.video}
            </button>
            <button className={mediaTypeFilter === "image" ? "active" : ""} onClick={() => setMediaTypeFilter("image")}>
              {MEDIA_TYPE_LABELS.image}
            </button>
          </div>

          <div className="pill-toggle">
            <span className="pill-group-label">Sắp xếp</span>
            <button className={sortMode === "endurance" ? "active" : ""} onClick={() => setSortMode("endurance")}>
              Chạy lâu nhất
            </button>
            <button className={sortMode === "newest" ? "active" : ""} onClick={() => setSortMode("newest")}>
              Mới phát hiện
            </button>
          </div>

          <div className="pill-toggle">
            <span className="pill-group-label">Phạm vi</span>
            <button
              className={checklistOnly ? "active" : ""}
              onClick={() => {
                setChecklistOnly(true);
                setSelectedBrands(new Set());
              }}
            >
              Chỉ checklist
            </button>
            <button className={!checklistOnly ? "active" : ""} onClick={() => setChecklistOnly(false)}>
              Tất cả ad
            </button>
          </div>

          <Dropdown label="Từ khoá" count={selectedKeywords.size} width={260}>
            <div className="dd-head">
              <span>{industryItems.length} từ khóa</span>
              {selectedKeywords.size > 0 && (
                <button className="clear-link" onClick={() => setSelectedKeywords(new Set())}>
                  Bỏ chọn
                </button>
              )}
            </div>
            <div className="dd-list">
              {industryGroups.map(([category, items]) => (
                <div key={category} className="dd-group">
                  <div className="dd-group-label">{category}</div>
                  {items.map((k) => (
                    <label key={k.keyword} className={`kw-row ${selectedKeywords.has(k.keyword) ? "active" : ""}`}>
                      <input type="checkbox" checked={selectedKeywords.has(k.keyword)} onChange={() => toggleKeyword(k.keyword)} />
                      <span className="kw-label-wrap">
                        <span className="kw-label">{industryLabelVi(k.keyword)}</span>
                        {industryLabelVi(k.keyword) !== k.keyword && <span className="kw-label-orig">{k.keyword}</span>}
                      </span>
                      <span className="kw-count">
                        {k.total}
                        {Number(k.active) > 0 && <i className="dot" />}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
              {industryItems.length === 0 && <p className="muted small dd-empty">Chưa có dữ liệu.</p>}
            </div>
          </Dropdown>

          <Dropdown label="Checklist brand" count={brandSearch ? 1 : 0} width={280}>
            <div className="dd-head">
              <span>30 brand — đồng bộ với Dashboard Brand</span>
              {brandSearch && (
                <button className="clear-link" onClick={clearBrandSearch}>
                  Bỏ chọn
                </button>
              )}
            </div>
            <div className="dd-list scroll">
              {CHECKLIST_BRANDS.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  className={`dd-radio-row ${brandSearch === b.name ? "active" : ""}`}
                  onClick={() => selectChecklistBrand(b)}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </Dropdown>

          <Dropdown label="Thương hiệu" count={selectedBrands.size} width={280}>
            <input
              className="brand-filter-input"
              placeholder="Lọc trong danh sách..."
              value={brandFilterText}
              onChange={(e) => setBrandFilterText(e.target.value)}
              autoFocus
            />
            {selectedBrands.size > 0 && (
              <div className="dd-head">
                <span>{selectedBrands.size} đã chọn</span>
                <button className="clear-link" onClick={() => setSelectedBrands(new Set())}>
                  Bỏ chọn
                </button>
              </div>
            )}
            <div className="dd-list scroll">
              {visibleBrands.map((b) => (
                <label key={b.page_name} className={`kw-row ${selectedBrands.has(b.page_name) ? "active" : ""}`}>
                  <input type="checkbox" checked={selectedBrands.has(b.page_name)} onChange={() => toggleBrand(b.page_name)} />
                  <span className="brand-dot" style={{ background: avatarGradient(b.page_name) }} />
                  <span className="kw-label">{b.page_name}</span>
                  <span className="kw-count">
                    {b.total}
                    {Number(b.active) > 0 && <i className="dot" />}
                  </span>
                </label>
              ))}
              {!showAllBrands && !brandFilterText && visibleBrands.length === 30 && (
                <button className="show-more-link" onClick={() => setShowAllBrands(true)}>
                  Hiện tất cả thương hiệu
                </button>
              )}
              {brandStats.length === 0 && <p className="muted small dd-empty">Chưa có dữ liệu — job fetch chưa chạy lần nào.</p>}
            </div>
          </Dropdown>
        </div>

        <div className="brand-search-bar" style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "12px" }}>
          <input
            style={{ flex: 1, padding: "9px 12px", borderRadius: "8px", border: "1px solid #dcdee8", fontSize: "13px" }}
            placeholder="Tìm thương hiệu (VD: Medicube, Anua...) — hiện cả ad của brand chính và affiliate"
            value={brandSearchInput}
            onChange={(e) => setBrandSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitBrandSearch();
            }}
          />
          <button className="btn-refresh" onClick={submitBrandSearch} disabled={!brandSearchInput.trim()}>
            Tìm brand
          </button>
          {brandSearch && (
            <button className="btn-refresh" onClick={clearBrandSearch}>
              Xóa tìm kiếm
            </button>
          )}
        </div>
        {brandSearch && (
          <p className="hint-text" style={{ marginTop: "8px" }}>
            Đang tìm brand: <strong>{brandSearch}</strong> — hiện tất cả ad liên quan (brand chính + affiliate /
            influencer nhắc tới brand), không lọc category, và trạng thái đã chuyển sang Tất cả để hiện cả ad đã dừng. Bấm “Xóa tìm kiếm” để quay lại
            danh sách thường.
          </p>
        )}

        {checklistOnly && !brandSearch && (
          <p className="hint-text" style={{ marginTop: "8px" }}>
            Đang khóa tab này về 30 brand trong checklist — chỉ hiện ad của Page thuộc checklist
            (kể cả ad chưa gắn category như Medicube). Bấm “Tất cả ad” ở thanh lọc để xem toàn bộ.
          </p>
        )}

        <p className="hint-text bar-hint">
          Từ khoá + Thương hiệu kết hợp được với nhau (VD: chọn "Chăm sóc da" + "Pai Pai"). Không có bộ lọc "Nền
          tảng" riêng từng ad (Facebook/Instagram...) — đã kiểm tra trực tiếp, Meta không hiển thị nhãn nào để đọc ra
          tên nền tảng một cách đáng tin cậy cho từng quảng cáo.
        </p>

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
              <span className="stat-label">Thương hiệu đã phát hiện</span>
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
              <p className="muted small">Thử bỏ bớt bộ lọc, hoặc đổi từ khóa/thương hiệu ở thanh bộ lọc phía trên.</p>
              {contentSearch.trim().length > 0 &&
                (() => {
                  // Ô tìm kiếm chỉ lọc TRONG số quảng cáo đã quét sẵn (xem ghi chú đầu file) — không
                  // tìm trực tiếp trên Meta. Panel này KHÔNG tự quét được (backend chỉ đọc, xem
                  // README) — chỉ chuẩn bị sẵn 3 giá trị (từ khóa/thị trường/ngành hàng, có tự đoán
                  // ngành hàng) để dán nhanh vào form "Run workflow" trên GitHub, đỡ phải tự gõ tay.
                  const guessed = guessCategory(contentSearch);
                  const effectiveCountry = scanCountry || countryFilter || "MX";
                  const effectiveCategory = scanCategory || guessed || "";
                  const copyText = `Từ khóa: ${contentSearch.trim()}\nThị trường: ${effectiveCountry}\nNgành hàng: ${
                    effectiveCategory || "(để trống — hệ thống sẽ tự đoán)"
                  }`;
                  return (
                    <div className="scan-request">
                      <p className="muted small">
                        Không thấy &quot;{contentSearch}&quot;? Có thể từ khóa này CHƯA nằm trong danh sách quét
                        thường xuyên. Chuẩn bị sẵn thông tin bên dưới rồi qua GitHub chạy thử (mất khoảng 1-3 phút):
                      </p>
                      <div className="scan-request-fields">
                        <label>
                          Thị trường
                          <select value={effectiveCountry} onChange={(e) => setScanCountry(e.target.value)}>
                            {MARKET_CODES.map((code) => (
                              <option key={code} value={code}>
                                {MARKET_LABELS[code]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Ngành hàng {guessed && !scanCategory && <span className="scan-guess-tag">tự đoán</span>}
                          <select value={scanCategory} onChange={(e) => setScanCategory(e.target.value)}>
                            <option value="">
                              {guessed ? `Để hệ thống tự đoán (gợi ý: ${guessed})` : "Chưa xác định — để trống"}
                            </option>
                            {SCAN_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="scan-request-actions">
                        <button
                          type="button"
                          className="btn-scan-copy"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(copyText);
                              setCopyFeedback("Đã sao chép — dán vào form trên GitHub.");
                            } catch {
                              setCopyFeedback("Không sao chép tự động được — tự gõ theo 3 dòng bên dưới nút.");
                            }
                            setTimeout(() => setCopyFeedback(""), 4000);
                          }}
                        >
                          Sao chép thông tin cần điền
                        </button>
                        <a
                          href={SCAN_WORKFLOW_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-scan-open"
                        >
                          Mở trang chạy quét trên GitHub ↗
                        </a>
                      </div>
                      {copyFeedback && <p className="scan-copy-feedback">{copyFeedback}</p>}
                      <pre className="scan-copy-preview">{copyText}</pre>
                    </div>
                  );
                })()}
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
                  const fbUrl = facebookUrlFor(ad.page_id);
                  return (
                    <article className="card" key={ad.ad_id}>
                      <div className="card-banner" style={ad.thumbnail_url ? undefined : { background: avatarGradient(ad.page_name) }}>
                        {ad.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="card-banner-img" src={ad.thumbnail_url} alt="" loading="lazy" />
                        ) : (
                          <span className="card-initials">{initials(ad.page_name)}</span>
                        )}
                        <span className={`status-pill ${ad.is_active ? "is-live" : "is-off"}`}>
                          {ad.is_active ? "● Đang chạy" : "Đã dừng"}
                        </span>
                        {tier.label && <span className={`tier-pill tone-${tier.tone}`}>{tier.label}</span>}
                      </div>

                      <div className="card-body">
                        <div className="card-head">
                          <div className="brand-name-wrap">
                            <span className="brand-of-label">Brand</span>
                            <h3 title={ad.page_name}>{ad.page_name}</h3>
                          </div>
                          <span className="days-count">
                            {ad.days_active ?? "?"}
                            <small>ngày</small>
                          </span>
                        </div>
                        <div className="tag-row">
                          <span className="keyword-tag">{ad.keyword}</span>
                          {Array.isArray(ad.countries) && ad.countries.length > 0 && (
                            <span className="country-tag" title="Thị trường phát hiện được quảng cáo này">
                              {ad.countries.map((c) => MARKET_LABELS[c] || c).join(" + ")}
                            </span>
                          )}
                        </div>
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
                        <div className="footer-links">
                          {fbUrl && (
                            <a href={fbUrl} target="_blank" rel="noreferrer" className="btn-fb" title="Xem trang Facebook">
                              FB ↗
                            </a>
                          )}
                          <a href={ad.snapshot_url} target="_blank" rel="noreferrer" className="btn-view">
                            Xem gốc ↗
                          </a>
                        </div>
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
            Dữ liệu creative + độ bền chạy từ Meta Ad Library (scrape trang công khai). Ảnh minh họa lấy trực tiếp từ
            CDN Facebook nên có thể hết hạn theo thời gian. Like/comment/share/view là best-effort, không phải mọi
            quảng cáo đều có — xem README của dự án để biết chi tiết giới hạn dữ liệu.
          </p>
        </main>

      <style jsx>{`
        .search-wrap {
          flex: 1;
          max-width: 480px;
          min-width: 200px;
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
          font-size: 13px;
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

        .content {
          padding: 20px 24px 48px;
          max-width: 1800px;
          margin: 0 auto;
          width: 100%;
        }

        .filter-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          background: #181a30;
          border-radius: 14px;
          padding: 12px 14px;
          margin-bottom: 8px;
        }
        .bar-hint {
          margin: 0 0 20px;
        }

        .pill-toggle {
          display: flex;
          align-items: center;
          background: #23244a;
          border-radius: 9px;
          padding: 3px;
          gap: 3px;
        }
        .pill-group-label {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
          color: #6d6f93;
          padding: 0 10px 0 6px;
          margin-right: 2px;
          white-space: nowrap;
          border-right: 1px solid #34355c;
        }
        .pill-toggle button {
          border: none;
          background: transparent;
          color: #d5d6ee;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 10px;
          border-radius: 7px;
          cursor: pointer;
          white-space: nowrap;
        }
        .pill-toggle button:hover:not(.active) {
          background: #2b2c55;
        }
        .pill-toggle button.active {
          background: #6c5ce7;
          color: #fff;
        }

        .clear-link {
          margin-left: auto;
          background: none;
          border: none;
          color: #6c5ce7;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
        }
        .hint-text {
          font-size: 10.5px;
          color: #9799b8;
          margin: 8px 2px 0;
          line-height: 1.4;
        }

        .dd-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #9799b8;
          font-weight: 600;
          padding: 2px 6px 8px;
        }
        .dd-list {
          display: flex;
          flex-direction: column;
          gap: 1px;
          max-height: 340px;
          overflow-y: auto;
        }
        .dd-list.scroll {
          max-height: 300px;
        }
        .dd-empty {
          padding: 10px 6px;
        }
        .dd-group + .dd-group {
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px solid #eceef6;
        }
        .dd-group-label {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #b3b5cc;
          padding: 2px 8px 4px;
        }

        .dd-radio-row {
          width: 100%;
          display: flex;
          align-items: center;
          background: transparent;
          border: none;
          color: #4c4e63;
          font-size: 13px;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
        }
        .dd-radio-row:hover {
          background: #f4f5fa;
        }
        .dd-radio-row.active {
          background: #f1effd;
          color: #1c1d2b;
          font-weight: 600;
        }

        .brand-filter-input {
          width: 100%;
          padding: 8px 10px;
          border-radius: 7px;
          border: 1px solid #dcdee8;
          background: #f7f8fc;
          color: #1c1d2b;
          font-size: 12.5px;
          outline: none;
          margin-bottom: 8px;
        }
        .brand-filter-input:focus {
          border-color: #6c5ce7;
        }

        .kw-row {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: #4c4e63;
          font-size: 13px;
          padding: 7px 8px;
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
        }
        .kw-row:hover {
          background: #f4f5fa;
        }
        .kw-row.active {
          background: #f1effd;
          color: #1c1d2b;
          font-weight: 600;
        }
        .kw-row input[type="checkbox"] {
          flex-shrink: 0;
          accent-color: #6c5ce7;
        }
        .kw-label-wrap {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .kw-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .kw-label-orig {
          font-size: 10px;
          color: #a3a5c2;
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
          color: #9799b8;
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
        .show-more-link {
          width: 100%;
          background: none;
          border: 1px dashed #dcdee8;
          color: #6c5ce7;
          font-size: 11.5px;
          font-weight: 600;
          padding: 7px;
          border-radius: 8px;
          cursor: pointer;
          margin-top: 4px;
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
          height: 130px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .card-banner-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
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
          background: rgba(0, 0, 0, 0.4);
          color: #fff;
          backdrop-filter: blur(2px);
        }
        .status-pill.is-live {
          background: rgba(0, 184, 148, 0.92);
        }
        .status-pill.is-off {
          background: rgba(45, 52, 54, 0.6);
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
          background: rgba(0, 0, 0, 0.4);
        }
        .tier-pill.tone-hot {
          background: #e17055;
        }
        .tier-pill.tone-good {
          background: rgba(9, 132, 227, 0.92);
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
        .brand-name-wrap {
          overflow: hidden;
          max-width: 180px;
        }
        .brand-of-label {
          display: block;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #b3b5cc;
        }
        .card-head h3 {
          font-size: 14px;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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

        .tag-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
        }
        .keyword-tag {
          display: inline-block;
          font-size: 10.5px;
          font-weight: 700;
          color: #6c5ce7;
          background: #f1effd;
          padding: 2px 8px;
          border-radius: 20px;
        }
        .country-tag {
          display: inline-block;
          font-size: 10.5px;
          font-weight: 700;
          color: #0984e3;
          background: #eaf4ff;
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
        .footer-links {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }
        .btn-view,
        .btn-fb {
          font-size: 11.5px;
          font-weight: 700;
          color: #fff;
          padding: 6px 10px;
          border-radius: 8px;
          text-decoration: none;
          white-space: nowrap;
        }
        .btn-view {
          background: #14152b;
        }
        .btn-view:hover {
          background: #2b2c5c;
        }
        .btn-fb {
          background: #0866ff;
        }
        .btn-fb:hover {
          background: #0552cc;
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
        .scan-request {
          max-width: 420px;
          margin: 18px auto 0;
          text-align: left;
          background: #f7f7fc;
          border: 1px solid #ebecf5;
          border-radius: 12px;
          padding: 16px 18px;
        }
        .scan-request > p {
          margin: 0 0 12px;
          line-height: 1.5;
        }
        .scan-request-fields {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .scan-request-fields label {
          flex: 1;
          min-width: 150px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          color: #6d6f93;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .scan-request-fields select {
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          color: #1c1d2b;
          text-transform: none;
          letter-spacing: normal;
          padding: 8px 9px;
          border-radius: 8px;
          border: 1px solid #d9dbe9;
          background: #fff;
        }
        .scan-guess-tag {
          background: #ded9ff;
          color: #4c3fb5;
          border-radius: 20px;
          padding: 1px 7px;
          font-size: 9.5px;
          text-transform: none;
          letter-spacing: normal;
          font-weight: 700;
        }
        .scan-request-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .btn-scan-copy,
        .btn-scan-open {
          font-size: 12.5px;
          font-weight: 700;
          border-radius: 8px;
          padding: 9px 12px;
          cursor: pointer;
          text-decoration: none;
          text-align: center;
          border: none;
        }
        .btn-scan-copy {
          background: #6c5ce7;
          color: #fff;
        }
        .btn-scan-copy:hover {
          background: #5b4bd6;
        }
        .btn-scan-open {
          background: #fff;
          color: #6c5ce7;
          border: 1px solid #d9d3ff;
        }
        .btn-scan-open:hover {
          background: #f2effe;
        }
        .scan-copy-feedback {
          margin: 10px 0 0;
          font-size: 11.5px;
          color: #00b894;
          font-weight: 600;
        }
        .scan-copy-preview {
          margin: 12px 0 0;
          background: #1e1f3a;
          color: #c6c7e0;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 11px;
          line-height: 1.6;
          white-space: pre-wrap;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
          .btn-label {
            display: none;
          }
          .btn-refresh {
            padding: 9px 11px;
          }
          .content {
            padding: 16px;
          }
          .filter-bar {
            gap: 8px;
          }
          .stat-row {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </Layout>
  );
}
