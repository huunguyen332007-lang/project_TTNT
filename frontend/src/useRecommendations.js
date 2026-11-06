import { useCallback, useEffect, useRef, useState } from "react";
import { getRecommendations, searchByImage } from "./api.js";

export const PAGE_SIZE = 24;

/**
 * Tải danh sách gợi ý theo bộ lọc hiện tại và phân trang "Xem thêm".
 *  - Đổi bộ lọc -> tải lại từ trang đầu (debounce 200ms, hủy request cũ).
 *  - Lịch sử xem (viewedIds) được đọc mới nhất mỗi lần tải lại nhưng KHÔNG tự kích hoạt tải lại: nếu không, mỗi lần
 *    mở một sản phẩm danh sách sẽ nhảy về trang đầu và người dùng mất những trang đã "Xem thêm".
 *  - "Xem thêm" -> tải trang kế (limit/offset); thứ hạng của backend xác định nên các trang nối tiếp không trùng/sót.
 *  - Kết quả của bộ lọc cũ (đang bay trên mạng) không bao giờ được trộn vào danh sách mới.
 *  - Khi tìm bằng ảnh, backend trả một danh sách đã xếp hạng, không phân trang.
 */
export function useRecommendations({ query, category, interests, budget, viewedIds, sort, image, enabled = true, restoreResult = null }) {
  const [state, setState] = useState({ items: [], total: 0, mode: "browse", key: null, params: null, loading: true, loadingMore: false, error: "" });
  const [nonce, setNonce] = useState(0);
  const epoch = useRef(0);
  const restoredOnce = useRef(false);

  const params = { query: query.trim(), category, interests, budget, viewedIds, sort };
  const key = JSON.stringify([{ query: params.query, category, interests, budget, sort }, image?.id ?? null, nonce]);
  const latest = useRef({ params, image, key });
  latest.current = { params, image, key };

  useEffect(() => {
    if (!enabled) return undefined;
    const { params: currentParams } = latest.current;
    if (restoreResult && !restoredOnce.current && restoreResult.kind === (image ? "image" : "text") &&
        (image || restoreResult.query === currentParams.query) &&
        (restoreResult.category || "Tất cả") === (currentParams.category || "Tất cả")) {
      restoredOnce.current = true;
      setState({ ...restoreResult.result, key, params: currentParams, loading: false, loadingMore: false, error: "" });
      return undefined;
    }
    const ctrl = new AbortController();
    const mine = ++epoch.current;
    const timer = setTimeout(async () => {
      const { params: p, image: img, key: k } = latest.current;
      setState((s) => ({ ...s, loading: true, loadingMore: false, error: "" }));
      try {
        if (img && !img.file) throw new Error("Không tìm thấy ảnh gốc trong bộ nhớ trình duyệt. Hãy tải ảnh lên lại.");
        const res = img
          ? await searchByImage(img.file, p.category, ctrl.signal)
          : await getRecommendations({ ...p, limit: PAGE_SIZE, offset: 0 }, ctrl.signal);
        if (mine === epoch.current) setState({ ...res, key: k, params: p, loading: false, loadingMore: false, error: "" });
      } catch (e) {
        if (e.name !== "AbortError" && mine === epoch.current) setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, enabled, restoreResult]);

  const stale = state.key !== key; // bộ lọc vừa đổi, danh sách đang hiển thị thuộc bộ lọc cũ
  const hasMore = !stale && !image && state.items.length < state.total;

  const loadMore = useCallback(async () => {
    if (!hasMore || state.loading || state.loadingMore) return;
    const mine = epoch.current;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      // Dùng đúng tham số của trang đầu (kể cả lịch sử xem lúc đó) để thứ hạng giữa các trang nhất quán.
      const res = await getRecommendations({ ...state.params, limit: PAGE_SIZE, offset: state.items.length });
      if (mine !== epoch.current) return;
      setState((s) => {
        const seen = new Set(s.items.map((p) => p.id));
        return { ...s, items: [...s.items, ...res.items.filter((p) => !seen.has(p.id))], total: res.total, loadingMore: false };
      });
    } catch (e) {
      if (mine === epoch.current) setState((s) => ({ ...s, loadingMore: false, error: e.message }));
    }
  }, [hasMore, state.loading, state.loadingMore, state.items.length, state.params]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, stale, hasMore, loadMore, retry };
}
