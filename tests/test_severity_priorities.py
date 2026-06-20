import pytest
import httpx
import respx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from backend.app.main import app
from backend.app.db import get_db, Base
from backend.app.models import User, SeverityPriority, AlertChannel, Endpoint, Incident

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
async def test_severity_priorities_flow():
    # Setup test users
    async with TestingSessionLocal() as db:
        user1 = User(id="user-1", email="test1@test.com", api_key="key-1")
        user2 = User(id="user-2", email="test2@test.com", api_key="key-2")
        db.add_all([user1, user2])
        await db.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Fetch severity priorities (should automatically seed defaults)
        list_res = await ac.get(
            "/api/severity-priorities",
            headers={"Authorization": "Bearer key-1"}
        )
        assert list_res.status_code == 200
        priorities = list_res.json()
        assert len(priorities) == 3  # Low, Medium, High
        
        # Verify default seeding structure
        names = [p["name"] for p in priorities]
        assert "Low" in names
        assert "Medium" in names
        assert "High" in names
        
        # 2. Create custom priority
        create_res = await ac.post(
            "/api/severity-priorities",
            headers={"Authorization": "Bearer key-1"},
            json={
                "name": "P1 - Critical",
                "color": "hsl(0, 100%, 50%)",
                "rank": 1,
                "threshold_failures": 10
            }
        )
        assert create_res.status_code == 201
        new_pri = create_res.json()
        pri_id = new_pri["id"]
        assert new_pri["name"] == "P1 - Critical"
        assert new_pri["threshold_failures"] == 10

        # 3. Update priority threshold and rank
        patch_res = await ac.patch(
            f"/api/severity-priorities/{pri_id}",
            headers={"Authorization": "Bearer key-1"},
            json={
                "threshold_failures": 8,
                "rank": 0
            }
        )
        assert patch_res.status_code == 200
        updated_pri = patch_res.json()
        assert updated_pri["threshold_failures"] == 8
        assert updated_pri["rank"] == 0

        # 4. User 2 should NOT be able to update User 1's custom priority
        patch_unauth = await ac.patch(
            f"/api/severity-priorities/{pri_id}",
            headers={"Authorization": "Bearer key-2"},
            json={"name": "Hacked Severity"}
        )
        assert patch_unauth.status_code == 404

        # 5. Delete custom priority
        delete_res = await ac.delete(
            f"/api/severity-priorities/{pri_id}",
            headers={"Authorization": "Bearer key-1"}
        )
        assert delete_res.status_code == 204

        # 6. Verify custom priority is deleted
        list_res = await ac.get(
            "/api/severity-priorities",
            headers={"Authorization": "Bearer key-1"}
        )
        assert list_res.status_code == 200
        current_priorities = list_res.json()
        assert len(current_priorities) == 3  # only the 3 seeded defaults remain
        assert pri_id not in [p["id"] for p in current_priorities]


