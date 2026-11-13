import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, ArrowUpRight, Sparkles, Compass, Clock3, X, Menu,
  SlidersHorizontal, Command, History, Trash2, Camera
} from "lucide-react";
import { clearHistory, getCategories, getSimilar, logClick } from "./api.js";
import { clearSearchRequests, getRecentSearches } from "./searchCache.js";
import { useRecommendations } from "./useRecommendations.js";
import { budgetOptions } from "./budgets.js";
import ProductCard from "./components/ProductCard.jsx";
import ProductThumb from "./components/ProductThumb.jsx";
import PreferenceModal from "./components/PreferenceModal.jsx";
import ImageSearchModal from "./components/ImageSearchModal.jsx";
import DetailModal from "./components/DetailModal.jsx";
import RecentSearches from "./components/RecentSearches.jsx";

function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bỏ qua */ }
  }, [key, value]);
  return [value, setValue];
}

const SORTS = [
  { key: "relevance", label: "Phù hợp nhất" },
  { key: "priceAsc", label: "Giá tăng dần" },
  { key: "priceDesc", label: "Giá giảm dần" },
  { key: "rating", label: "Đánh giá cao" },
];

// Trạng thái hiển thị ở góc trên theo chế độ mà backend đang dùng.
const STATUS = {
  hybrid: "Tìm kiếm AI đang hoạt động",
  keyword: "AI tạm nghỉ · tìm theo từ khóa",
  personalized: "Gợi ý theo hồ sơ của bạn",
  browse: "Sản phẩm nổi bật",
  image: "Đang tìm bằng ảnh",
};

