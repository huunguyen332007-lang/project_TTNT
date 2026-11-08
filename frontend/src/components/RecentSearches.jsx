import React, { useEffect, useMemo } from "react";
import { History, Search, Star, Trash2, Camera } from "lucide-react";
import ProductThumb from "./ProductThumb.jsx";

/** 3 tìm kiếm gần nhất đã lưu trên thiết bị. Bấm vào để tìm lại. */
export default function RecentSearches({ items, onPick, onClear }) {
  // Ảnh tìm kiếm được lưu dưới dạng Blob nên cần URL tạm để hiển thị; thu hồi khi danh sách đổi.
  const imageUrls = useMemo(() => items.map((s) => (s.kind === "image" && s.imageBlob ? URL.createObjectURL(s.imageBlob) : null)), [items]);
  useEffect(() => () => imageUrls.forEach((u) => u && URL.revokeObjectURL(u)), [imageUrls]);

  return (
    <section className="recent-section" aria-label="Tìm kiếm gần đây">
      <div className="uploads-heading">
        <div><div className="section-kicker">TÌM KIẾM GẦN ĐÂY</div><h2>Tiếp tục từ lần trước</h2></div>
        <button className="filter-button" onClick={onClear}><Trash2 size={15} /> Xóa</button>
      </div>
      <div className="recent-grid">
        {items.map((s, i) => {
          const top = s.result.items[0];
          const isImage = s.kind === "image";
          return (
            <button className="recent-card" key={s.id} onClick={() => onPick(s)}>
              <span className="recent-thumb">
                {isImage && imageUrls[i] ? <img src={imageUrls[i]} alt="" /> : top ? <ProductThumb product={top} size={22} /> : <History size={22} />}
              </span>
              <span className="recent-text">
                <strong>{isImage ? <><Camera size={12} /> {s.imageName || "Ảnh đã tìm"}</> : <><Search size={12} /> {s.query}</>}</strong>
                <small>{s.category && s.category !== "Tất cả" ? `${s.category} · ` : ""}{s.result.total ?? s.result.items.length} kết quả</small>
                {top && (
                  <small className="recent-top">
                    Top 1: {top.name}
                    {top.rating > 0 && <span className="rating"><Star size={10} />{top.rating.toFixed(1)}</span>}
                  </small>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
