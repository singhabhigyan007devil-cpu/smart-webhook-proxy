from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
import redis.asyncio as aioredis
from backend.app.config import settings

# Global Redis Client
redis_client = aioredis.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True
)

# For SQLite, we might need special args for concurrency (e.g. check_same_thread)
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def init_db() -> None:
    # Programmatic table creation if using SQLite or postgres local fallback
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # SQLite migrations for existing DBs
        try:
            await conn.execute(text("ALTER TABLE endpoints ADD COLUMN idempotency_strategy VARCHAR(50) DEFAULT 'auto' NOT NULL"))
        except Exception:
            pass
        
        try:
            await conn.execute(text("ALTER TABLE endpoints ADD COLUMN idempotency_ttl INTEGER DEFAULT 86400 NOT NULL"))
        except Exception:
            pass
        
        try:
            await conn.execute(text("ALTER TABLE idempotency_keys ADD COLUMN expires_at DATETIME"))
        except Exception:
            pass


