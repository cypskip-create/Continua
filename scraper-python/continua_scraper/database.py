"""Small, cancellable native PostgreSQL pool; all values are parameter-bound."""
import asyncio
import contextlib

class Database:
    def __init__(self, pool):
        self.pool=pool

    @classmethod
    async def open(cls, connection):
        from .database_tls import secure_connection
        from psycopg.rows import dict_row
        from psycopg_pool import AsyncConnectionPool
        pool=AsyncConnectionPool(secure_connection(connection),min_size=0,max_size=2,max_waiting=16,
            timeout=10,open=False,kwargs={"autocommit":True,"row_factory":dict_row,"connect_timeout":10,"prepare_threshold":None,
                                        "options":"-c statement_timeout=12000 -c lock_timeout=10000"})
        await pool.open()
        return cls(pool)

    async def query(self, sql, params=()):
        async with asyncio.timeout(15):
            async with self.pool.connection() as connection:
                cursor=await connection.execute(sql,params)
                return await cursor.fetchall() if cursor.description is not None else []

    @contextlib.asynccontextmanager
    async def transaction(self):
        async with asyncio.timeout(30):
            async with self.pool.connection() as connection:
                async with connection.transaction():
                    yield ConnectionQueries(connection)

    async def close(self):
        await self.pool.close()

class ConnectionQueries:
    def __init__(self,connection):
        self.connection=connection

    async def query(self,sql,params=()):
        cursor=await self.connection.execute(sql,params)
        return await cursor.fetchall() if cursor.description is not None else []
