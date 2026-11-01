import { useCallback, useEffect, useState } from 'react';
import { listProducts, searchImage, searchText } from '../api/index.js';

const INITIAL = { status: 'loading', items: [], total: 0, mode: 'browse', error: null };

/**
 * Trạng thái trung tâm của trang: đang duyệt tất cả, tìm bằng văn bản, hay tìm bằng ảnh.
 * Mỗi lần "điều kiện" thay đổi (từ khóa, ảnh, danh mục) một effect duy nhất gọi API,
 * và hủy request cũ để kết quả đến muộn không ghi đè kết quả mới.
 */
export function useDiscovery() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState(null); // null | { type: 'text', query } | { type: 'image', file }
  const [category, setCategory] = useState('');
  const [nonce, setNonce] = useState(0); // tăng để thử lại cùng điều kiện
  const [searchCount, setSearchCount] = useState(0); // báo cho gợi ý/lịch sử biết cần tải lại
  const [result, setResult] = useState(INITIAL);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setResult((prev) => ({ ...prev, status: 'loading', error: null }));

    let request;
    if (!submitted) {
      request = listProducts({ category, signal }).then((d) => ({ items: d.items, total: d.total, mode: 'browse' }));
    } else if (submitted.type === 'text') {
      request = searchText({ query: submitted.query, category, signal }).then((d) => ({ items: d.items, total: d.count, mode: d.mode }));
    } else {
      request = searchImage({ file: submitted.file, category, signal }).then((d) => ({ items: d.items, total: d.count, mode: 'image' }));
    }

    request
      .then((data) => {
        if (signal.aborted) return;
        setResult({ status: 'success', error: null, ...data });
        if (submitted) setSearchCount((n) => n + 1);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setResult({ status: 'error', items: [], total: 0, mode: 'browse', error });
      });

    return () => controller.abort();
  }, [submitted, category, nonce]);

  const submitText = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setSubmitted({ type: 'text', query: trimmed });
  }, []);

  const submitImage = useCallback((file) => {
    setQuery('');
    setSubmitted({ type: 'image', file });
  }, []);

  const reset = useCallback(() => {
    setQuery('');
    setCategory('');
    setSubmitted(null);
  }, []);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { query, setQuery, submitted, category, setCategory, result, searchCount, submitText, submitImage, reset, retry };
}
