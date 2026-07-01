import time
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.app.models import Endpoint

class SlugCache:
    def __init__(self, ttl_seconds: float = 60.0):
        self.ttl = ttl_seconds
        self.cache: Dict[str, Dict[str, Any]] = {}

    async def get_endpoint_by_slug(self, slug: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
        now = time.time()
        
        # Cache hit
        if slug in self.cache:
            entry = self.cache[slug]
            if now < entry["expires_at"]:
                return entry["data"]
            else:
                del self.cache[slug]

        # Cache miss - fetch from database
        result = await db.execute(select(Endpoint).where(Endpoint.slug == slug))
        endpoint = result.scalars().first()
        
        if not endpoint:
            return None

        # Store in cache
        data = {
            "id": endpoint.id,
            "target_url": endpoint.target_url,
            "secret_token": endpoint.secret_token,
            "active_state": endpoint.active_state,
            "rate_limit_rpm": getattr(endpoint, "rate_limit_rpm", 600)
        }
        
        self.cache[slug] = {
            "data": data,
            "expires_at": now + self.ttl
        }
        
        return data

    def invalidate(self, slug: str) -> None:
        if slug in self.cache:
            del self.cache[slug]

    def clear(self) -> None:
        self.cache.clear()

slug_cache = SlugCache()
