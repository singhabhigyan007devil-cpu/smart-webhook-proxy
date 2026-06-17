import pytest
import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
import asyncio
import time

from backend.app.main import app
from backend.app.db import get_db, Base
from backend.app.models import User, Endpoint
from backend.app.cache import slug_cache

# In-memory database for testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_hookshield.db"

engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

@pytest.fixture(scope="function", autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    # Clear cache between tests
    slug_cache.clear()
    
    yield
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

# Override get_db dependency
async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

@pytest.mark.asyncio
async def test_ingest_webhook_success():
    # 1. Setup mock user and endpoint
    async with TestingSessionLocal() as db:
        user = User(id="test-user-id", email="test@test.com", api_key="test-api-key")
        endpoint = Endpoint(
            id="test-endpoint-id",
            user_id="test-user-id",
            slug="test-slug",
            source_name="Stripe",
            secret_token="whsec_123",
            target_url="http://mock-target.com/webhook",
            active_state=True
        )
        db.add(user)
        db.add(endpoint)
        await db.commit()

    # 2. Fire request to ingestion URL
    raw_payload = '{"event": "charge.succeeded", "data": {"id": "ch_123"}}'
    headers = {
        "Stripe-Signature": "t=123,v1=sig_hash",
        "X-Custom-Header": "value"
    }

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # Warm-up request to eliminate cold start latency
        await ac.post("/p/test-slug", content=raw_payload, headers=headers)
        
        start_time = time.time()
        response = await ac.post(
            "/p/test-slug",
            content=raw_payload,
            headers=headers
        )
        duration_ms = (time.time() - start_time) * 1000

        # Assert status is 202 Accepted
        assert response.status_code == 202
        assert response.text == "Accepted"
        
        # Assert latency is well under 250ms (usually <10ms for in-memory, but database file IO on Windows can add lag)
        assert duration_ms < 250.0

@pytest.mark.asyncio
async def test_ingest_webhook_not_found():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/p/non-existent-slug", content="{}")
        assert response.status_code == 404

@pytest.mark.asyncio
async def test_ingest_webhook_paused():
    # Setup inactive endpoint
    async with TestingSessionLocal() as db:
        user = User(id="test-user-id", email="test@test.com", api_key="test-api-key")
        endpoint = Endpoint(
            id="test-endpoint-id",
            user_id="test-user-id",
            slug="paused-slug",
            source_name="GitHub",
            secret_token="whsec_123",
            target_url="http://mock-target.com/webhook",
            active_state=False # Paused!
        )
        db.add(user)
        db.add(endpoint)
        await db.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/p/paused-slug", content="{}")
        # Assert 403 Forbidden due to inactive state
        assert response.status_code == 403
