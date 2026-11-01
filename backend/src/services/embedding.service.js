import { buildProductText } from '../utils/text.js';
import { fetchImageBuffer } from '../utils/fetch-image.js';

/** Tạo embedding cho truy vấn và sản phẩm; có cache nhỏ cho truy vấn văn bản lặp lại. */
export class EmbeddingService {
  constructor({ ai, imageFetcher = fetchImageBuffer, cacheSize = 500 }) {
    this.ai = ai;
    this.imageFetcher = imageFetcher;
    this.cacheSize = cacheSize;
    this.cache = new Map(); // Map giữ thứ tự chèn -> dùng làm LRU đơn giản
  }

  async embedQuery(text) {
    const key = text.normalize('NFC').toLowerCase();
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const [vector] = await this.ai.embedTexts([text]);
    this.cache.set(key, vector);
    if (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
    return vector;
  }

  embedUploadedImage(buffer, mimeType) {
    return this.ai.embedImage(buffer, mimeType);
  }

  async embedProductText(product) {
    const [vector] = await this.ai.embedTexts([buildProductText(product)]);
    return vector;
  }

  async embedProductImage(product) {
    const { buffer, mimeType } = await this.imageFetcher(product.imageUrl);
    return this.ai.embedImage(buffer, mimeType);
  }
}
