import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.db import get_db
from backend.app.models import User
from backend.app.schemas import AuthResponse

router = APIRouter(prefix="/api/oauth", tags=["oauth"])

# These should be in your .env file
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")

@router.get("/login/{provider}")
async def oauth_login(provider: str):
    if provider == "google":
        if not GOOGLE_CLIENT_ID:
            print("[OAUTH WARNING] GOOGLE_CLIENT_ID is missing in .env. Redirecting to mock callback.")
            mock_callback_url = "http://localhost:8000/api/oauth/callback/google?code=mock_dev_code"
            return RedirectResponse(url=mock_callback_url)
        # In a real app, generate the proper OAuth2 URL with scopes
        redirect_uri = "http://localhost:8000/api/oauth/callback/google"
        return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?client_id={GOOGLE_CLIENT_ID}&redirect_uri={redirect_uri}&response_type=code&scope=email profile")
        
    elif provider == "github":
        if not GITHUB_CLIENT_ID:
            print("[OAUTH WARNING] GITHUB_CLIENT_ID is missing in .env. Redirecting to mock callback.")
            mock_callback_url = "http://localhost:8000/api/oauth/callback/github?code=mock_dev_code"
            return RedirectResponse(url=mock_callback_url)
        redirect_uri = "http://localhost:8000/api/oauth/callback/github"
        return RedirectResponse(url=f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&redirect_uri={redirect_uri}&scope=user:email")
        
    raise HTTPException(status_code=400, detail="Unsupported provider")

@router.get("/callback/{provider}")
async def oauth_callback(provider: str, code: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Mock implementation of the OAuth callback.
    In a real app, you would exchange the `code` for an access token using httpx,
    then fetch the user's email and profile info from the provider's API.
    """
    
    # --- MOCK LOGIC FOR DEMONSTRATION ---
    # Since we don't have actual client secrets to exchange the code,
    # we will simulate a successful OAuth login for a mock user.
    mock_email = f"developer@{provider}.mock"
    mock_provider_id = f"{provider}_{uuid.uuid4().hex[:8]}"
    mock_avatar = f"https://api.dicebear.com/7.x/avataaars/svg?seed={mock_email}"

    # Find or create user
    result = await db.execute(select(User).where(User.email == mock_email))
    user = result.scalars().first()
    
    if not user:
        api_key = f"hs_{uuid.uuid4().hex}"
        user = User(
            id=str(uuid.uuid4()),
            email=mock_email,
            api_key=api_key,
            auth_provider=provider,
            provider_id=mock_provider_id,
            avatar_url=mock_avatar,
            tier="free"
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Set secure cookie
    # Since this is a direct browser redirect, we set the cookie on the domain
    response = RedirectResponse(url="http://localhost:3000/")
    response.set_cookie(
        key="hookshield_session", 
        value=user.api_key, 
        httponly=True, 
        max_age=86400 * 7, 
        samesite="lax",
        path="/"
    )
    
    return response
