import { getRecommendations } from '../api/index.js';
import { useAsync } from './useAsync.js';

const EMPTY = { strategy: 'latest', basedOn: [], items: [], trendingQueries: [] };

/** Gợi ý cho người dùng hiện tại; tải lại mỗi khi họ vừa thực hiện một lượt tìm kiếm. */
export function useRecommendations(refreshKey) {
  return useAsync((signal) => getRecommendations(signal), [refreshKey], EMPTY).data;
}
