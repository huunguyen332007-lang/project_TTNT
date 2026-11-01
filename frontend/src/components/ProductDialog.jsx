import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getSimilar } from '../api/index.js';
import { formatPrice } from '../utils/format.js';
import ProductCard from './ProductCard.jsx';

/** Chi tiết sản phẩm + sản phẩm tương tự, dùng thẻ <dialog> gốc (tự bẫy focus, đóng bằng Esc). */
export default function ProductDialog({ product, onClose, onOpenOther }) {
  const ref = useRef(null);
  const [similar, setSimilar] = useState({ status: 'idle', items: [] });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (product && !dialog.open) dialog.showModal();
    if (!product && dialog.open) dialog.close();
    if (product) dialog.scrollTop = 0;
  }, [product]);

  const productId = product?.id;
  useEffect(() => {
    if (productId == null) return undefined;
    const controller = new AbortController();
    setSimilar({ status: 'loading', items: [] });
    getSimilar(productId, { signal: controller.signal })
      .then((d) => setSimilar({ status: 'success', items: d.items }))
      .catch((err) => {
        if (err.name !== 'AbortError') setSimilar({ status: 'error', items: [] });
      });
    return () => controller.abort();
  }, [productId]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // bấm vào vùng nền mờ
      }}
    >
      {product && (
        <div className="dialog__inner">
          <button type="button" className="icon-btn dialog__close" aria-label="Đóng" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>

          <div className="dialog__main">
            <img className="dialog__image" src={product.imageUrl} alt={product.title} />
            <div className="dialog__info">
              <p className="card__category">{product.category}</p>
              <h2 id="dialog-title" className="dialog__title">{product.title}</h2>
              {product.price != null && <p className="card__price">{formatPrice(product.price)}</p>}
              <p className="dialog__desc">{product.description || 'Sản phẩm chưa có mô tả.'}</p>
            </div>
          </div>

          <section className="dialog__similar" aria-labelledby="similar-title">
            <h3 id="similar-title" className="section__title section__title--small">Sản phẩm tương tự</h3>
            {similar.status === 'loading' && <p className="section__sub">Đang tìm sản phẩm tương tự...</p>}
            {similar.status === 'error' && <p className="section__sub">Không tải được sản phẩm tương tự.</p>}
            {similar.status === 'success' && similar.items.length === 0 && (
              <p className="section__sub">Chưa có sản phẩm tương tự. Sản phẩm có thể đang được lập chỉ mục.</p>
            )}
            {similar.items.length > 0 && (
              <ul className="grid grid--compact">
                {similar.items.map((item) => (
                  <ProductCard key={item.id} product={item} onOpen={onOpenOther} showMatch />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </dialog>
  );
}
