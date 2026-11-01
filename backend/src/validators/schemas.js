import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, DEFAULT_SEARCH_LIMIT, MAX_PAGE_SIZE, MAX_SEARCH_LIMIT } from '../config/constants.js';

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
});

export const searchTextBody = z.object({
  query: z.string().trim().min(1, 'Vui lòng nhập nội dung tìm kiếm').max(250),
  category: category.optional(),
  limit: int(1, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT),
});

// Với multipart/form-data mọi trường đều là chuỗi nên dùng coerce.
export const searchImageBody = z.object({
  category: category.optional(),
  limit: int(1, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT),
});
