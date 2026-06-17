from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.app.models import Endpoint
from backend.app.cache import slug_cache
from backend.app.config import settings

async def register_success(db: AsyncSession, endpoint_id: str) -> None:
    result = await db.execute(select(Endpoint).where(Endpoint.id == endpoint_id))
    endpoint = result.scalars().first()
    if endpoint:
        if endpoint.failure_count > 0:
            endpoint.failure_count = 0
            await db.commit()
            slug_cache.invalidate(endpoint.slug)

async def register_failure(db: AsyncSession, endpoint_id: str) -> bool:
    """
    Increments failure count. Returns True if the circuit breaker has tripped (endpoint paused).
    """
    result = await db.execute(select(Endpoint).where(Endpoint.id == endpoint_id))
    endpoint = result.scalars().first()
    
    if not endpoint:
        return False
        
    endpoint.failure_count += 1
    tripped = False
    
    if endpoint.failure_count >= settings.CIRCUIT_BREAKER_LIMIT:
        endpoint.active_state = False
        tripped = True
        # Print warning/alert (in production this could trigger an email or Slack webhook)
        print(f"[CIRCUIT BREAKER TRIPPED] Endpoint '{endpoint.slug}' paused due to {endpoint.failure_count} consecutive failures.")
        
    await db.commit()
    slug_cache.invalidate(endpoint.slug)
    return tripped
