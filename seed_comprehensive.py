import asyncio
import random
from datetime import datetime, timedelta, timezone
import uuid
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from backend.app.db import AsyncSessionLocal
from backend.app.models import User, Endpoint, WebhookLog, Project

async def seed_all():
    async with AsyncSessionLocal() as db:
        # Get tester user
        from sqlalchemy import select
        res = await db.execute(select(User).where(User.email == "tester@example.com").limit(1))
        user = res.scalars().first()
        if not user:
            print("Tester user not found.")
            return

        # Ensure user has 3 Projects for Roadmaps
        res = await db.execute(select(Project).where(Project.user_id == user.id))
        existing_projects = res.scalars().all()
        for i in range(3 - len(existing_projects)):
            proj = Project(
                id=str(uuid.uuid4()),
                user_id=user.id,
                name=f"Roadmap Item {i+len(existing_projects)+1}",
                description="Comprehensive test data for UI verification"
            )
            db.add(proj)
        
        # Ensure user has an endpoint
        res = await db.execute(select(Endpoint).where(Endpoint.user_id == user.id).limit(1))
        endpoint = res.scalars().first()
        if not endpoint:
            print("No endpoint found for user.")
            return

        now = datetime.now(timezone.utc)
        
        # Generate 25 recent logs to ensure Live Event Logs and Incident Board are full
        for i in range(25):
            mins_ago = random.randint(0, 120)
            created_at = now - timedelta(minutes=mins_ago)
            
            # 50% success rate to ensure enough Incidents for the board
            is_success = random.random() < 0.5
            delivery_status = "success" if is_success else "failed"
            response_code = 200 if is_success else random.choice([500, 502, 503, 404])
            
            latency_ms = random.randint(50, 800)
            if not is_success:
                latency_ms = random.randint(500, 3000)
                
            log = WebhookLog(
                id=str(uuid.uuid4()),
                endpoint_id=endpoint.id,
                payload_string='{"event": "comprehensive_test", "user": "tester"}',
                headers_json={"content-type": "application/json", "x-test-run": "true"},
                response_code=response_code,
                delivery_status=delivery_status,
                retry_count=random.randint(0, 3) if not is_success else 0,
                error_message=None if is_success else f"Connection timed out. Target returned {response_code}",
                latency_ms=latency_ms,
                created_at=created_at,
                updated_at=created_at
            )
            db.add(log)
            
        await db.commit()
        print(f"Successfully seeded Roadmaps and 25 Webhook Logs for user {user.email}")

if __name__ == "__main__":
    asyncio.run(seed_all())
