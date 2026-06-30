import pytest
import httpx
import respx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from backend.app.main import app
from backend.app.db import get_db, Base
from backend.app.models import User, Endpoint, WebhookLog
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
async def test_custom_auth_headers():
    # Setup Endpoint with custom authentication headers
    async with TestingSessionLocal() as db:
        user = User(id="user-1", email="test@test.com", api_key="key-1")
        endpoint = Endpoint(
            id="endpoint-1",
            user_id="user-1",
            slug="slug-1",
            source_name="GitHub",
            target_url="http://example.com/target",
            auth_headers={"Authorization": "Bearer mock-token-abc", "X-Custom-Auth": "SecretVal"},
            active_state=True
        )
        db.add(user)
        db.add(endpoint)
        await db.commit()

    # Setup mock with expected headers matching custom auth headers
    route = respx.post("http://example.com/target").mock(return_value=httpx.Response(200))
    
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/worker/process",
            json={
                "endpoint_id": "endpoint-1",
                "payload_string": '{"event": "ping"}',
                "headers": {"X-Original-Header": "value"},
                "retry_count": 0
            }
        )
        assert response.status_code == 200
        
        # Verify that custom headers were injected into outbound request
        assert route.called
        last_request = route.calls.last.request
        assert last_request.headers.get("Authorization") == "Bearer mock-token-abc"
        assert last_request.headers.get("X-Custom-Auth") == "SecretVal"
        assert last_request.headers.get("X-Original-Header") == "value"

@respx.mock
@pytest.mark.asyncio
async def test_custom_retry_policy():
    # Setup Endpoint with custom retries and backoff
    async with TestingSessionLocal() as db:
        user = User(id="user-1", email="test@test.com", api_key="key-1")
        endpoint = Endpoint(
            id="endpoint-1",
            user_id="user-1",
            slug="slug-1",
            source_name="GitHub",
            target_url="http://example.com/target",
            max_retries=3,
            backoff_base=5,
            active_state=True
        )
        db.add(user)
        db.add(endpoint)
        await db.commit()

    # Mock target to fail
    respx.post("http://example.com/target").mock(return_value=httpx.Response(500))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # First failure (retry_count=0) -> should failed and retry enqueued
        response = await ac.post(
            "/worker/process",
            json={
                "endpoint_id": "endpoint-1",
                "payload_string": '{"event": "ping"}',
                "headers": {},
                "retry_count": 0
            }
        )
        assert response.status_code == 200

        # Verify logs show failed retry scheduling with custom backoff (5 * 2^0 = 5s)
        async with TestingSessionLocal() as db:
            logs = (await db.execute(select(WebhookLog).order_by(WebhookLog.created_at.desc()))).scalars().all()
            assert len(logs) == 1
            assert logs[0].delivery_status == "failed"
            assert "Scheduling retry 1 in 5s" in logs[0].error_message

        # Failure at retry_count=3 -> should be dropped (max retries reached)
        response_drop = await ac.post(
            "/worker/process",
            json={
                "endpoint_id": "endpoint-1",
                "payload_string": '{"event": "ping"}',
                "headers": {},
                "retry_count": 3
            }
        )
        assert response_drop.status_code == 200

        async with TestingSessionLocal() as db:
            logs = (await db.execute(select(WebhookLog).order_by(WebhookLog.created_at.asc()))).scalars().all()
            assert len(logs) == 2
            assert logs[0].delivery_status == "failed"
            assert logs[1].delivery_status == "dropped"
            assert "Max retries (3) exceeded" in logs[1].error_message

@respx.mock
@pytest.mark.asyncio
async def test_alert_webhook_on_failure():
    # Setup Endpoint with alert webhook and max_retries = 0
    async with TestingSessionLocal() as db:
        user = User(id="user-1", email="test@test.com", api_key="key-1")
        endpoint = Endpoint(
            id="endpoint-1",
            user_id="user-1",
            slug="slug-1",
            source_name="GitHub",
            target_url="http://example.com/target",
            alert_webhook_url="http://alert.slack.com/webhook",
            max_retries=0,
            active_state=True
        )
        db.add(user)
        db.add(endpoint)
        await db.commit()

    # Mock target to fail
    respx.post("http://example.com/target").mock(return_value=httpx.Response(500))
    # Mock Slack Alert receiver URL
    alert_route = respx.post("http://alert.slack.com/webhook").mock(return_value=httpx.Response(200))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/worker/process",
            json={
                "endpoint_id": "endpoint-1",
                "payload_string": '{"event": "ping"}',
                "headers": {},
                "retry_count": 0
            }
        )
        assert response.status_code == 200

        # Verify that delivery failed, dropped, and dispatch alert webhook was called
        assert alert_route.called
        last_request = alert_route.calls.last.request
        alert_body = last_request.content.decode()
        assert "Max retries (0) exceeded" in alert_body
        assert "GitHub" in alert_body
        assert "/p/slug-1" in alert_body
