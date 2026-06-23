import pytest
from httpx import AsyncClient
from backend.app.models import AutomationRule
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

@pytest.mark.asyncio
async def test_automation_crud(client: AsyncClient, api_key: str):
    headers = {"Authorization": f"Bearer {api_key}"}

    # 1. Create a Rule
    rule_payload = {
        "name": "Test Rule",
        "trigger_type": "webhook.failed",
        "condition_field": "status_code",
        "condition_value": "500",
        "action_type": "create_issue",
        "action_target": "project-id-123"
    }
    res_create = await client.post("/api/automations", json=rule_payload, headers=headers)
    assert res_create.status_code == 201
    rule_data = res_create.json()
    rule_id = rule_data["id"]
    assert rule_data["name"] == "Test Rule"
    assert rule_data["is_active"] is True

    # 2. List Rules
    res_list = await client.get("/api/automations", headers=headers)
    assert res_list.status_code == 200
    rules = res_list.json()
    assert len(rules) >= 1
    assert any(r["id"] == rule_id for r in rules)

    # 3. Update Rule
    update_payload = {
        "name": "Updated Test Rule",
        "is_active": False
    }
    res_update = await client.patch(f"/api/automations/{rule_id}", json=update_payload, headers=headers)
    assert res_update.status_code == 200
    updated_data = res_update.json()
    assert updated_data["name"] == "Updated Test Rule"
    assert updated_data["is_active"] is False

    # 4. Delete Rule
    res_del = await client.delete(f"/api/automations/{rule_id}", headers=headers)
    assert res_del.status_code == 204

    # Verify Deletion
    res_list_after = await client.get("/api/automations", headers=headers)
    rules_after = res_list_after.json()
    assert not any(r["id"] == rule_id for r in rules_after)

@pytest.mark.asyncio
async def test_execute_automations_logic(db_session: AsyncSession):
    # This tests the engine itself
    from backend.app.routers.automations import execute_automations
    from backend.app.models import User, Issue, AutomationRule
    import uuid

    # Create dummy user
    user_id = str(uuid.uuid4())
    user = User(id=user_id, email=f"{user_id}@test.com", api_key=f"testkey-{user_id}")
    db_session.add(user)
    await db_session.commit()

    # Create an automation rule
    rule = AutomationRule(
        user_id=user_id,
        name="Test Engine Rule",
        trigger_type="webhook.failed",
        condition_field=None,
        condition_value=None,
        action_type="create_issue",
        action_target="proj-abc"
    )
    db_session.add(rule)
    await db_session.commit()

    # Execute
    context = {
        "endpoint_id": "end-123",
        "issue_title": "Test Title Engine",
        "issue_description": "Test Desc Engine"
    }
    await execute_automations(db_session, user_id, "webhook.failed", context)

    # Verify Issue was created
    res = await db_session.execute(select(Issue).where(Issue.user_id == user_id, Issue.title == "Test Title Engine"))
    issues = res.scalars().all()
    assert len(issues) == 1
    assert issues[0].project_id == "proj-abc"
