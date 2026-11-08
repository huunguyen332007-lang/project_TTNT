from __future__ import annotations

from .utils import to_vector_literal, parse_vector

PRODUCT_COLUMNS = """p.id, p.title, p.category, p.tag, p.image_url, p.description,
    p.price::float8 AS price, p.rating::float8 AS rating, p.source_url,
    (p.text_embedding IS NOT NULL AND p.image_embedding IS NOT NULL) AS indexed"""


def to_product(row: dict) -> dict:
    item = {
        "id": row["id"], "title": row["title"], "category": row["category"],
        "tag": row["tag"], "imageUrl": row["image_url"], "description": row["description"],
        "price": float(row["price"]) if row.get("price") is not None else None,
        "rating": float(row["rating"]) if row.get("rating") is not None else None,
        "sourceUrl": row.get("source_url"), "indexed": row.get("indexed", False),
    }
    if row.get("similarity") is not None:
        item["similarity"] = float(row["similarity"])
    if row.get("image_similarity") is not None:
        item["imageSimilarity"] = float(row["image_similarity"])
    return item


class BaseRepository:
    def __init__(self, pool):
        self.pool = pool

    async def rows(self, sql: str, params=()):
        async with self.pool.connection() as conn:
            cur = await conn.execute(sql, params)
            return await cur.fetchall()

    async def one(self, sql: str, params=()):
        result = await self.rows(sql, params)
        return result[0] if result else None

    async def execute(self, sql: str, params=()):
        async with self.pool.connection() as conn:
            cur = await conn.execute(sql, params)
            return cur.rowcount


