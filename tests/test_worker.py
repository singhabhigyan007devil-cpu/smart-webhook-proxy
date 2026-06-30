import pytest
import httpx
import respx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from backend.app.main import app
from backend.app.db import get_db, Base
from backend.app.models import User, Endpoint, WebhookLog, IdempotencyKey
from backend.app.cache import slug_cache

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
    slug_cache.clear()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    if _original_override:
        app.dependency_overrides[get_db] = _original_override
    else:
        app.dependency_overrides.pop(get_db, None)

@respx.mock
@pytest.mark.asyncio
async def test_worker_success_delivery():
    # Setup Endpoint
    async with TestingSessionLocal() as db:
        user = User(id="user-1", email="test@test.com", api_key="key-1")
        endpoint = Endpoint(
            id="endpoint-1",
            user_id="user-1",
            slug="slug-1",
            source_name="GitHub",
            target_url="http://example.com/target",
            active_state=True
        )
        db.add(user)
        db.add(endpoint)
        await db.commit()

    # Mock the outbound delivery client request to return 200 OK
    respx.post("http://example.com/target").mock(return_value=httpx.Response(200))
    
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/worker/process",
            json={
                "endpoint_id": "endpoint-1",
                "payload_string": '{"event": "ping"}',
                "headers": {"X-GitHub-Delivery": "event-unique-123"},
                "retry_count": 0
            }
        )
        assert response.status_code == 200

        # Verify database logs show success
        async with TestingSessionLocal() as db:
            logs = (await db.execute(select(WebhookLog))).scalars().all()
            assert len(logs) == 1
            assert logs[0].delivery_status == "success"
            assert logs[0].response_code == 200

@respx.mock
@pytest.mark.asyncio
async def test_worker_idempotency_deduplication():
    # Setup Endpoint
    async with TestingSessionLocal() as db:
        user = User(id="user-1", email="test@test.com", api_key="key-1")
        endpoint = Endpoint(
            id="endpoint-1",
            user_id="user-1",
            slug="slug-1",
            source_name="GitHub",
            target_url="http://example.com/target",
            active_state=True
        )
        db.add(user)
        db.add(endpoint)
        await db.commit()

    respx.post("http://example.com/target").mock(return_value=httpx.Response(200))
 
    # Deliver same event twice
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # First delivery
        res1 = await ac.post(
            "/worker/process",
            json={
                "endpoint_id": "endpoint-1",
                "payload_string": '{"ping": 1}',
                "headers": {"X-GitHub-Delivery": "same-id-123"},
                "retry_count": 0
            }
        )
        assert res1.status_code == 200
 
        # Second duplicate delivery
        res2 = await ac.post(
            "/worker/process",
            json={
                "endpoint_id": "endpoint-1",
                "payload_string": '{"ping": 1}',
                "headers": {"X-GitHub-Delivery": "same-id-123"},
                "retry_count": 0
            }
        )
        assert res2.status_code == 200
 
    # Verify logs: 1 success, 1 dropped due to duplicate
    async with TestingSessionLocal() as db:
        logs = (await db.execute(select(WebhookLog).order_by(WebhookLog.created_at))).scalars().all()
        assert len(logs) == 2
        assert logs[0].delivery_status == "success"
        assert logs[1].delivery_status == "dropped"
        assert "Duplicate event" in logs[1].error_message
