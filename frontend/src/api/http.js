import { getClientId } from './clientId.js';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Gọi API, tự gắn X-Client-Id và chuyển lỗi thành ApiError có thông điệp tiếng Việt. */
export async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const clientId = getClientId();
  if (clientId) headers['X-Client-Id'] = clientId;

  const isForm = body instanceof FormData;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, { method, headers, signal, body: body && !isForm ? JSON.stringify(body) : body });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Không kết nối được tới máy chủ. Hãy kiểm tra mạng rồi thử lại.', { code: 'NETWORK' });
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error?.message || `Máy chủ trả về lỗi ${res.status}. Hãy thử lại sau.`, {
      status: res.status,
      code: data?.error?.code,
    });
  }
  return data;
}
