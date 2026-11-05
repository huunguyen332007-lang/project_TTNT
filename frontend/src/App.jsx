import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, ArrowUpRight, Sparkles, Compass, Clock3, X, Menu,
  SlidersHorizontal, Command, History, Trash2
} from "lucide-react";
import { getRecommendations, loadCatalog } from "./api.js";
import { similarTo, budgetOptions } from "./recommender.js";
import ProductCard from "./components/ProductCard.jsx";
import ProductThumb from "./components/ProductThumb.jsx";
import PreferenceModal from "./components/PreferenceModal.jsx";
import DetailModal from "./components/DetailModal.jsx";

const PAGE_SIZE = 24;

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

export default function App() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [sort, setSort] = useState("relevance");
  const [interests, setInterests] = usePersistentState("rec.interests", []);
  const [budget, setBudget] = usePersistentState("rec.budget", "any");
  const [viewed, setViewed] = usePersistentState("rec.viewed", []);
  const [showPrefs, setShowPrefs] = useState(false);
  const [selected, setSelected] = useState(null);
  const [searched, setSearched] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [items, setItems] = useState([]);
  const [source, setSource] = useState("local");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const inputRef = useRef(null);

  // Danh mục lấy từ dữ liệu thật, không hard-code
  useEffect(() => {
    loadCatalog().then(setCatalog).catch((e) => setError(e.message));
  }, []);
  const categoryList = useMemo(() => [...new Set(catalog.map((p) => p.category))].sort(), [catalog]);
  const categories = useMemo(() => ["Tất cả", ...categoryList], [categoryList]);

  // Gọi bộ gợi ý (debounce 200ms, huỷ request cũ khi tham số đổi)
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await getRecommendations({ query, category: activeCategory, interests, budget, viewed }, ctrl.signal);
        setItems(res.items);
        setSource(res.source);
        setError("");
      } catch (e) {
        if (e.name !== "AbortError") setError(e.message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, activeCategory, interests, budget, viewed]);

  // Ctrl/Cmd + K để focus ô tìm kiếm
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Đổi bộ lọc/sắp xếp thì quay về trang đầu
  useEffect(() => { setLimit(PAGE_SIZE); }, [query, activeCategory, interests, budget, sort]);

  const results = useMemo(() => {
    const arr = [...items];
    if (sort === "priceAsc") arr.sort((a, b) => a.price - b.price);
    else if (sort === "priceDesc") arr.sort((a, b) => b.price - a.price);
    else if (sort === "rating") arr.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    return arr; // "relevance": giữ thứ tự điểm từ bộ gợi ý
  }, [items, sort]);

  const personalized = interests.length > 0 || viewed.length > 0 || budget !== "any" || !!query.trim();

  function openProduct(p) {
    setSelected(p);
    setViewed((prev) => {
      const { score, reason, ...snap } = p; // chỉ lưu thông tin sản phẩm
      return [snap, ...prev.filter((x) => x.id !== p.id)].slice(0, 12);
    });
  }

  function clearSearch() {
    setQuery(""); setActiveCategory("Tất cả"); setSearched(false);
  }

  function savePrefs(nextInterests, nextBudget) {
    setInterests(nextInterests); setBudget(nextBudget); setShowPrefs(false); setSearched(true);
  }

  const similar = selected ? similarTo(selected, source === "local" ? catalog : items) : [];
  const budgetLabel = budgetOptions.find((b) => b.key === budget)?.label;
  const shown = results.slice(0, limit);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="PickForYou trang chủ" onClick={clearSearch}>
          <span className="brand-mark"><Sparkles size={18} strokeWidth={2.4} /></span>
          <span>Pick<span className="brand-light">ForYou</span><small>Gợi ý sản phẩm</small></span>
        </a>
        <nav className="desktop-nav" aria-label="Điều hướng chính">
          <a className="nav-active" href="#discover"><Compass size={16} /> Khám phá</a>
          <a href="#recent"><Clock3 size={16} /> Đã xem</a>
        </nav>
        <div className="top-actions">
          <span className="status-dot" />
          <span className="status-text">{source === "api" ? "Đang dùng mô hình gợi ý" : "Đang dùng dữ liệu mẫu"}</span>
          <button className="icon-button mobile-menu" aria-label="Mở menu"><Menu size={20} /></button>
          <div className="avatar">S</div>
        </div>
      </header>

      <main>
        <section className="hero" id="discover">
          <div className="hero-content">
            <div className="eyebrow"><span className="eyebrow-line" /> GỢI Ý THEO CÁCH CỦA BẠN</div>
            <h1>Sản phẩm phù hợp<br />bắt đầu từ <span>sở thích của bạn.</span></h1>
            <p className="hero-copy">Tìm kiếm bằng từ khóa, chọn sở thích và ngân sách để nhận danh sách sản phẩm được gợi ý riêng cho bạn.</p>

            <form className="search-panel" onSubmit={(e) => { e.preventDefault(); setSearched(true); }}>
              <div className="search-input-wrap">
                <Search className="search-icon" size={22} />
                <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm sản phẩm, ví dụ: wireless earbuds" aria-label="Nhập sản phẩm cần tìm" />
                {query && <button type="button" className="clear-button" onClick={() => setQuery("")} aria-label="Xóa nội dung"><X size={17} /></button>}
                <kbd><Command size={11} /> K</kbd>
              </div>
              <div className="search-divider" />
              <button type="button" className="image-search-button" onClick={() => setShowPrefs(true)}><SlidersHorizontal size={18} /><span>Sở thích</span></button>
              <button type="submit" className="search-submit">Gợi ý <ArrowUpRight size={17} /></button>
            </form>

            <div className="search-hints">
              <span>Gợi ý:</span>
              {["wireless earbuds", "gaming laptop", "phone charger"].map((term) => (
                <button key={term} onClick={() => { setQuery(term); setSearched(true); }}>{term}</button>
              ))}
            </div>
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

        <section className="results-section">
          <div className="section-heading">
            <div>
              <div className="section-kicker">DÀNH CHO BẠN</div>
              <h2>{personalized || searched ? "Gợi ý phù hợp với bạn" : "Sản phẩm được quan tâm nhiều"}</h2>
              <p>{query ? <>Đang tìm với từ khóa <strong>“{query}”</strong></> : "Chọn sở thích hoặc xem vài sản phẩm để nhận gợi ý tốt hơn."}</p>
            </div>
            <button className="filter-button" onClick={() => { setQuery(""); setActiveCategory("Tất cả"); setInterests([]); setBudget("any"); }}><SlidersHorizontal size={16} /> Đặt lại bộ lọc</button>
          </div>

          <div className="category-row" role="tablist" aria-label="Lọc theo danh mục">
            {categories.map((cat, i) => (
              <button key={cat} role="tab" aria-selected={activeCategory === cat} className={`category-chip ${activeCategory === cat ? "selected" : ""}`} onClick={() => setActiveCategory(cat)}>
                {i === 0 && <span className="all-chip-dot" />}{cat}
              </button>
            ))}
          </div>

          <div className="result-meta">
            <span><b>{results.length.toString().padStart(2, "0")}</b> sản phẩm gợi ý{loading ? " · đang cập nhật…" : ""}</span>
            <label className="sort-label">Sắp xếp:
              <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>

          {error ? (
            <div className="empty-state">
              <div className="empty-icon"><X size={25} /></div>
              <h3>Không tải được dữ liệu</h3>
              <p>{error}. Hãy chạy <code>python scripts/build_products.py</code> để tạo <code>public/products.json</code>.</p>
            </div>
          ) : results.length ? (
            <>
              <div className="inspiration-grid">
                {shown.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} personalized={personalized && sort === "relevance"} onOpen={openProduct} />
                ))}
              </div>
              {results.length > shown.length && (
                <div className="load-more">
                  <button className="filter-button" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                    Xem thêm ({results.length - shown.length} sản phẩm)
                  </button>
                </div>
              )}
            </>
          ) : !loading ? (
            <div className="empty-state">
              <div className="empty-icon"><Search size={25} /></div>
              <h3>Chưa có sản phẩm phù hợp</h3>
              <p>Dữ liệu sản phẩm bằng tiếng Anh — thử từ khóa tiếng Anh hoặc chọn danh mục “Tất cả” nhé.</p>
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
      {selected && <DetailModal product={selected} similar={similar} onClose={() => setSelected(null)} onOpen={openProduct} />}
    </div>
  );
}
