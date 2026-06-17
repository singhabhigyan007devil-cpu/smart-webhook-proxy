import pytest
import httpx
import respx
from unittest.mock import patch
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from backend.app.main import app
from backend.app.db import get_db, Base
from backend.app.models import User, Endpoint, WebhookLog
from backend.app.config import settings

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_hookshield.db"

engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

# Override get_db dependency
async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="function", autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@respx.mock
@pytest.mark.asyncio
async def test_circuit_breaker_tripping():
    # Setup mock endpoint
    async with TestingSessionLocal() as db:
        user = User(id="user-cb", email="cb@test.com", api_key="cb-key")
        endpoint = Endpoint(
            id="endpoint-cb",
            user_id="user-cb",
            slug="cb-slug",
            source_name="Shopify",
            target_url="http://example.com/target",
            active_state=True,
            failure_count=0
        )
        db.add(user)
        db.add(endpoint)
        await db.commit()

    # Patch settings.CIRCUIT_BREAKER_LIMIT to 3 for fast testing
    with patch.object(settings, "CIRCUIT_BREAKER_LIMIT", 3):
        respx.post("http://example.com/target").mock(side_effect=httpx.ConnectError("Connection failed"))
        
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. First failure
            response = await ac.post(
                "/worker/process",
                json={
                    "endpoint_id": "endpoint-cb",
                    "payload_string": "{}",
                    "headers": {},
                    "retry_count": 0
                }
            )
            assert response.status_code == 200

            # Check db count = 1
            async with TestingSessionLocal() as db:
                ep = (await db.execute(select(Endpoint).where(Endpoint.id == "endpoint-cb"))).scalars().first()
                assert ep.failure_count == 1
                assert ep.active_state is True

            # 2. Second failure
            await ac.post(
                "/worker/process",
                json={
                    "endpoint_id": "endpoint-cb",
                    "payload_string": "{}",
                    "headers": {},
                    "retry_count": 1
                }
            )

            # 3. Third failure (should trip the breaker)
            await ac.post(
                "/worker/process",
                json={
                    "endpoint_id": "endpoint-cb",
                    "payload_string": "{}",
                    "headers": {},
                    "retry_count": 2
                }
            )

            # Check that circuit breaker tripped: active_state -> False
            async with TestingSessionLocal() as db:
                ep = (await db.execute(select(Endpoint).where(Endpoint.id == "endpoint-cb"))).scalars().first()
                assert ep.failure_count == 3
                assert ep.active_state is False

            # 4. Subsequent ingestion calls should now fail with 403 Forbidden because endpoint is paused
            ingest_res = await ac.post("/p/cb-slug", content="{}")
            assert ingest_res.status_code == 403
