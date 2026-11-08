import React from "react";
import { ArrowUpRight, Sparkles, Star } from "lucide-react";
import ProductThumb from "./ProductThumb.jsx";
import { formatPrice } from "../format.js";

export default function ProductCard({ product, index, personalized, onOpen }) {
  const top = personalized && index < 3;
  return (
    <article
      className={`inspiration-card product-card card-${index % 3}`}
      tabIndex={0}
      onClick={() => onOpen(product)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(product)}
    >
      <div className="card-image-wrap">
        <ProductThumb product={product} />
        <span className="image-tag">{top ? "TOP GỢI Ý" : product.category.toUpperCase()}</span>
        <button className="card-open" aria-label={`Xem ${product.name}`} tabIndex={-1}><ArrowUpRight size={18} /></button>
      </div>
      <div className="card-content">
        <div className="card-category">{product.category}</div>
        <h3 title={product.name}>{product.name}</h3>
        <div className="card-reason"><Sparkles size={11} /><span>{product.reason}</span></div>
        <div className="card-foot">
          <span className="price-box">
            <span className={`price ${product.price == null ? "price-none" : ""}`}>{formatPrice(product.price)}</span>
          </span>
          {product.match != null && <span className="match-badge" title="Độ khớp với tìm kiếm của bạn (cosine similarity)">Khớp {Math.round(product.match * 100)}%</span>}
          {product.rating > 0 && <span className="rating" aria-label={`Đánh giá ${product.rating} trên 5 sao`}><Star size={12} />{product.rating.toFixed(1)}</span>}
        </div>
      </div>
    </article>
  );
}
