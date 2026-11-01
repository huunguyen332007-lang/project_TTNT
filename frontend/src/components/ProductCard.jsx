import { useState } from 'react';
import { formatPrice, toPercent } from '../utils/format.js';

export default function ProductCard({ product, onOpen, showMatch = false }) {
  const [broken, setBroken] = useState(false);
  const percent = showMatch && typeof product.similarity === 'number' ? toPercent(product.similarity) : null;

  return (
    <li className="card">
      <button type="button" className="card__button" onClick={() => onOpen(product)}>
        <span className="card__media">
          {broken ? (
            <span className="card__fallback">Không tải được ảnh</span>
          ) : (
            <img src={product.imageUrl} alt="" loading="lazy" onError={() => setBroken(true)} />
          )}
        </span>
        <span className="card__body">
          <span className="card__category">{product.category}</span>
          <span className="card__title">{product.title}</span>
          {product.price != null && <span className="card__price">{formatPrice(product.price)}</span>}
          {percent !== null && (
            <span className="match">
              <span className="match__track">
                <span className="match__fill" style={{ '--match': percent / 100 }} />
              </span>
              <span className="match__label">Khớp {percent}%</span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
