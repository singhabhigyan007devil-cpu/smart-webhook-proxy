import pytest
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select

from backend.app.main import app
from backend.app.db import get_db, Base
from backend.app.models import User, Endpoint, Issue, Project
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
async def test_projects_crud_and_assignment():
    # Setup Users and Endpoint
    async with TestingSessionLocal() as db:
        user1 = User(id="user-1", email="test1@test.com", api_key="key-1")
        user2 = User(id="user-2", email="test2@test.com", api_key="key-2")
        endpoint1 = Endpoint(
            id="endpoint-1",
            user_id="user-1",
            slug="slug-1",
            source_name="GitHub",
            target_url="http://example.com/target",
            max_retries=3,
            active_state=True
        )
        incident1 = Issue(
            id="incident-1",
            user_id="user-1",
            endpoint_id="endpoint-1",
            title="Failed webhook incident 1",
            status="todo",
            priority="medium"
        )
        db.add_all([user1, user2, endpoint1, incident1])
        await db.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. List projects initially (should be empty)
        list_res = await ac.get("/api/projects", headers={"Authorization": "Bearer key-1"})
        assert list_res.status_code == 200
        assert list_res.json() == []

        # 2. Create Project for user-1
        create_res = await ac.post(
            "/api/projects",
            headers={"Authorization": "Bearer key-1"},
            json={
                "name": "Auth Refactor Initiative",
                "description": "Consolidating authentication mechanisms",
                "status": "started"
            }
        )
        assert create_res.status_code == 201
        project_data = create_res.json()
        project_id = project_data["id"]
        assert project_data["name"] == "Auth Refactor Initiative"
        assert project_data["user_id"] == "user-1"
        assert project_data["status"] == "started"

        # 3. Create Project for user-2
        create_res2 = await ac.post(
            "/api/projects",
            headers={"Authorization": "Bearer key-2"},
            json={
                "name": "User-2 Project",
                "description": "Private project",
                "status": "backlog"
            }
        )
        assert create_res2.status_code == 201
        project2_id = create_res2.json()["id"]

        # 4. List projects for user-1 again (should return only user-1 project)
        list_res = await ac.get("/api/projects", headers={"Authorization": "Bearer key-1"})
        assert list_res.status_code == 200
        projects = list_res.json()
        assert len(projects) == 1
        assert projects[0]["id"] == project_id

        # 5. Patch project for user-1
        patch_res = await ac.patch(
            f"/api/projects/{project_id}",
            headers={"Authorization": "Bearer key-1"},
            json={
                "name": "Auth Refactor Initiative v2",
                "status": "paused"
            }
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["name"] == "Auth Refactor Initiative v2"
        assert patch_res.json()["status"] == "paused"

        # 6. Attempt to patch user-2's project as user-1 (should return 404)
        patch_res_fail = await ac.patch(
            f"/api/projects/{project2_id}",
            headers={"Authorization": "Bearer key-1"},
            json={"name": "Hacked Name"}
        )
        assert patch_res_fail.status_code == 404

        # 7. Map incident to project_id (User-1 endpoint/incident to User-1 project)
        incident_patch_res = await ac.patch(
            f"/api/issues/incident-1",
            headers={"Authorization": "Bearer key-1"},
            json={"project_id": project_id}
        )
        assert incident_patch_res.status_code == 200
        assert incident_patch_res.json()["project_id"] == project_id

        # 8. Attempt to map incident to User-2's project as User-1 (should fail)
        incident_patch_res_fail = await ac.patch(
            f"/api/issues/incident-1",
            headers={"Authorization": "Bearer key-1"},
            json={"project_id": project2_id}
        )
        assert incident_patch_res_fail.status_code == 400
        assert "Project not found or access denied" in incident_patch_res_fail.json()["detail"]

        # 9. Delete Project and verify linked incident's project_id becomes null
        del_res = await ac.delete(
            f"/api/projects/{project_id}",
            headers={"Authorization": "Bearer key-1"}
        )
        assert del_res.status_code == 204

        # Verify incident's project_id is SET NULL (None)
        async with TestingSessionLocal() as db:
            result = await db.execute(select(Issue).where(Issue.id == "incident-1"))
            inc = result.scalars().first()
            assert inc is not None
            assert inc.project_id is None
