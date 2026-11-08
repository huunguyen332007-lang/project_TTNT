import React from "react";
import { X, Star, Sparkles, ExternalLink } from "lucide-react";
import ProductThumb from "./ProductThumb.jsx";
import { formatPrice, marketplaceName } from "../format.js";

export default function DetailModal({ product, similar, onClose, onOpen }) {
  const shop = product.sourceUrl ? marketplaceName(product.sourceUrl) : null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        <div className="detail-media"><ProductThumb product={product} size={72} /></div>
        <div className="detail-body">
          <div className="card-category">{product.category}</div>
          <h2 id="detail-title">{product.name}</h2>
          <div className="detail-price-row">
            <span className={`price price-lg ${product.price == null ? "price-none" : ""}`}>{formatPrice(product.price)}</span>
          </div>

          <div className="detail-stats">
            {product.rating > 0
              ? <span className="rating"><Star size={13} />{product.rating.toFixed(1)}<small>/ 5</small></span>
              : <span className="stat">Chưa có đánh giá</span>}
          </div>

          {product.tags.length > 0 && <div className="tag-row">{product.tags.map((t) => <span key={t} className="tag-pill">{t}</span>)}</div>}
          {product.reason && <div className="card-reason"><Sparkles size={11} /><span>{product.reason}</span></div>}

          {shop && (
            <a className="primary-btn detail-link" href={product.sourceUrl} target="_blank" rel="noopener noreferrer">
              Xem trên {shop} <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}

          {similar.length > 0 && (
            <>
              <div className="field-label similar-label">SẢN PHẨM TƯƠNG TỰ</div>
              <div className="similar-row">
                {similar.map((s) => (
                  <button key={s.id} className="similar-card" onClick={() => onOpen(s)}>
                    <span className="mini-thumb"><ProductThumb product={s} size={22} /></span>
                    <span className="similar-text"><strong>{s.name}</strong><small>{formatPrice(s.price)}</small></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
