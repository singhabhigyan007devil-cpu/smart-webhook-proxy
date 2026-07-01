import os
from arq.connections import RedisSettings
from backend.app.db import AsyncSessionLocal
from backend.app.routers.worker import process_webhook_task, WorkerPayload

async def process_webhook(ctx, endpoint_id: str, payload_str: str, headers: dict, retry_count: int):
    payload = WorkerPayload(
        endpoint_id=endpoint_id, 
        payload_string=payload_str, 
        headers=headers, 
        retry_count=retry_count
    )
    async with AsyncSessionLocal() as db:
        await process_webhook_task(payload=payload, db=db)

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    functions = [process_webhook]
