import ProductCard from './ProductCard.jsx';

export default function Recommendations({ data, onOpen }) {
  if (!data.items.length) return null;
  const personalized = data.strategy === 'personalized';

  return (
    <section className="section" aria-labelledby="recs-title">
      <div className="section__head">
        <h2 id="recs-title" className="section__title">Gợi ý cho bạn</h2>
        <p className="section__sub">
          {personalized ? `Dựa trên những gì bạn tìm gần đây: ${data.basedOn.join(', ')}.` : 'Những sản phẩm mới thêm vào gần đây.'}
        </p>
      </div>
      <ul className="grid grid--compact">
        {data.items.map((product) => (
          <ProductCard key={product.id} product={product} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}