class ProductRepository(BaseRepository):
    async def list(self, category=None, limit=24, offset=0):
        rows, totals = await self.rows(
            f"SELECT {PRODUCT_COLUMNS} FROM products p WHERE (%s::text IS NULL OR p.category=%s) ORDER BY p.id ASC LIMIT %s OFFSET %s",
            (category, category, limit, offset),
        ), await self.rows(
            "SELECT COUNT(*)::int AS total FROM products WHERE (%s::text IS NULL OR category=%s)", (category, category)
        )
        return {"items": [to_product(r) for r in rows], "total": totals[0]["total"]}

    async def find_by_id(self, product_id):
        row = await self.one(f"SELECT {PRODUCT_COLUMNS} FROM products p WHERE p.id=%s", (product_id,))
        return to_product(row) if row else None

    async def count(self):
        row = await self.one("SELECT COUNT(*)::int AS count FROM products")
        return row["count"]

    async def list_categories(self):
        rows = await self.rows("SELECT category AS name, COUNT(*)::int AS count FROM products GROUP BY category ORDER BY count DESC, category")
        return rows

    async def insert(self, product):
        row = await self.one(
            """INSERT INTO products (title,category,tag,image_url,description,price,rating,source_url)
               VALUES (%s,COALESCE(%s,'Khác'),COALESCE(%s,''),%s,COALESCE(%s,''),%s,%s,%s) RETURNING id""",
            (product["title"], product.get("category"), product.get("tag"), product["imageUrl"], product.get("description"), product.get("price"), product.get("rating"), product.get("sourceUrl")),
        )
        return await self.find_by_id(row["id"])

    async def upsert_imported_many(self, products, batch_size=250):
        counts = {"inserted": 0, "updated": 0}
        columns = 8
        for start in range(0, len(products), batch_size):
            batch = products[start:start + batch_size]
            values = []
            tuples = []
            for product in batch:
                base = len(values)
                values.extend((product["title"], product.get("category") or "Khác", product.get("tag") or "", product["imageUrl"], product.get("description") or "", product.get("price"), product.get("rating"), product["sourceUrl"]))
                tuples.append("(" + ",".join(["%s"] * columns) + ")")
            async with self.pool.connection() as conn:
                cur = await conn.execute(
                    f"""INSERT INTO products (title,category,tag,image_url,description,price,rating,source_url)
                    VALUES {','.join(tuples)}
                    ON CONFLICT (source_url) WHERE source_url IS NOT NULL DO UPDATE SET
                      text_embedding=CASE WHEN (products.title,products.category,products.tag,products.description)
                        IS DISTINCT FROM (EXCLUDED.title,EXCLUDED.category,EXCLUDED.tag,EXCLUDED.description) THEN NULL ELSE products.text_embedding END,
                      image_embedding=CASE WHEN products.image_url IS DISTINCT FROM EXCLUDED.image_url THEN NULL ELSE products.image_embedding END,
                      title=EXCLUDED.title,category=EXCLUDED.category,tag=EXCLUDED.tag,image_url=EXCLUDED.image_url,
                      description=EXCLUDED.description,price=EXCLUDED.price,rating=EXCLUDED.rating,
                      updated_at=CASE WHEN (products.title,products.category,products.tag,products.image_url,products.description,products.price,products.rating)
                        IS DISTINCT FROM (EXCLUDED.title,EXCLUDED.category,EXCLUDED.tag,EXCLUDED.image_url,EXCLUDED.description,EXCLUDED.price,EXCLUDED.rating)
                        THEN NOW() ELSE products.updated_at END RETURNING (xmax=0) AS inserted""",
                    values,
                )
                for row in await cur.fetchall():
                    counts["inserted" if row["inserted"] else "updated"] += 1
        return counts

    async def remove_all(self):
        return await self.execute("DELETE FROM products")

    async def remove_sample_products(self):
        # psycopg parses percent signs as placeholders even inside a quoted SQL
        # string. Bind the LIKE pattern as a value so the literal '%' is safe.
        return await self.execute(
            "DELETE FROM products WHERE source_url IS NULL AND image_url LIKE %s",
            ("https://images.unsplash.com/%",),
        )

    async def clear_embeddings(self):
        return await self.execute("UPDATE products SET text_embedding=NULL,image_embedding=NULL,embedded_at=NULL WHERE text_embedding IS NOT NULL OR image_embedding IS NOT NULL")

    async def remove(self, product_id):
        return await self.execute("DELETE FROM products WHERE id=%s", (product_id,)) > 0

    async def find_needing_embeddings(self, limit=20, exclude_ids=None):
        rows = await self.rows(
            f"""SELECT {PRODUCT_COLUMNS},(p.text_embedding IS NULL) AS needs_text,(p.image_embedding IS NULL) AS needs_image
            FROM products p WHERE (p.text_embedding IS NULL OR p.image_embedding IS NULL)
              AND NOT (p.id=ANY(%s::int[])) ORDER BY p.id LIMIT %s""",
            (exclude_ids or [], limit),
        )
        return [{**to_product(r), "needsText": r["needs_text"], "needsImage": r["needs_image"]} for r in rows]

    async def update_embeddings(self, product_id, text=None, image=None):
        await self.execute(
            """UPDATE products SET text_embedding=COALESCE(%s::vector,text_embedding),
            image_embedding=COALESCE(%s::vector,image_embedding),embedded_at=NOW(),updated_at=NOW() WHERE id=%s""",
            (to_vector_literal(text) if text else None, to_vector_literal(image) if image else None, product_id),
        )

    async def search_hybrid(self, embedding, tsquery, category, limit, min_similarity=0, candidates=50):
        vector = to_vector_literal(embedding)
        rows = await self.rows(
            f"""WITH semantic AS (
              SELECT id,ROW_NUMBER() OVER (ORDER BY dist) AS rnk FROM (
                SELECT id,text_embedding <=> %s::vector AS dist FROM products
                WHERE text_embedding IS NOT NULL AND (%s::text IS NULL OR category=%s)
                ORDER BY text_embedding <=> %s::vector LIMIT %s) s),
            keyword AS (
              SELECT id,ROW_NUMBER() OVER (ORDER BY kw_rank DESC) AS rnk FROM (
                SELECT id,ts_rank_cd(search_tsv,to_tsquery('simple',%s)) AS kw_rank FROM products
                WHERE %s::text IS NOT NULL AND search_tsv @@ to_tsquery('simple',%s)
                  AND (%s::text IS NULL OR category=%s)
                ORDER BY kw_rank DESC LIMIT %s) k)
            SELECT {PRODUCT_COLUMNS},(1-(p.text_embedding <=> %s::vector))::float8 AS similarity,
              (1-(p.image_embedding <=> %s::vector))::float8 AS image_similarity,
              (COALESCE(1.0/(60+s.rnk),0)+COALESCE(1.0/(60+k.rnk),0))::float8 AS score
            FROM products p LEFT JOIN semantic s ON s.id=p.id LEFT JOIN keyword k ON k.id=p.id
            WHERE (s.id IS NOT NULL OR k.id IS NOT NULL)
              AND (k.id IS NOT NULL OR (1-(p.text_embedding <=> %s::vector)) >= %s)
            ORDER BY score DESC,similarity DESC NULLS LAST LIMIT %s""",
            (vector, category, category, vector, candidates, tsquery, tsquery, tsquery, category, category, candidates, vector, vector, vector, min_similarity, limit),
        )
        return [to_product(r) for r in rows]

    async def search_keyword(self, tsquery, category, limit):
        if not tsquery:
            return []
        rows = await self.rows(
            f"""SELECT {PRODUCT_COLUMNS} FROM products p
            WHERE p.search_tsv @@ to_tsquery('simple',%s) AND (%s::text IS NULL OR p.category=%s)
            ORDER BY ts_rank_cd(p.search_tsv,to_tsquery('simple',%s)) DESC,p.id LIMIT %s""",
            (tsquery, category, category, tsquery, limit),
        )
        return [to_product(r) for r in rows]

    async def search_by_image(self, embedding, category, limit, min_similarity=0):
        vector = to_vector_literal(embedding)
        rows = await self.rows(
            f"""SELECT * FROM (SELECT {PRODUCT_COLUMNS},(1-(p.image_embedding <=> %s::vector))::float8 AS similarity
            FROM products p WHERE p.image_embedding IS NOT NULL AND (%s::text IS NULL OR p.category=%s)
            ORDER BY p.image_embedding <=> %s::vector LIMIT %s) ranked
            WHERE similarity >= %s ORDER BY similarity DESC""",
            (vector, category, category, vector, limit, min_similarity),
        )
        return [to_product(r) for r in rows]

    async def find_nearest_by_text(self, embedding, limit):
        vector = to_vector_literal(embedding)
        rows = await self.rows(
            f"""SELECT {PRODUCT_COLUMNS},(1-(p.text_embedding <=> %s::vector))::float8 AS similarity
            FROM products p WHERE p.text_embedding IS NOT NULL ORDER BY p.text_embedding <=> %s::vector LIMIT %s""",
            (vector, vector, limit),
        )
        return [to_product(r) for r in rows]

    async def find_similar(self, product_id, limit):
        rows = await self.rows(
            f"""SELECT {PRODUCT_COLUMNS},(1-((p.text_embedding <=> t.text_embedding)+(p.image_embedding <=> t.image_embedding))/2)::float8 AS similarity
            FROM products p JOIN products t ON t.id=%s WHERE p.id<>t.id
            AND p.text_embedding IS NOT NULL AND p.image_embedding IS NOT NULL
            AND t.text_embedding IS NOT NULL AND t.image_embedding IS NOT NULL
            ORDER BY (p.text_embedding <=> t.text_embedding)+(p.image_embedding <=> t.image_embedding) LIMIT %s""",
            (product_id, limit),
        )
        return [to_product(r) for r in rows]

    async def list_for_ranking(self, category=None):
        rows = await self.rows(f"SELECT {PRODUCT_COLUMNS} FROM products p WHERE (%s::text IS NULL OR p.category=%s) ORDER BY p.id", (category, category))
        return [to_product(r) for r in rows]

    async def find_by_ids(self, ids):
        if not ids:
            return []
        rows = await self.rows(f"SELECT {PRODUCT_COLUMNS} FROM products p WHERE p.id=ANY(%s::int[])", (ids,))
        return [to_product(r) for r in rows]

    async def similarity_to_taste(self, viewed_ids, category=None):
        if not viewed_ids:
            return {}
        rows = await self.rows(
            """WITH taste AS (SELECT AVG(text_embedding) AS v FROM products WHERE id=ANY(%s::int[]) AND text_embedding IS NOT NULL)
            SELECT p.id,(1-(p.text_embedding <=> t.v))::float8 AS similarity FROM products p,taste t
            WHERE t.v IS NOT NULL AND p.text_embedding IS NOT NULL AND NOT (p.id=ANY(%s::int[]))
            AND (%s::text IS NULL OR p.category=%s)""",
            (viewed_ids, viewed_ids, category, category),
        )
        return {r["id"]: float(r["similarity"]) for r in rows}

    async def similarity_to_vector(self, embedding, category=None):
        vector = to_vector_literal(embedding)
        rows = await self.rows(
            "SELECT p.id,(1-(p.text_embedding <=> %s::vector))::float8 AS similarity FROM products p WHERE p.text_embedding IS NOT NULL AND (%s::text IS NULL OR p.category=%s)",
            (vector, category, category),
        )
        return {r["id"]: float(r["similarity"]) for r in rows}

    async def find_latest(self, limit):
        rows = await self.rows(f"SELECT {PRODUCT_COLUMNS} FROM products p ORDER BY p.created_at DESC,p.id DESC LIMIT %s", (limit,))
        return [to_product(r) for r in rows]


