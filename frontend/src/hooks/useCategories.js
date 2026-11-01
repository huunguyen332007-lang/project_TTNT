import { listCategories } from '../api/index.js';
import { useAsync } from './useAsync.js';

export function useCategories() {
  const { data } = useAsync((signal) => listCategories(signal).then((d) => d.items), [], []);
  return data;
}
