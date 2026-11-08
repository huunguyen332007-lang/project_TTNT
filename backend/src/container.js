import { AiClient } from './clients/ai.client.js';
import { ProductRepository } from './repositories/product.repository.js';
import { SearchHistoryRepository } from './repositories/search-history.repository.js';
import { EmbeddingService } from './services/embedding.service.js';
import { IndexingService } from './services/indexing.service.js';
import { ProductService } from './services/product.service.js';
import { SearchService } from './services/search.service.js';
import { RecommendationService } from './services/recommendation.service.js';
import { RecommendService } from './services/recommend.service.js';
import { HistoryService } from './services/history.service.js';
import { HealthService } from './services/health.service.js';

/** Nơi duy nhất lắp ghép repository -> service. Controller và route chỉ nhận service đã dựng sẵn. */
export function createContainer({ config, logger, pool }) {
  const ai = new AiClient({ baseUrl: config.aiServiceUrl, timeoutMs: config.aiTimeoutMs });

  const productRepo = new ProductRepository(pool);
  const historyRepo = new SearchHistoryRepository(pool);

  const embeddings = new EmbeddingService({ ai });
  const indexing = new IndexingService({ products: productRepo, embeddings, logger });
  const search = new SearchService({
    products: productRepo,
    history: historyRepo,
    embeddings,
    logger,
    textMinSimilarity: config.textMinSimilarity,
    imageMinSimilarity: config.imageMinSimilarity,
    textImageWeight: config.textImageWeight,
  });

  return {
    repositories: { products: productRepo, history: historyRepo },
    services: {
      health: new HealthService({ pool, ai }),
      products: new ProductService({ products: productRepo, indexing, logger }),
      search,
      recommendations: new RecommendationService({ products: productRepo, history: historyRepo }),
      recommend: new RecommendService({ products: productRepo, search, history: historyRepo, textImageWeight: config.textImageWeight }),
      history: new HistoryService({ history: historyRepo }),
      indexing,
    },
  };
}
