import { getHealth } from '../api/index.js';
import { useAsync } from './useAsync.js';

/** Trạng thái hệ thống để hiển thị ở header: ok | degraded (AI tạm ngưng) | error | unknown. */
export function useHealth() {
  const { status, data } = useAsync((signal) => getHealth(signal), [], null);
  if (status === 'loading') return 'unknown';
  if (status === 'error') return 'error';
  return data?.status ?? 'unknown';
}
