import { HttpError, ErrorCodes } from './http-error.js';

/**
 * Tải ảnh từ URL (dùng khi lập chỉ mục ảnh sản phẩm). Giới hạn dung lượng và thời gian chờ.
 * Chỉ gọi với URL do quản trị viên/seed cung cấp, không dùng cho đầu vào của người dùng cuối.
 */
export async function fetchImageBuffer(url, { timeoutMs = 15000, maxBytes = 8 * 1024 * 1024, fetchImpl = fetch } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, `URL ảnh không hợp lệ: ${url}`, { code: ErrorCodes.INVALID_IMAGE });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new HttpError(400, 'URL ảnh phải dùng http hoặc https', { code: ErrorCodes.INVALID_IMAGE });
  }

  const res = await fetchImpl(parsed, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
    headers: { accept: 'image/*', 'user-agent': 'ttnt-indexer/2.0' },
  });
  if (!res.ok) throw new HttpError(502, `Không tải được ảnh (${res.status}): ${url}`, { code: ErrorCodes.INVALID_IMAGE });

  const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!mimeType.startsWith('image/')) {
    throw new HttpError(502, `URL không trả về ảnh (${mimeType || 'không rõ loại'}): ${url}`, { code: ErrorCodes.INVALID_IMAGE });
  }

  const declared = Number(res.headers.get('content-length'));
  if (declared > maxBytes) throw new HttpError(502, 'Ảnh quá lớn để lập chỉ mục', { code: ErrorCodes.INVALID_IMAGE });

  // Đọc theo luồng để chặn sớm khi server không khai báo content-length.
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(502, 'Ảnh quá lớn để lập chỉ mục', { code: ErrorCodes.INVALID_IMAGE });
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), mimeType };
}
