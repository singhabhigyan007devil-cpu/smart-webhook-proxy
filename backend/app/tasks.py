import os
import asyncio
from typing import Dict, Any, Optional
from arq import create_pool
from arq.connections import RedisSettings
from backend.app.config import settings

# Global Redis pool for ARQ
_redis_pool = None

async def get_redis_pool():
    global _redis_pool
    if not _redis_pool:
        redis_settings = RedisSettings.from_dsn(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
        _redis_pool = await create_pool(redis_settings)
    return _redis_pool

async def enqueue_webhook_task(
    endpoint_id: str,
    payload_string: str,
    headers: Dict[str, str],
    retry_count: int = 0,
    delay_seconds: float = 0.0
) -> None:
    pool = await get_redis_pool()
    
    defer_by = delay_seconds if delay_seconds > 0 else None
    
    await pool.enqueue_job(
        "process_webhook",
        endpoint_id,
        payload_string,
        headers,
        retry_count,
        _defer_by=defer_by
    )
    
    print(f"[QUEUE] Enqueued ARQ Redis Task (Attempt: {retry_count}, Delay: {delay_seconds}s)")
