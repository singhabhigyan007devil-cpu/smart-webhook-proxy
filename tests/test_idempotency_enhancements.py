import pytest
import httpx
import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from backend.app.main import app
from backend.app.db import get_db, Base
from backend.app.models import (
    User, Endpoint, IdempotencyKey, SeverityPriority, 
    AlertChannel, Issue, WorkflowStatus, CustomField,
    Project, ProjectMilestone, WebhookLog
)
from backend.app.idempotency import check_and_register_event

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_hookshield.db"

engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

_original_override = app.dependency_overrides.get(get_db)

async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session

@pytest.fixture(scope="function", autouse=True)
async def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    if _original_override:
        app.dependency_overrides[get_db] = _original_override
    else:
        app.dependency_overrides.pop(get_db, None)

@pytest.mark.asyncio
async def test_endpoints_idempotency_fields_flow():
    # Setup test user
    async with TestingSessionLocal() as db:
        user = User(id="user-id-idemp", email="idemp@test.com", api_key="key-idemp")
        db.add(user)
        await db.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Create endpoint with custom idempotency fields
        create_res = await ac.post(
            "/api/endpoints",
            headers={"Authorization": "Bearer key-idemp"},
            json={
                "source_name": "Stripe Integrator",
                "target_url": "https://httpbin.org/post",
                "idempotency_strategy": "payload_hash",
                "idempotency_ttl": 600
            }
        )
        assert create_res.status_code == 201
        data = create_res.json()
        assert data["idempotency_strategy"] == "payload_hash"
        assert data["idempotency_ttl"] == 600
        ep_id = data["id"]

        # 2. Patch endpoint's idempotency strategy and TTL
        patch_res = await ac.patch(
            f"/api/endpoints/{ep_id}",
            headers={"Authorization": "Bearer key-idemp"},
            json={
                "idempotency_strategy": "auto",
                "idempotency_ttl": 1200
            }
        )
        assert patch_res.status_code == 200
        patched_data = patch_res.json()
        assert patched_data["idempotency_strategy"] == "auto"
        assert patched_data["idempotency_ttl"] == 1200

@pytest.mark.asyncio
async def test_idempotency_strategies():
    async with TestingSessionLocal() as db:
        user = User(id="user-1", email="idemp@test.com", api_key="key-idemp")
        ep_auto = Endpoint(
            id="ep-auto",
            user_id="user-1",
            slug="slug-auto",
            source_name="Auto Ep",
            target_url="http://target",
            idempotency_strategy="auto",
            idempotency_ttl=3600
        )
        ep_hash = Endpoint(
            id="ep-hash",
            user_id="user-1",
            slug="slug-hash",
            source_name="Hash Ep",
            target_url="http://target",
            idempotency_strategy="payload_hash",
            idempotency_ttl=3600
        )
        db.add_all([user, ep_auto, ep_hash])
        await db.commit()

    async with TestingSessionLocal() as db:
        # Strategy "auto" should look for event headers
        headers_with_id = {"X-Github-Delivery": "github-evt-123"}
        payload = b'{"msg": "hello"}'
        
        # First registration should succeed
        res1 = await check_and_register_event(db, "ep-auto", headers_with_id, payload)
        assert res1 is True

        # Second registration with same event header should fail (duplicate)
        res2 = await check_and_register_event(db, "ep-auto", headers_with_id, payload)
        assert res2 is False

        # If payload differs but event header is the same, "auto" strategy still drops it
        res3 = await check_and_register_event(db, "ep-auto", headers_with_id, b'{"msg": "different"}')
        assert res3 is False

        # Strategy "payload_hash" ignores headers and hashes payload
        # First registration should succeed
        res4 = await check_and_register_event(db, "ep-hash", headers_with_id, payload)
        assert res4 is True

        # Second registration with same payload should fail (duplicate)
        res5 = await check_and_register_event(db, "ep-hash", headers_with_id, payload)
        assert res5 is False

        # Registration with DIFFERENT payload should succeed
        res6 = await check_and_register_event(db, "ep-hash", headers_with_id, b'{"msg": "different"}')
        assert res6 is True

@pytest.mark.asyncio
async def test_idempotency_ttl_expiry():
    async with TestingSessionLocal() as db:
        user = User(id="user-1", email="idemp@test.com", api_key="key-idemp")
        ep = Endpoint(
            id="ep-ttl",
            user_id="user-1",
            slug="slug-ttl",
            source_name="TTL Ep",
            target_url="http://target",
            idempotency_strategy="payload_hash",
            idempotency_ttl=1  # 1 second TTL
        )
        db.add_all([user, ep])
        await db.commit()

    async with TestingSessionLocal() as db:
        payload = b'{"evt": "test"}'
        
        # 1. First registration succeeds
        res1 = await check_and_register_event(db, "ep-ttl", {}, payload)
        assert res1 is True

        # 2. Duplicate registration fails immediately
        res2 = await check_and_register_event(db, "ep-ttl", {}, payload)
        assert res2 is False

        # 3. Wait for TTL to expire (1.5 seconds)
        await asyncio.sleep(1.5)

        # 4. Check registration again, should delete the expired key and succeed
        res3 = await check_and_register_event(db, "ep-ttl", {}, payload)
        assert res3 is True
