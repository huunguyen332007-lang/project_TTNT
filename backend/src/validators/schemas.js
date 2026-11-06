import { z } from 'zod';
import {
  BUDGETS, DEFAULT_PAGE_SIZE, DEFAULT_RECOMMEND_LIMIT, DEFAULT_SEARCH_LIMIT, MAX_PAGE_SIZE, MAX_RECOMMEND_LIMIT, MAX_SEARCH_LIMIT, RECOMMEND_SORTS,
} from '../config/constants.js';

const category = z.string().trim().min(1).max(100);
const int = (min, max, fallback) => z.coerce.number().int().min(min).max(max).default(fallback);

export const idParams = z.object({ id: z.coerce.number().int().positive() });

export const listProductsQuery = z.object({
  category: category.optional(),
  limit: int(1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
  offset: int(0, 1_000_000, 0),
});

export const limitQuery = (fallback, max = 20) => z.object({ limit: int(1, max, fallback) });

export const createProductBody = z.object({
  title: z.string().trim().min(1).max(200),
  category: category.optional(),
  tag: z.string().trim().max(50).optional(),
  imageUrl: z.string().trim().url().max(2000),
  description: z.string().trim().max(2000).optional(),
  price: z.number().nonnegative().max(1e12).optional(),
  rating: z.number().min(0).max(5).optional(),
  sourceUrl: z.string().trim().url().max(2000).optional(),
});

export const searchTextBody = z.object({
  query: z.string().trim().min(1, 'Vui lòng nhập nội dung tìm kiếm').max(250),
  category: category.optional(),
  limit: int(1, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT),
});

// Gợi ý cá nhân hóa. Lịch sử xem do trình duyệt giữ và gửi lên (viewedIds), server không lưu.
export const recommendBody = z.object({
  query: z.string().trim().max(250).default(''),
  category: category.optional(),
  interests: z.array(category).max(30).default([]),
  budget: z.enum(['any', ...Object.keys(BUDGETS)]).default('any'),
  viewedIds: z.array(z.number().int().positive()).max(50).default([]),
  sort: z.enum(RECOMMEND_SORTS).default('relevance'),
  limit: int(1, MAX_RECOMMEND_LIMIT, DEFAULT_RECOMMEND_LIMIT),
  offset: int(0, 1_000_000, 0),
});

// Với multipart/form-data mọi trường đều là chuỗi nên dùng coerce.
export const searchImageBody = z.object({
  category: category.optional(),
  limit: int(1, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT),
});
