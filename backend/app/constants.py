EMBEDDING_DIM = 512
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
DEFAULT_PAGE_SIZE = 24
MAX_PAGE_SIZE = 100
DEFAULT_SEARCH_LIMIT = 12
MAX_SEARCH_LIMIT = 50
DEFAULT_RECOMMEND_LIMIT = 96
MAX_RECOMMEND_LIMIT = 300
RECOMMEND_SORTS = {"relevance", "priceAsc", "priceDesc", "rating"}
BUDGETS = {
    "low": (0, 100_000),
    "mid": (100_000, 300_000),
    "high": (300_000, 1_000_000),
    "premium": (1_000_000, float("inf")),
}
