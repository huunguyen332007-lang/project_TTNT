import { useState } from 'react';
import { Clock, RotateCcw, Trash2 } from 'lucide-react';
import Header from '../components/Header.jsx';
import SearchBox from '../components/SearchBox.jsx';
import PhotoDrop from '../components/PhotoDrop.jsx';
import CategoryTabs from '../components/CategoryTabs.jsx';
import ProductGrid from '../components/ProductGrid.jsx';
import Recommendations from '../components/Recommendations.jsx';
import ProductDialog from '../components/ProductDialog.jsx';
import Footer from '../components/Footer.jsx';
import { useDiscovery } from '../hooks/useDiscovery.js';
import { useCategories } from '../hooks/useCategories.js';
import { useHealth } from '../hooks/useHealth.js';
import { useRecommendations } from '../hooks/useRecommendations.js';
import { useHistory } from '../hooks/useHistory.js';

const STARTER_QUERIES = ['không gian làm việc', 'màu sắc dịu nhẹ', 'cảm hứng thiên nhiên'];

function describeResult(submitted, result) {
  if (!submitted) return { title: 'Tất cả sản phẩm', note: `${result.total} sản phẩm` };
  if (submitted.type === 'image') return { title: 'Sản phẩm giống ảnh của bạn', note: `${result.total} kết quả, xếp theo độ giống` };
  return { title: `Kết quả cho “${submitted.query}”`, note: `${result.total} kết quả, xếp theo độ phù hợp` };
}

export default function HomePage() {
  const discovery = useDiscovery();
  const { query, setQuery, submitted, category, result } = discovery;

  const categories = useCategories();
  const health = useHealth();
  const recommendations = useRecommendations(discovery.searchCount);
  const history = useHistory(discovery.searchCount);
  const [selected, setSelected] = useState(null);

  const busy = result.status === 'loading';
  const imageFile = submitted?.type === 'image' ? submitted.file : null;
  const heading = describeResult(submitted, result);

  const recentQueries = [...new Set(history.items.filter((h) => h.kind === 'text' && h.query).map((h) => h.query))].slice(0, 5);
  const chips = recentQueries.length ? recentQueries : recommendations.trendingQueries.length ? recommendations.trendingQueries.slice(0, 5) : STARTER_QUERIES;
  const chipsLabel = recentQueries.length ? 'Tìm gần đây' : recommendations.trendingQueries.length ? 'Nhiều người đang tìm' : 'Thử tìm';

  return (
    <div className="page">
      <Header health={health} onHome={discovery.reset} />

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <h1 id="hero-title" className="hero__title">Mô tả thứ bạn cần, hoặc cho chúng tôi xem ảnh.</h1>
            <p className="hero__lead">Hệ thống hiểu ý nghĩa câu chữ và hình ảnh, rồi gợi ý những sản phẩm gần nhất.</p>

            <SearchBox value={query} onChange={setQuery} onSubmit={discovery.submitText} busy={busy} />

            <div className="chips">
              <span className="chips__label"><Clock size={14} aria-hidden="true" /> {chipsLabel}</span>
              <ul className="chips__list">
                {chips.map((text) => (
                  <li key={text}>
                    <button type="button" className="chip" onClick={() => discovery.submitText(text)}>{text}</button>
                  </li>
                ))}
              </ul>
              {recentQueries.length > 0 && (
                <button type="button" className="btn btn--text btn--small" onClick={history.clear}>
                  <Trash2 size={14} aria-hidden="true" /> Xóa lịch sử
                </button>
              )}
            </div>
          </div>

          <PhotoDrop file={imageFile} onPick={discovery.submitImage} onClear={discovery.reset} disabled={busy && submitted?.type === 'image'} />
        </section>

        {!submitted && <Recommendations data={recommendations} onOpen={setSelected} />}

        <section className="section" aria-labelledby="results-title">
          <div className="section__head section__head--row">
            <div>
              <h2 id="results-title" className="section__title">{heading.title}</h2>
              <p className="section__sub" aria-live="polite">{busy ? 'Đang tìm...' : heading.note}</p>
            </div>
            {submitted && (
              <button type="button" className="btn btn--outline" onClick={discovery.reset}>
                <RotateCcw size={16} aria-hidden="true" /> Xem tất cả
              </button>
            )}
          </div>

          {result.mode === 'keyword' && result.status === 'success' && (
            <p className="notice" role="status">
              Dịch vụ AI tạm thời không phản hồi nên kết quả chỉ dựa trên từ khóa. Câu mô tả dài có thể cho ít kết quả hơn bình thường.
            </p>
          )}

          <CategoryTabs categories={categories} value={category} onChange={discovery.setCategory} />

          <ProductGrid
            status={result.status}
            items={result.items}
            error={result.error}
            showMatch={Boolean(submitted) && result.mode !== 'keyword'}
            onOpen={setSelected}
            onRetry={discovery.retry}
            onReset={discovery.reset}
          />
        </section>
      </main>

      <Footer />
      <ProductDialog product={selected} onClose={() => setSelected(null)} onOpenOther={setSelected} />
    </div>
  );
}
