import pytest
import httpx
import respx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from backend.app.main import app
from backend.app.db import get_db, Base
from backend.app.models import User, Endpoint, Incident, IncidentComment, WebhookLog
from backend.app.cache import slug_cache

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
    slug_cache.clear()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_empty_incidents():
    # Setup Endpoint
    async with TestingSessionLocal() as db:
        user = User(id="user-1", email="test@test.com", api_key="key-1")
        db.add(user)
        await db.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get(
            "/api/incidents",
            headers={"Authorization": "Bearer key-1"}
        )
        assert response.status_code == 200
        assert response.json() == []

@respx.mock
@pytest.mark.asyncio
async def test_incident_auto_creation_and_crud():
    # Setup Endpoint with max_retries = 0 to trigger immediate drop and incident creation
    async with TestingSessionLocal() as db:
        user = User(id="user-1", email="test@test.com", api_key="key-1")
        endpoint = Endpoint(
            id="endpoint-1",
            user_id="user-1",
            slug="slug-1",
            source_name="GitHub",
            target_url="http://example.com/target",
            max_retries=0,
            active_state=True
        )
        db.add(user)
        db.add(endpoint)
        await db.commit()

    # Mock delivery destination to fail
    respx.post("http://example.com/target").mock(return_value=httpx.Response(500))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Fire worker process to trigger drop
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

        # 2. Check that Incident was created in the DB automatically
        async with TestingSessionLocal() as db:
            incidents = (await db.execute(select(Incident))).scalars().all()
            assert len(incidents) == 1
            assert incidents[0].endpoint_id == "endpoint-1"
            assert incidents[0].status == "todo"
            assert incidents[0].priority == "high"
            assert "Delivery failed for slug /p/slug-1" in incidents[0].title
            incident_id = incidents[0].id

        # 3. List incidents via API
        list_res = await ac.get(
            "/api/incidents",
            headers={"Authorization": "Bearer key-1"}
        )
        assert list_res.status_code == 200
        data = list_res.json()
        assert len(data) == 1
        assert data[0]["id"] == incident_id
        assert data[0]["status"] == "todo"

        # 4. Patch/Update Incident (Assign, Update Status/Priority)
        patch_res = await ac.patch(
            f"/api/incidents/{incident_id}",
            headers={"Authorization": "Bearer key-1"},
            json={
                "status": "in_progress",
                "priority": "urgent",
                "assignee": "Developer Alice"
            }
        )
        assert patch_res.status_code == 200
        updated_data = patch_res.json()
        assert updated_data["status"] == "in_progress"
        assert updated_data["priority"] == "urgent"
        assert updated_data["assignee"] == "Developer Alice"

        # 5. Comment Creation & Listing
        comment_create_res = await ac.post(
            f"/api/incidents/{incident_id}/comments",
            headers={"Authorization": "Bearer key-1"},
            json={
                "commenter": "Alice",
                "body": "Working on reproducing this failure."
            }
        )
        assert comment_create_res.status_code == 201
        comment_data = comment_create_res.json()
        assert comment_data["commenter"] == "Alice"
        assert comment_data["body"] == "Working on reproducing this failure."
        assert comment_data["incident_id"] == incident_id

        comments_list_res = await ac.get(
            f"/api/incidents/{incident_id}/comments",
            headers={"Authorization": "Bearer key-1"}
        )
        assert comments_list_res.status_code == 200
        comments_list = comments_list_res.json()
        assert len(comments_list) == 1
        assert comments_list[0]["body"] == "Working on reproducing this failure."