class SearchHistoryRepository(BaseRepository):
    async def record(self, client_id, kind, query, category, result_count, embedding):
        await self.execute(
            "INSERT INTO search_history (client_id,kind,query,category,result_count,query_embedding) VALUES (%s,%s,%s,%s,%s,%s::vector)",
            (client_id, kind, query or "", category, result_count, to_vector_literal(embedding) if embedding else None),
        )

    async def recent(self, client_id, limit):
        rows = await self.rows("SELECT kind,query,category,searched_at FROM search_history WHERE client_id=%s ORDER BY searched_at DESC LIMIT %s", (client_id, limit))
        return [{"kind": r["kind"], "query": r["query"], "category": r["category"], "searchedAt": r["searched_at"]} for r in rows]

    async def recent_text_queries(self, client_id, limit):
        rows = await self.rows("SELECT query,query_embedding::text AS embedding FROM search_history WHERE client_id=%s AND kind='text' AND query_embedding IS NOT NULL ORDER BY searched_at DESC LIMIT %s", (client_id, limit))
        return [{"query": r["query"], "embedding": parse_vector(r["embedding"])} for r in rows]

    async def popular_queries(self, limit):
        rows = await self.rows(
            """SELECT lower(query) AS query,COUNT(*)::int AS searches FROM search_history
            WHERE kind='text' AND query<>'' AND searched_at>NOW()-INTERVAL '30 days'
            GROUP BY lower(query) HAVING COUNT(DISTINCT COALESCE(client_id::text,id::text))>=2
            ORDER BY searches DESC,MAX(searched_at) DESC LIMIT %s""", (limit,)
        )
        return [r["query"] for r in rows]

    async def clear(self, client_id):
        return await self.execute("DELETE FROM search_history WHERE client_id=%s", (client_id,))


class EventRepository(BaseRepository):
    async def record(self, client_id, kind, query, product_id, position, event):
        count = await self.execute(
            """INSERT INTO click_events (client_id,kind,query,product_id,position,event)
            SELECT %s,%s,%s,p.id,%s,%s FROM products p WHERE p.id=%s""",
            (client_id, kind, query, position, event, product_id),
        )
        return count > 0
