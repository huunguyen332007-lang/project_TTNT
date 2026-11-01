import { useCallback, useState } from 'react';
import { clearHistory, getHistory } from '../api/index.js';
import { useAsync } from './useAsync.js';

export function useHistory(refreshKey) {
  const [clearedAt, setClearedAt] = useState(0);
  const { data } = useAsync((signal) => getHistory(signal).then((d) => d.items), [refreshKey, clearedAt], []);

  const clear = useCallback(async () => {
    await clearHistory().catch(() => {});
    setClearedAt((n) => n + 1);
  }, []);

  return { items: data, clear };
}
