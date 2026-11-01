import { HttpError, ErrorCodes } from '../utils/http-error.js';

/** Client HTTP gọi dịch vụ AI (FastAPI) để tạo embedding. */
export class AiClient {
  constructor({ baseUrl, timeoutMs = 30000, fetchImpl = fetch }) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async #request(path, init, { timeoutMs = this.timeoutMs, rejectCode = ErrorCodes.VALIDATION } = {}) {
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new HttpError(503, 'Dịch vụ AI chưa phản hồi, vui lòng thử lại sau', { code: ErrorCodes.AI_UNAVAILABLE, cause: err });
    }

    // 4xx = AI service từ chối đầu vào (ảnh hỏng, văn bản quá dài...) -> lỗi của người gọi.
    if (res.status >= 400 && res.status < 500) {
      const body = await res.json().catch(() => null);
      const message = body?.detail?.message ?? (typeof body?.detail === 'string' ? body.detail : 'Dịch vụ AI từ chối dữ liệu đầu vào');
      throw new HttpError(res.status === 422 ? 400 : res.status, message, { code: rejectCode });
    }
    if (!res.ok) {
      throw new HttpError(503, 'Dịch vụ AI đang gặp sự cố', { code: ErrorCodes.AI_UNAVAILABLE });
    }
    return res.json();
  }

  /** @returns {Promise<number[][]>} một vector (512 số) cho mỗi văn bản, đã chuẩn hóa độ dài. */
  async embedTexts(texts) {
    const data = await this.#request('/embed/text', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts }),
    });
    return data.embeddings;
  }

  /** @returns {Promise<number[]>} */
  async embedImage(buffer, mimeType = 'application/octet-stream') {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), 'upload');
    const data = await this.#request('/embed/image', { method: 'POST', body: form }, { rejectCode: ErrorCodes.INVALID_IMAGE });
    return data.embedding;
  }

  async health() {
    const data = await this.#request('/health', { method: 'GET' }, { timeoutMs: 2000 });
    return data;
  }
}
