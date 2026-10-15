import React from 'react';
import { useMemo, useRef, useState } from "react";
import {
  Search, ImagePlus, ArrowUpRight, Sparkles, Compass, Clock3,
  X, Upload, Camera, FileImage, Menu, SlidersHorizontal, Command
} from "lucide-react";

const sampleItems = [
  { id: 1, title: "Không gian làm việc tối giản", category: "Thiết kế", tag: "INSPIRATION", image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=85", description: "Ánh sáng tự nhiên, bàn gỗ sáng và những chi tiết vừa đủ." },
  { id: 2, title: "Kiến trúc với đường nét mềm", category: "Kiến trúc", tag: "ARCHITECTURE", image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=85", description: "Một góc không gian yên tĩnh với chất liệu tự nhiên." },
  { id: 3, title: "Bảng màu dịu nhẹ", category: "Màu sắc", tag: "COLOR STUDY", image: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=900&q=85", description: "Trắng kem, be và nâu tạo cảm giác ấm áp, cân bằng." },
  { id: 4, title: "Thiết kế sản phẩm hiện đại", category: "Sản phẩm", tag: "PRODUCT", image: "https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=900&q=85", description: "Hình khối gọn gàng và công năng được đặt lên trước." },
  { id: 5, title: "Góc đọc sách bên cửa sổ", category: "Lối sống", tag: "SLOW LIVING", image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=85", description: "Một khoảng nghỉ nhỏ dành cho đọc sách và suy nghĩ." },
  { id: 6, title: "Cảm hứng từ thiên nhiên", category: "Thiên nhiên", tag: "NATURE", image: "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=900&q=85", description: "Sắc xanh và ánh nắng tạo nên bảng màu giàu năng lượng." },
];

const categories = ["Tất cả", "Thiết kế", "Kiến trúc", "Màu sắc", "Sản phẩm", "Lối sống", "Thiên nhiên"];

export default function App() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [uploadedImages, setUploadedImages] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [searched, setSearched] = useState(false);
  const fileRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi");
    return sampleItems.filter(item => {
      const categoryMatch = activeCategory === "Tất cả" || item.category === activeCategory;
      const textMatch = !q || `${item.title} ${item.category} ${item.description} ${item.tag}`.toLocaleLowerCase("vi").includes(q);
      return categoryMatch && textMatch;
    });
  }, [query, activeCategory]);

  function handleFiles(files) {
    const selected = Array.from(files || []).filter(file => file.type.startsWith("image/"));
    const mapped = selected.map(file => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      name: file.name,
      url: URL.createObjectURL(file),
      size: (file.size / 1024 / 1024).toFixed(2) + " MB"
    }));
    setUploadedImages(prev => [...prev, ...mapped]);
    setShowUpload(false);
  }

  function submitSearch(event) {
    event?.preventDefault();
    setSearched(true);
  }

  function clearSearch() {
    setQuery("");
    setActiveCategory("Tất cả");
    setSearched(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Trang chủ" onClick={clearSearch}>
          <span className="brand-mark"><Sparkles size={18} strokeWidth={2.4} /></span>
          <span>Machine<span className="brand-light">Search</span><small>Tìm kiếm</small></span>
        </a>
        <nav className="desktop-nav" aria-label="Điều hướng chính">
          <a className="nav-active" href="#discover"><Compass size={16} /> Khám phá</a>
          <a href="#uploads"><Clock3 size={16} /> Gần đây</a>
        </nav>
        <div className="top-actions">
          <span className="status-dot" />
          <span className="status-text">Không gian tìm kiếm của bạn</span>
          <button className="icon-button mobile-menu" aria-label="Mở menu"><Menu size={20} /></button>
          <div className="avatar">S</div>
        </div>
      </header>

      <main>
        <section className="hero" id="discover">
          <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
          <div className="hero-content">
            <div className="eyebrow"><span className="eyebrow-line" /> TÌM KIẾM THEO CÁCH CỦA BẠN</div>
            <h1>Ý tưởng hay bắt đầu<br />từ một <span>khám phá.</span></h1>
            <p className="hero-copy">Tìm kiếm bằng từ ngữ, hoặc đưa hình ảnh vào để bắt đầu hành trình của bạn.</p>

            <form className="search-panel" onSubmit={submitSearch}>
              <div className="search-input-wrap">
                <Search className="search-icon" size={22} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Bạn đang tìm kiếm điều gì?"
                  aria-label="Nhập nội dung tìm kiếm"
                />
                {query && <button type="button" className="clear-button" onClick={() => setQuery("")} aria-label="Xóa nội dung"><X size={17} /></button>}
                <kbd><Command size={11} /> K</kbd>
              </div>
              <div className="search-divider" />
              <button type="button" className="image-search-button" onClick={() => setShowUpload(true)}><ImagePlus size={18} /><span>Thêm ảnh</span></button>
              <button type="submit" className="search-submit">Tìm kiếm <ArrowUpRight size={17} /></button>
            </form>

            <div className="search-hints">
              <span>Gợi ý:</span>
              {["thiết kế tối giản", "phối màu sáng", "không gian xanh"].map(term => (
                <button key={term} onClick={() => { setQuery(term); setSearched(true); }}>{term}</button>
              ))}
            </div>
            {uploadedImages.length > 0 && (
              <div className="upload-summary">
                <FileImage size={16} /><span>Đã thêm {uploadedImages.length} hình ảnh</span>
                <button onClick={() => document.getElementById("uploads").scrollIntoView({ behavior: "smooth" })}>Xem ảnh <ArrowUpRight size={13} /></button>
              </div>
            )}
          </div>
          <div className="hero-footnote"><span className="tiny-star">✳</span> Tò mò một chút. Khám phá nhiều hơn.</div>
        </section>

        <section className="results-section">
          <div className="section-heading">
            <div>
              <div className="section-kicker">KHÔNG GIAN Ý TƯỞNG</div>
              <h2>{searched || query ? "Kết quả dành cho bạn" : "Bắt đầu từ cảm hứng"}</h2>
              <p>{query ? <>Đang tìm với từ khóa <strong>“{query}”</strong></> : "Một vài gợi ý để bạn bắt đầu khám phá."}</p>
            </div>
            <button className="filter-button" onClick={() => { setQuery(""); setActiveCategory("Tất cả"); }}><SlidersHorizontal size={16} /> Đặt lại bộ lọc</button>
          </div>

          <div className="category-row" role="tablist" aria-label="Lọc theo danh mục">
            {categories.map((cat, i) => (
              <button key={cat} role="tab" aria-selected={activeCategory === cat} className={`category-chip ${activeCategory === cat ? "selected" : ""}`} onClick={() => setActiveCategory(cat)}>
                {i === 0 && <span className="all-chip-dot" />}{cat}
              </button>
            ))}
          </div>

          <div className="result-meta"><span><b>{results.length.toString().padStart(2, "0")}</b> kết quả gợi ý</span><span className="sort-label">Sắp xếp: <strong>Phù hợp nhất <span>⌄</span></strong></span></div>

          {results.length ? (
            <div className="inspiration-grid">
              {results.map((item, index) => (
                <article className={`inspiration-card card-${index % 3}`} key={item.id}>
                  <div className="card-image-wrap">
                    <img src={item.image} alt={item.title} loading="lazy" />
                    <span className="image-tag">{item.tag}</span>
                    <button className="card-open" aria-label={`Xem ${item.title}`} onClick={() => setQuery(item.title)}><ArrowUpRight size={18} /></button>
                  </div>
                  <div className="card-content">
                    <div className="card-category">{item.category}</div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><Search size={25} /></div>
              <h3>Chưa tìm thấy kết quả phù hợp</h3>
              <p>Thử từ khóa khác hoặc chọn danh mục “Tất cả” nhé.</p>
              <button onClick={clearSearch}>Xóa bộ lọc</button>
            </div>
          )}
        </section>

        <section className="uploads-section" id="uploads">
          <div className="uploads-heading"><div><div className="section-kicker">THƯ VIỆN CỦA BẠN</div><h2>Hình ảnh đã thêm</h2></div><span className="upload-count">{uploadedImages.length} tệp</span></div>
          {uploadedImages.length === 0 ? (
            <button className="upload-dropzone" onClick={() => setShowUpload(true)}>
              <span className="dropzone-icon"><ImagePlus size={22} /></span>
              <span className="dropzone-title">Thêm hình ảnh để bắt đầu</span>
              <span className="dropzone-subtitle">Chọn ảnh từ thiết bị của bạn · PNG, JPG, WEBP</span>
              <span className="dropzone-cta"><Upload size={15} /> Chọn hình ảnh</span>
            </button>
          ) : (
            <div className="uploaded-grid">
              {uploadedImages.map(img => <div className="uploaded-card" key={img.id}><img src={img.url} alt={img.name} /><div><strong>{img.name}</strong><small>{img.size}</small></div><button aria-label={`Xóa ${img.name}`} onClick={() => setUploadedImages(prev => prev.filter(x => x.id !== img.id))}><X size={16} /></button></div>)}
              <button className="add-more" onClick={() => setShowUpload(true)}><ImagePlus size={22} /><span>Thêm ảnh khác</span></button>
            </div>
          )}
        </section>
      </main>

      <footer><a className="footer-brand" href="#"><span className="brand-mark"><Sparkles size={14} /></span>Search Tool</a><span>Khám phá điều mới, theo cách riêng của bạn.</span><span className="footer-right">Được thiết kế để tìm thấy cảm hứng <span>✳</span></span></footer>

      {showUpload && (
        <div className="modal-backdrop" onClick={() => setShowUpload(false)}>
          <div className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowUpload(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="modal-icon"><ImagePlus size={24} /></div>
            <div className="section-kicker">TÌM KIẾM BẰNG HÌNH ẢNH</div>
            <h2 id="upload-title">Một hình ảnh nói lên nhiều điều.</h2>
            <p>Tải ảnh lên để lưu vào thư viện của bạn. Bạn có thể thêm nhiều ảnh cùng lúc.</p>
            <button className="modal-dropzone" onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}>
              <span className="modal-upload-icon"><Camera size={23} /></span>
              <strong>Kéo thả ảnh vào đây</strong>
              <span>hoặc nhấn để chọn tệp từ thiết bị</span>
              <span className="modal-file-types">PNG · JPG · WEBP · GIF</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
            <button className="modal-cancel" onClick={() => setShowUpload(false)}>Để sau</button>
            <small className="privacy-note">Ảnh được hiển thị trong phiên làm việc trên trình duyệt này.</small>
          </div>
        </div>
      )}
    </div>
  );
}