import ProductCard from './ProductCard.jsx';

function Skeletons() {
  return (
    <ul className="grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="card card--skeleton"><span className="card__media" /><span className="card__body"><span className="skeleton-line" /><span className="skeleton-line skeleton-line--short" /></span></li>
      ))}
    </ul>
  );
}

export default function ProductGrid({ status, items, error, onOpen, onRetry, onReset, showMatch }) {
  if (status === 'error') {
    return (
      <div className="state" role="alert">
        <h3 className="state__title">Không tải được sản phẩm</h3>
        <p className="state__text">{error?.message}</p>
        <button type="button" className="btn btn--solid" onClick={onRetry}>Thử lại</button>
      </div>
    );
  }

  if (status === 'loading' && items.length === 0) return <Skeletons />;

  if (items.length === 0) {
    return (
      <div className="state">
        <h3 className="state__title">Chưa có sản phẩm nào khớp</h3>
        <p className="state__text">Thử mô tả bằng từ khác, chọn danh mục &ldquo;Tất cả&rdquo;, hoặc tải một bức ảnh lên.</p>
        <button type="button" className="btn btn--solid" onClick={onReset}>Xem tất cả sản phẩm</button>
      </div>
    );
  }

  return (
    <ul className={`grid${status === 'loading' ? ' is-stale' : ''}`}>
      {items.map((product) => (
        <ProductCard key={product.id} product={product} onOpen={onOpen} showMatch={showMatch} />
      ))}
    </ul>
  );
}
