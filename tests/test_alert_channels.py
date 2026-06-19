import pytest
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from backend.app.main import app
from backend.app.db import get_db, Base
from backend.app.models import User, AlertChannel

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_hookshield.db"

engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

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

@pytest.mark.asyncio
async def test_alert_channels_crud_and_auth():
    # Setup test users
    async with TestingSessionLocal() as db:
        user1 = User(id="user-1", email="test1@test.com", api_key="key-1")
        user2 = User(id="user-2", email="test2@test.com", api_key="key-2")
        db.add_all([user1, user2])
        await db.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. List channels initially (should be empty)
        list_res = await ac.get(
            "/api/alert-channels",
            headers={"Authorization": "Bearer key-1"}
        )
        assert list_res.status_code == 200
        assert list_res.json() == []

        # 2. Create Alert Channel for user1
        create_res = await ac.post(
            "/api/alert-channels",
            headers={"Authorization": "Bearer key-1"},
            json={
                "name": "Dev Slack Channel",
                "channel_type": "slack",
                "config": {"webhook_url": "https://hooks.slack.com/services/test/webhook"}
            }
        )
        assert create_res.status_code == 201
        data = create_res.json()
        channel_id = data["id"]
        assert data["name"] == "Dev Slack Channel"
        assert data["channel_type"] == "slack"
        assert data["is_active"] is True
        assert data["config"]["webhook_url"] == "https://hooks.slack.com/services/test/webhook"

        # 3. List channels (should have 1 item)
        list_res = await ac.get(
            "/api/alert-channels",
            headers={"Authorization": "Bearer key-1"}
        )
        assert list_res.status_code == 200
        channels = list_res.json()
        assert len(channels) == 1
        assert channels[0]["id"] == channel_id

        # 4. User 2 should NOT see User 1's channel
        list_user2_res = await ac.get(
            "/api/alert-channels",
            headers={"Authorization": "Bearer key-2"}
        )
        assert list_user2_res.status_code == 200
        assert list_user2_res.json() == []

        # 5. User 2 should NOT be able to modify User 1's channel
        patch_unauth = await ac.patch(
            f"/api/alert-channels/{channel_id}",
            headers={"Authorization": "Bearer key-2"},
            json={"name": "Hacked Channel Name"}
        )
        assert patch_unauth.status_code == 404

        # 6. Update channel to inactive
        patch_res = await ac.patch(
            f"/api/alert-channels/{channel_id}",
            headers={"Authorization": "Bearer key-1"},
            json={"is_active": False}
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["is_active"] is False

        # 7. Test Email channel dispatch
        create_email_res = await ac.post(
            "/api/alert-channels",
            headers={"Authorization": "Bearer key-1"},
            json={
                "name": "Dev Email List",
                "channel_type": "email",
                "config": {"recipient_email": "ops@hookshield.io"}
            }
        )
        assert create_email_res.status_code == 201
        email_channel_id = create_email_res.json()["id"]

        test_res = await ac.post(
            f"/api/alert-channels/{email_channel_id}/test",
            headers={"Authorization": "Bearer key-1"}
        )
        assert test_res.status_code == 200
        assert test_res.json()["status"] == "success"

        # 8. Delete channel
        delete_res = await ac.delete(
            f"/api/alert-channels/{channel_id}",
            headers={"Authorization": "Bearer key-1"}
        )
        assert delete_res.status_code == 204

        # 9. Verify deletion
        list_res = await ac.get(
            "/api/alert-channels",
            headers={"Authorization": "Bearer key-1"}
        )
        assert list_res.status_code == 200
        assert len(list_res.json()) == 1  # only email channel remains
