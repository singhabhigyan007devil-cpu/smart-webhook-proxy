import pytest
import httpx
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from backend.app.main import app
from backend.app.db import get_db, Base
from backend.app.models import User, Project, ProjectMilestone
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

@pytest.mark.asyncio
async def test_milestones_crud_and_auth():
    # Setup Users and Projects
    async with TestingSessionLocal() as db:
        user1 = User(id="user-1", email="test1@test.com", api_key="key-1")
        user2 = User(id="user-2", email="test2@test.com", api_key="key-2")
        project1 = Project(
            id="proj-1",
            user_id="user-1",
            name="Auth Refactor Project",
            status="started"
        )
        project2 = Project(
            id="proj-2",
            user_id="user-2",
            name="User-2 Project",
            status="backlog"
        )
        db.add_all([user1, user2, project1, project2])
        await db.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. List milestones initially (should be empty)
        list_res = await ac.get(
            "/api/projects/proj-1/milestones",
            headers={"Authorization": "Bearer key-1"}
        )
        assert list_res.status_code == 200
        assert list_res.json() == []

        # 2. Create Project Milestone
        target_dt = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
        create_res = await ac.post(
            "/api/projects/proj-1/milestones",
            headers={"Authorization": "Bearer key-1"},
            json={
                "name": "Milestone Alpha",
                "description": "First deliverable",
                "target_date": target_dt
            }
        )
        assert create_res.status_code == 201
        m_data = create_res.json()
        m_id = m_data["id"]
        assert m_data["name"] == "Milestone Alpha"
        assert m_data["project_id"] == "proj-1"
        assert m_data["status"] == "open"

        # 3. List milestones again (should return Milestone Alpha)
        list_res = await ac.get(
            "/api/projects/proj-1/milestones",
            headers={"Authorization": "Bearer key-1"}
        )
        assert list_res.status_code == 200
        milestones = list_res.json()
        assert len(milestones) == 1
        assert milestones[0]["id"] == m_id

        # 4. Update Milestone status
        patch_res = await ac.patch(
            f"/api/milestones/{m_id}",
            headers={"Authorization": "Bearer key-1"},
            json={"status": "completed"}
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == "completed"

        # 5. Access control: User-2 cannot add milestone to User-1's project
        create_res_fail = await ac.post(
            "/api/projects/proj-1/milestones",
            headers={"Authorization": "Bearer key-2"},
            json={
                "name": "Hacker Milestone",
                "target_date": target_dt
            }
        )
        assert create_res_fail.status_code == 404

        # 6. Access control: User-2 cannot patch User-1's milestone
        patch_res_fail = await ac.patch(
            f"/api/milestones/{m_id}",
            headers={"Authorization": "Bearer key-2"},
            json={"name": "Hacked name"}
        )
        assert patch_res_fail.status_code == 404

        # 7. Delete milestone
        del_res = await ac.delete(
            f"/api/milestones/{m_id}",
            headers={"Authorization": "Bearer key-1"}
        )
        assert del_res.status_code == 204

        # Verify it is gone
        list_res = await ac.get(
            "/api/projects/proj-1/milestones",
            headers={"Authorization": "Bearer key-1"}
        )
        assert len(list_res.json()) == 0
