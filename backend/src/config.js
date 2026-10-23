export const config = {
  port: Number(process.env.PORT || 3000),
  productsDbUrl: process.env.PRODUCTS_DATABASE_URL || 'postgres://products_user:products_pass@products-db:5432/products_db',
  searchDbUrl: process.env.SEARCH_DATABASE_URL || 'postgres://search_user:search_pass@search-db:5432/search_db',
  frontendOrigin: process.env.FRONTEND_ORIGIN || '*',
  seedOnStart: (process.env.SEED_ON_START || 'true').toLowerCase() === 'true',
};
