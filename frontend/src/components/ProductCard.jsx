import React from "react";
import { ArrowUpRight, Sparkles, Star } from "lucide-react";
import ProductThumb from "./ProductThumb.jsx";
import { formatPrice, compact } from "../format.js";

export default function ProductCard({ product, index, personalized, onOpen }) {
  const top = personalized && index < 3;
  const hasDiscount = product.discount > 0 && product.originalPrice > product.price;
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
        {hasDiscount && <span className="discount-tag">-{product.discount}%</span>}
        <button className="card-open" aria-label={`Xem ${product.name}`} tabIndex={-1}><ArrowUpRight size={18} /></button>
      </div>
      <div className="card-content">
        <div className="card-category">{product.brand ? `${product.category} · ${product.brand}` : product.category}</div>
        <h3 title={product.name}>{product.name}</h3>
        <div className="card-reason"><Sparkles size={11} /><span>{product.reason}</span></div>
        <div className="card-foot">
          <span className="price-box">
            <span className="price">{formatPrice(product.price)}</span>
            {hasDiscount && <s className="price-old">{formatPrice(product.originalPrice)}</s>}
          </span>
          <span className="rating"><Star size={12} />{product.rating.toFixed(1)}<small>({compact(product.reviews)})</small></span>
        </div>
      </div>
    </article>
  );
}
