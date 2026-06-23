import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_user_registration_and_login(client: AsyncClient):
    # 1. Register a new user
    register_payload = {
        "email": "testauth@example.com",
        "password": "strongpassword123"
    }
    res = await client.post("/api/auth/register", json=register_payload)
    assert res.status_code == 201
    data = res.json()
    assert "api_key" in data
    assert data["email"] == "testauth@example.com"
    api_key = data["api_key"]

    # 2. Try to register with the same email (should fail)
    res_dup = await client.post("/api/auth/register", json=register_payload)
    assert res_dup.status_code == 400

    # 3. Login with correct credentials
    login_payload = {
        "email": "testauth@example.com",
        "password": "strongpassword123"
    }
    res_login = await client.post("/api/auth/login", json=login_payload)
    assert res_login.status_code == 200
    login_data = res_login.json()
    assert login_data["api_key"] == api_key

    # 4. Login with incorrect password
    bad_login_payload = {
        "email": "testauth@example.com",
        "password": "wrongpassword"
    }
    res_bad_login = await client.post("/api/auth/login", json=bad_login_payload)
    assert res_bad_login.status_code == 401

@pytest.mark.asyncio
async def test_rotate_api_key(client: AsyncClient):
    # Register user
    register_payload = {
        "email": "testrotate@example.com",
        "password": "password123"
    }
    res = await client.post("/api/auth/register", json=register_payload)
    data = res.json()
    old_api_key = data["api_key"]

    # Rotate Key
    res_rotate = await client.post("/api/auth/rotate-key", headers={"Authorization": f"Bearer {old_api_key}"})
    assert res_rotate.status_code == 200
    new_data = res_rotate.json()
    new_api_key = new_data["api_key"]
    
    assert new_api_key != old_api_key
    assert len(new_api_key) > 10

    # Verify old key no longer works
    res_old = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_api_key}"})
    assert res_old.status_code == 401

    # Verify new key works
    res_new = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_api_key}"})
    assert res_new.status_code == 200
    assert res_new.json()["email"] == "testrotate@example.com"
