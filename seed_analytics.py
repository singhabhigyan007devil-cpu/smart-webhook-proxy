import asyncio
import random
from datetime import datetime, timedelta, timezone
import uuid

from backend.app.db import AsyncSessionLocal
from backend.app.models import User, Endpoint, WebhookLog

async def seed_analytics():
    async with AsyncSessionLocal() as db:
        # Get first user and their endpoint
        from sqlalchemy import select
        res = await db.execute(select(User).limit(1))
        user = res.scalars().first()
        if not user:
            print("No user found.")
            return

        res = await db.execute(select(Endpoint).where(Endpoint.user_id == user.id).limit(1))
        endpoint = res.scalars().first()
        if not endpoint:
            print("No endpoint found for user.")
            return

        now = datetime.now(timezone.utc)
        
        # Generate logs for the last 30 days
        for i in range(150):
            days_ago = random.randint(0, 30)
            hours_ago = random.randint(0, 23)
            created_at = now - timedelta(days=days_ago, hours=hours_ago)
            
            # 80% success rate
            is_success = random.random() < 0.8
            delivery_status = "success" if is_success else "failed"
            response_code = 200 if is_success else random.choice([500, 502, 503, 404])
            
            # Latency between 50ms and 800ms
            latency_ms = random.randint(50, 800)
            if not is_success:
                latency_ms = random.randint(500, 3000) # failures usually take longer
                
            log = WebhookLog(
                id=str(uuid.uuid4()),
                endpoint_id=endpoint.id,
                payload_string='{"event": "mock"}',
                headers_json={"mock": "true"},
                response_code=response_code,
                delivery_status=delivery_status,
                retry_count=0,
                error_message=None if is_success else "Mock failure",
                latency_ms=latency_ms,
                created_at=created_at,
                updated_at=created_at
            )
            db.add(log)
            
        await db.commit()
        print(f"Seeded 150 webhook logs for endpoint {endpoint.slug}")

if __name__ == "__main__":
    asyncio.run(seed_analytics())
