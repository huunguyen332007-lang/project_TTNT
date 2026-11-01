import { useEffect, useState } from 'react';

/**
 * Tải dữ liệu một lần (và tải lại khi `deps` đổi), tự hủy request khi component rời đi.
 * Lỗi được nuốt vào trạng thái 'error' vì đây là dữ liệu phụ (gợi ý, lịch sử...), không nên chặn trang.
 */
export function useAsync(fetcher, deps, initial) {
  const [state, setState] = useState({ status: 'loading', data: initial });

  useEffect(() => {
    const controller = new AbortController();
    fetcher(controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((err) => {
        if (err.name !== 'AbortError') setState((prev) => ({ status: 'error', data: prev.data }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
