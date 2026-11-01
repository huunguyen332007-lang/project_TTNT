import { notFound } from '../utils/http-error.js';
import { DEFAULT_PAGE_SIZE } from '../config/constants.js';

export class ProductService {
  constructor({ products, indexing, logger }) {
    this.products = products;
    this.indexing = indexing;
    this.logger = logger;
  }

  async list({ category, limit = DEFAULT_PAGE_SIZE, offset = 0 }) {
    const { items, total } = await this.products.list({ category, limit, offset });
    return { items, total, limit, offset };
  }

  async get(id) {
    const item = await this.products.findById(id);
    if (!item) throw notFound('Không tìm thấy sản phẩm');
    return item;
  }

  categories() {
    return this.products.listCategories();
  }

  /** Tạo sản phẩm rồi lập chỉ mục. Nếu AI đang lỗi, sản phẩm vẫn được lưu và sẽ được reindex sau. */
  async create(input) {
    const created = await this.products.insert(input);
    let indexed = false;
    try {
      await this.indexing.indexOne(created);
      indexed = true;
    } catch (err) {
      this.logger.warn({ err, productId: created.id }, 'Đã lưu sản phẩm nhưng chưa lập được chỉ mục');
    }
    return { item: (await this.products.findById(created.id)) ?? created, indexed };
  }

  async remove(id) {
    if (!(await this.products.remove(id))) throw notFound('Không tìm thấy sản phẩm');
  }
}