@respx.mock
@pytest.mark.asyncio
async def test_worker_severity_escalation_and_routing():
    # Setup test user, endpoint, alert channels and custom priorities
    async with TestingSessionLocal() as db:
        user = User(id="user-w1", email="worker_test@test.com", api_key="key-w1")
        db.add(user)
        await db.commit()
        
        # 1. Create two alert channels
        channel_slack = AlertChannel(
            id="chan-slack",
            user_id="user-w1",
            name="Slack Dev",
            channel_type="slack",
            config={"webhook_url": "http://slack-webhook.com"},
            is_active=True
        )
        channel_discord = AlertChannel(
            id="chan-discord",
            user_id="user-w1",
            name="Discord Alerts",
            channel_type="discord",
            config={"webhook_url": "http://discord-webhook.com"},
            is_active=True
        )
        db.add_all([channel_slack, channel_discord])
        await db.commit()

        # 2. Create custom priorities
        # Priority Rank 2 (P1 - High, threshold = 2 failures, routed to Slack)
        pri_high = SeverityPriority(
            id="pri-high",
            user_id="user-w1",
            name="P1 - High",
            color="hsl(0, 100%, 50%)",
            rank=2,
            threshold_failures=2,
            alert_channel_id="chan-slack"
        )
        # Priority Rank 1 (P0 - Critical, threshold = 3 failures, routed to Discord)
        pri_critical = SeverityPriority(
            id="pri-critical",
            user_id="user-w1",
            name="P0 - Critical",
            color="hsl(0, 100%, 50%)",
            rank=1,
            threshold_failures=3,
            alert_channel_id="chan-discord"
        )
        # Priority Rank 3 (P2 - Low, threshold = 1 failure, routed to all channels, i.e., none specific)
        pri_low = SeverityPriority(
            id="pri-low",
            user_id="user-w1",
            name="P2 - Low",
            color="hsl(0, 100%, 50%)",
            rank=3,
            threshold_failures=1,
            alert_channel_id=None
        )
        db.add_all([pri_high, pri_critical, pri_low])
        await db.commit()

        # 3. Create endpoint with max_retries = 0 so delivery failures drop immediately and create incidents
        endpoint = Endpoint(
            id="endpoint-w1",
            user_id="user-w1",
            slug="slug-w1",
            source_name="Stripe",
            target_url="http://mock-target.com",
            active_state=True,
            max_retries=0
        )
        db.add(endpoint)
        await db.commit()

    # Mock endpoint delivery failure (return 500)
    respx.post("http://mock-target.com").mock(return_value=httpx.Response(500))

    # Mock slack and discord webhooks
    slack_route = respx.post("http://slack-webhook.com").mock(return_value=httpx.Response(200))
    discord_route = respx.post("http://discord-webhook.com").mock(return_value=httpx.Response(200))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        
        # --- FAILURE ATTEMPT 1 ---
        # Failure count becomes 1 -> matched priority should be 'P2 - Low' (threshold 1).
        # Since 'P2 - Low' alert_channel_id is None, it routes to all channels.
        # So BOTH slack and discord webhooks should be called.
        res1 = await ac.post(
            "/worker/process",
            json={
                "endpoint_id": "endpoint-w1",
                "payload_string": '{"event": "ping"}',
                "headers": {"Stripe-Signature": "t=123,v1=sig1"},
                "retry_count": 0
            }
        )
        assert res1.status_code == 200
        
        # Verify incident was created with priority "P2 - Low"
        async with TestingSessionLocal() as db:
            incidents = (await db.execute(select(Incident).where(Incident.endpoint_id == "endpoint-w1"))).scalars().all()
            assert len(incidents) == 1
            assert incidents[0].priority == "P2 - Low"

        # Verify both channels were called
        assert slack_route.called
        assert discord_route.called
        
        # Reset routes for next call
        slack_route.reset()
        discord_route.reset()

        # --- FAILURE ATTEMPT 2 ---
        # Failure count becomes 2 -> matched priority should escalate to 'P1 - High' (threshold 2).
        # Since 'P1 - High' is routed to Slack, ONLY slack webhook should be called.
        res2 = await ac.post(
            "/worker/process",
            json={
                "endpoint_id": "endpoint-w1",
                "payload_string": '{"event": "ping"}',
                "headers": {"Stripe-Signature": "t=123,v1=sig2"},
                "retry_count": 0
            }
        )
        assert res2.status_code == 200

        # Verify incident escalated to "P1 - High"
        async with TestingSessionLocal() as db:
            incidents = (await db.execute(select(Incident).where(Incident.endpoint_id == "endpoint-w1"))).scalars().all()
            assert len(incidents) == 1
            assert incidents[0].priority == "P1 - High"

        # Verify Slack called but Discord NOT called
        assert slack_route.called
        assert not discord_route.called

        # Reset routes
        slack_route.reset()
        discord_route.reset()

        # --- FAILURE ATTEMPT 3 ---
        # Failure count becomes 3 -> matched priority should escalate to 'P0 - Critical' (threshold 3).
        # Since 'P0 - Critical' is routed to Discord, ONLY discord webhook should be called.
        res3 = await ac.post(
            "/worker/process",
            json={
                "endpoint_id": "endpoint-w1",
                "payload_string": '{"event": "ping"}',
                "headers": {"Stripe-Signature": "t=123,v1=sig3"},
                "retry_count": 0
            }
        )
        assert res3.status_code == 200

        # Verify incident escalated to "P0 - Critical"
        async with TestingSessionLocal() as db:
            incidents = (await db.execute(select(Incident).where(Incident.endpoint_id == "endpoint-w1"))).scalars().all()
            assert len(incidents) == 1
            assert incidents[0].priority == "P0 - Critical"

        # Verify Discord called but Slack NOT called
        assert not slack_route.called
        assert discord_route.called