export default function App() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [sort, setSort] = useState("relevance");
  const [interests, setInterests] = usePersistentState("ttnt.interests", []);
  const [budget, setBudget] = usePersistentState("ttnt.budget", "any");
  const [viewed, setViewed] = usePersistentState("ttnt.viewed", []);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [selected, setSelected] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [searched, setSearched] = useState(false);
  const [categoryList, setCategoryList] = useState([]);
  const [image, setImage] = useState(null); // { id, file, url }
  const [recent, setRecent] = useState([]); // 3 tìm kiếm gần nhất đã lưu trên thiết bị
  const inputRef = useRef(null);

  const rec = useRecommendations({
    query, category: activeCategory, interests, budget, viewedIds: viewed.map((v) => v.id), sort, image,
  });
  const hasActiveSearch = Boolean(query.trim() || image);
  const categories = useMemo(() => ["Tất cả", ...categoryList], [categoryList]);

  // Khi vào lại (hoặc quay về trang chủ sau một tìm kiếm) hiển thị 3 tìm kiếm gần nhất đã lưu.
  useEffect(() => {
    if (hasActiveSearch) return undefined;
    let alive = true;
    getRecentSearches(3).then((list) => { if (alive) setRecent(list); });
    return () => { alive = false; };
  }, [hasActiveSearch]);

  // Danh mục lấy từ backend (không hard-code)
  useEffect(() => {
    const ctrl = new AbortController();
    getCategories(ctrl.signal).then(setCategoryList).catch(() => { /* chỉ còn tab "Tất cả" */ });
    return () => ctrl.abort();
  }, []);

  // Sản phẩm tương tự (so khớp embedding ở backend)
  useEffect(() => {
    setSimilar([]);
    if (!selected) return;
    const ctrl = new AbortController();
    getSimilar(selected.id, ctrl.signal).then(setSimilar).catch(() => { /* không có thì thôi */ });
    return () => ctrl.abort();
  }, [selected?.id]);

  // Giải phóng URL xem trước của ảnh đã chọn
  useEffect(() => () => image && URL.revokeObjectURL(image.url), [image]);

  // Ctrl/Cmd + K để focus ô tìm kiếm
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Backend đã sắp xếp trên toàn bộ kết quả; riêng tìm bằng ảnh (một danh sách ngắn, không qua /recommend) thì sắp xếp tại chỗ.
  const results = useMemo(() => {
    if (rec.mode !== "image" || sort === "relevance") return rec.items;
    const arr = [...rec.items];
    if (sort === "priceAsc") arr.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    else if (sort === "priceDesc") arr.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    else arr.sort((a, b) => b.rating - a.rating);
    return arr;
  }, [rec.items, rec.mode, sort]);

  const personalized = interests.length > 0 || viewed.length > 0 || budget !== "any" || !!query.trim() || !!image;

  // position: vị trí trong danh sách kết quả (chỉ truyền khi bấm từ danh sách chính) để ghi nhận hành vi.
  function openProduct(p, position) {
    if (Number.isInteger(position)) logClick({ productId: p.id, kind: image ? "image" : query.trim() ? "text" : "browse", query: query.trim(), position });
    setSelected(p);
    setViewed((prev) => {
      const { score, reason, ...snap } = p; // chỉ lưu thông tin sản phẩm
      return [snap, ...prev.filter((x) => x.id !== p.id)].slice(0, 12);
    });
  }

  function changeQuery(value) {
    setQuery(value);
    if (value && image) setImage(null); // mỗi lần chỉ một kiểu tìm kiếm: chữ hoặc ảnh
  }

  function pickImage(file) {
    setImage({ id: Date.now(), file, url: URL.createObjectURL(file) });
    setQuery("");
    setSearched(true);
    setShowImage(false);
    scrollToResults();
  }

  // Sau khi bấm tìm kiếm thì cuộn xuống phần sản phẩm (đợi một khung hình để vùng kết quả cập nhật xong).
  function scrollToResults() {
    requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // Bấm vào một tìm kiếm đã lưu: chạy lại đúng từ khóa/ảnh/danh mục đó để kết quả luôn mới.
  function openRecent(saved) {
    setActiveCategory(saved.category || "Tất cả");
    if (saved.kind === "image" && saved.imageBlob) {
      const file = new File([saved.imageBlob], saved.imageName || "anh-da-luu", { type: saved.imageBlob.type || "image/jpeg" });
      setImage({ id: Date.now(), file, url: URL.createObjectURL(file), name: saved.imageName || "Ảnh đã tìm" });
      setQuery("");
    } else {
      setImage(null);
      setQuery(saved.query || "");
    }
    setSearched(true);
    scrollToResults();
  }

  async function clearRecent() {
    await clearSearchRequests();
    clearHistory().catch(() => { /* backend tắt thì chỉ xóa phần trên thiết bị */ });
    setRecent([]);
  }

  function clearSearch() {
    setQuery(""); setActiveCategory("Tất cả"); setSearched(false); setImage(null);
  }

  function savePrefs(nextInterests, nextBudget) {
    setInterests(nextInterests); setBudget(nextBudget); setShowPrefs(false); setSearched(true);
  }

  const budgetLabel = budgetOptions.find((b) => b.key === budget)?.label;
  const status = rec.error ? "Có lỗi khi tải dữ liệu" : STATUS[rec.mode] ?? STATUS.browse;
  const fromHistory = rec.basedOn?.length > 0; // gợi ý dựa trên lịch sử tìm kiếm trong PostgreSQL
  const heading = image ? "Sản phẩm giống ảnh của bạn" : personalized || searched || fromHistory ? "Gợi ý phù hợp với bạn" : "Sản phẩm nổi bật";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="PickForYou trang chủ" onClick={clearSearch}>
          <span className="brand-mark"><Sparkles size={18} strokeWidth={2.4} /></span>
          <span>Pick<span className="brand-light">ForYou</span><small>Gợi ý </small></span>
        </a>
        <nav className="desktop-nav" aria-label="Điều hướng chính">
          <a className="nav-active" href="#discover"><Compass size={16} /> Khám phá</a>
          <a href="#recent"><Clock3 size={16} /> Đã xem</a>
        </nav>
        <div className="top-actions">
          <span className="status-dot" style={rec.error ? { background: "#e9546b", boxShadow: "0 0 0 4px #fdecef" } : undefined} />
          <span className="status-text">{status}</span>
          <button className="icon-button mobile-menu" aria-label="Mở menu"><Menu size={20} /></button>
          <div className="avatar">S</div>
        </div>
      </header>

      <main>
        <section className="hero" id="discover">
          <div className="hero-content">
            <div className="eyebrow"><span className="eyebrow-line" /> GỢI Ý THEO CÁCH CỦA BẠN</div>
            <h1>Sản phẩm phù hợp<br />bắt đầu từ <span>sở thích của bạn.</span></h1>
            <p className="hero-copy">Tìm bằng từ khóa hoặc bằng ảnh, chọn sở thích và ngân sách để nhận danh sách sản phẩm được gợi ý riêng cho bạn.</p>

            <form className="search-panel" onSubmit={(e) => { e.preventDefault(); setSearched(true); scrollToResults(); }}>
              <div className="search-input-wrap">
                <Search className="search-icon" size={22} />
                <input ref={inputRef} value={query} onChange={(e) => changeQuery(e.target.value)} placeholder="Tìm sản phẩm, ví dụ: tai nghe bluetooth" aria-label="Nhập sản phẩm cần tìm" />
                {query && <button type="button" className="clear-button" onClick={() => setQuery("")} aria-label="Xóa nội dung"><X size={17} /></button>}
                <kbd><Command size={11} /> K</kbd>
              </div>
              <div className="search-divider" />
              <button type="button" className="image-search-button" onClick={() => setShowImage(true)}><Camera size={18} /><span>Tìm bằng ảnh</span></button>
              <button type="button" className="image-search-button" onClick={() => setShowPrefs(true)}><SlidersHorizontal size={18} /><span>Sở thích</span></button>
              <button type="submit" className="search-submit">Gợi ý <ArrowUpRight size={17} /></button>
            </form>

            <div className="search-hints">
              <span>Gợi ý:</span>
              {["giày thể thao nam", "son môi lì", "tai nghe bluetooth"].map((term) => (
                <button key={term} onClick={() => { changeQuery(term); setSearched(true); scrollToResults(); }}>{term}</button>
              ))}
            </div>
            {image && (
              <div className="upload-summary">
                <img src={image.url} alt="" />
                <span>Đang tìm bằng ảnh “{image.file?.name || image.name || "Ảnh đã lưu"}”</span>
                <button onClick={() => setImage(null)}>Bỏ ảnh <X size={13} /></button>
              </div>
            )}
            {(interests.length > 0 || budget !== "any") && (
              <div className="upload-summary">
                <SlidersHorizontal size={16} />
                <span>
                  {interests.length > 0 ? `${interests.length} sở thích` : "Chưa chọn danh mục"}
                  {budget !== "any" ? ` · ${budgetLabel}` : ""}
                </span>
                <button onClick={() => setShowPrefs(true)}>Chỉnh sửa <ArrowUpRight size={13} /></button>
              </div>
            )}
          </div>
          <div className="hero-footnote"><span className="tiny-star">✳</span> Càng xem nhiều, gợi ý càng chuẩn.</div>
        </section>

        {recent.length > 0 && !hasActiveSearch && <RecentSearches items={recent} onPick={openRecent} onClear={clearRecent} />}

        <section className="results-section" id="results">
          <div className="section-heading">
            <div>
              <div className="section-kicker">DÀNH CHO BẠN</div>
              <h2>{heading}</h2>
              <p>
                {image ? "Xếp theo độ giống về hình ảnh và số sao."
                  : query ? <>Đang tìm với từ khóa <strong>“{query}”</strong> · xếp theo độ khớp và số sao</>
                  : rec.basedOn?.length ? <>Gợi ý dựa trên tìm kiếm gần đây: {rec.basedOn.map((q, i) => <span key={q}>{i > 0 && ", "}<strong>“{q}”</strong></span>)}</>
                  : "Chọn sở thích hoặc xem vài sản phẩm để nhận gợi ý tốt hơn."}
              </p>
            </div>
            <button className="filter-button" onClick={() => { setQuery(""); setActiveCategory("Tất cả"); setInterests([]); setBudget("any"); setImage(null); }}><SlidersHorizontal size={16} /> Đặt lại bộ lọc</button>
          </div>

          <div className="category-row" role="tablist" aria-label="Lọc theo danh mục">
            {categories.map((cat, i) => (
              <button key={cat} role="tab" aria-selected={activeCategory === cat} className={`category-chip ${activeCategory === cat ? "selected" : ""}`} onClick={() => setActiveCategory(cat)}>
                {i === 0 && <span className="all-chip-dot" />}{cat}
              </button>
            ))}
          </div>

          <div className="result-meta">
            <span><b>{rec.total.toString().padStart(2, "0")}</b> sản phẩm gợi ý{rec.loading ? " · đang cập nhật…" : ""}</span>
            <label className="sort-label">Sắp xếp:
              <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>

          {rec.error ? (
            <div className="empty-state">
              <div className="empty-icon"><X size={25} /></div>
              <h3>Không tải được dữ liệu</h3>
              <p>{rec.error}</p>
              <div className="error-actions"><button onClick={rec.retry}>Thử lại</button></div>
            </div>
          ) : results.length ? (
            <>
              <div className="inspiration-grid">
                {results.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} personalized={(personalized || fromHistory) && sort === "relevance"} onOpen={(prod) => openProduct(prod, i)} />
                ))}
              </div>
              {rec.hasMore && (
                <div className="load-more">
                  <button className="filter-button" onClick={rec.loadMore} disabled={rec.loadingMore}>
                    {rec.loadingMore ? "Đang tải…" : `Xem thêm (${rec.total - rec.items.length} sản phẩm)`}
                  </button>
                </div>
              )}
            </>
          ) : !rec.loading ? (
            <div className="empty-state">
              <div className="empty-icon"><Search size={25} /></div>
              <h3>Chưa có sản phẩm phù hợp</h3>
              <p>Thử từ khóa khác, bỏ bớt bộ lọc ngân sách hoặc chọn danh mục “Tất cả” nhé.</p>
              <button onClick={clearSearch}>Xóa bộ lọc</button>
            </div>
          ) : null}
        </section>

        <section className="uploads-section" id="recent">
          <div className="uploads-heading">
            <div><div className="section-kicker">LỊCH SỬ CỦA BẠN</div><h2>Sản phẩm đã xem</h2></div>
            <div className="heading-actions">
              <span className="upload-count">{viewed.length} sản phẩm</span>
              {viewed.length > 0 && <button className="filter-button" onClick={() => setViewed([])}><Trash2 size={15} /> Xóa lịch sử</button>}
            </div>
          </div>
          {viewed.length === 0 ? (
            <div className="upload-dropzone static">
              <span className="dropzone-icon"><History size={22} /></span>
              <span className="dropzone-title">Chưa có sản phẩm nào</span>
              <span className="dropzone-subtitle">Bấm vào một sản phẩm để xem chi tiết — các gợi ý sẽ bám theo những gì bạn quan tâm.</span>
            </div>
          ) : (
            <div className="uploaded-grid">
              {viewed.slice(0, 6).map((v) => (
                <div className="viewed-card" key={v.id}>
                  <button className="viewed-open" onClick={() => openProduct(v)}>
                    <span className="mini-thumb"><ProductThumb product={v} size={22} /></span>
                    <span className="viewed-text"><strong>{v.name}</strong><small>{v.category}</small></span>
                  </button>
                  <button className="viewed-remove" aria-label={`Xóa ${v.name}`} onClick={() => setViewed((prev) => prev.filter((x) => x.id !== v.id))}><X size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer>
        <a className="footer-brand" href="#"><span className="brand-mark"><Sparkles size={14} /></span> PickForYou</a>
        <span>Gợi ý sản phẩm theo sở thích và hành vi của bạn.</span>
        <span className="footer-right">Đồ án cuối kì · Phát triển nền tảng AI <span>✳</span></span>
      </footer>

      {showPrefs && <PreferenceModal categories={categoryList} interests={interests} budget={budget} onSave={savePrefs} onClose={() => setShowPrefs(false)} />}
      {showImage && <ImageSearchModal onPick={pickImage} onClose={() => setShowImage(false)} />}
      {selected && <DetailModal product={selected} similar={similar} onClose={() => setSelected(null)} onOpen={openProduct} />}
    </div>
  );
}
