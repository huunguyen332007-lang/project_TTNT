from app.repositories import ProductRepository


class FakeCursor:
    rowcount = 7


class FakeConnection:
    def __init__(self):
        self.sql = None
        self.params = None

    async def execute(self, sql, params=()):
        self.sql = sql
        self.params = params
        return FakeCursor()


class ConnectionContext:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakePool:
    def __init__(self, connection):
        self._connection = connection

    def connection(self):
        return ConnectionContext(self._connection)


async def test_remove_sample_products_binds_like_pattern_as_parameter():
    connection = FakeConnection()
    repo = ProductRepository(FakePool(connection))

    removed = await repo.remove_sample_products()

    assert removed == 7
    assert "image_url LIKE %s" in connection.sql
    assert connection.params == ("https://images.unsplash.com/%",)
    assert "LIKE 'https://images.unsplash.com/%'" not in connection.sql
