import { request } from './http.js';

const withCategory = (category) => (category ? { category } : {});

export const getHealth = (signal) => request('/health', { signal });
export const listCategories = (signal) => request('/categories', { signal });
export const listProducts = ({ category, limit = 48, signal } = {}) => {
  const params = new URLSearchParams({ limit: String(limit), ...withCategory(category) });
  return request(`/products?${params}`, { signal });
};
export const getSimilar = (id, { limit = 4, signal } = {}) => request(`/products/${id}/similar?limit=${limit}`, { signal });

export const searchText = ({ query, category, signal }) =>
  request('/search/text', { method: 'POST', body: { query, ...withCategory(category) }, signal });

export const searchImage = ({ file, category, signal }) => {
  const form = new FormData();
  form.append('image', file);
  if (category) form.append('category', category);
  return request('/search/image', { method: 'POST', body: form, signal });
};

export const getRecommendations = (signal) => request('/recommendations?limit=4', { signal });
export const getHistory = (signal) => request('/history?limit=8', { signal });
export const clearHistory = () => request('/history', { method: 'DELETE' });
