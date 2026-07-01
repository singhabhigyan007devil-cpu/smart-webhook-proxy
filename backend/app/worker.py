import os
from datetime import datetime, timedelta, timezone
from arq.connections import RedisSettings
from arq.cron import cron
from sqlalchemy import delete
from backend.app.db import AsyncSessionLocal
from backend.app.models import WebhookLog
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

async def prune_old_logs(ctx):
    """Deletes successful webhook logs older than 30 days to save DB space."""
    async with AsyncSessionLocal() as db:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=30)
        result = await db.execute(
            delete(WebhookLog)
            .where(WebhookLog.status == "success")
            .where(WebhookLog.created_at < cutoff_date)
        )
        await db.commit()
        print(f"[CRON] Pruned old successful logs older than 30 days.")

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    functions = [process_webhook, prune_old_logs]
    cron_jobs = [
        # Run at midnight every day
        cron(prune_old_logs, hour=0, minute=0)
    ]
