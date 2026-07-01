import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from backend.app.limiter import limiter
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import bcrypt
from backend.app.db import get_db
from backend.app.models import User
from backend.app.schemas import AuthRegister, AuthLogin, AuthResponse, AuthConnect, ForgotPasswordRequest, ResetPasswordRequest
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import BackgroundTasks
import smtplib
from email.mime.text import MIMEText
from backend.app.config import settings
router = APIRouter(prefix="/api/auth", tags=["auth"])

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")



@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register_user(request: Request, response: Response, payload: AuthRegister, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == payload.email))
    existing_user = result.scalars().first()
    
    if existing_user:
        # If they were auto-registered (no password hash yet), let them complete registration by setting a password
        if not existing_user.password_hash:
            hashed_password = get_password_hash(payload.password)
            existing_user.password_hash = hashed_password
            db.add(existing_user)
            await db.commit()
            await db.refresh(existing_user)
            response.set_cookie(key="hookshield_session", value=existing_user.api_key, httponly=True, max_age=86400 * 7, samesite="lax")
            return AuthResponse(api_key=existing_user.api_key, email=existing_user.email, auth_provider=existing_user.auth_provider, avatar_url=existing_user.avatar_url)
        else:
            raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed_password = get_password_hash(payload.password)
    api_key = f"hs_{uuid.uuid4().hex}"
    
    new_user = User(
        id=str(uuid.uuid4()),
        email=payload.email,
        password_hash=hashed_password,
        api_key=api_key,
        tier="free"
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    response.set_cookie(key="hookshield_session", value=new_user.api_key, httponly=True, max_age=86400 * 7, samesite="lax")
    return AuthResponse(api_key=new_user.api_key, email=new_user.email, auth_provider=new_user.auth_provider, avatar_url=new_user.avatar_url)

@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
async def login_user(request: Request, response: Response, payload: AuthLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        
    if not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    response.set_cookie(key="hookshield_session", value=user.api_key, httponly=True, max_age=86400 * 7, samesite="lax")
    return AuthResponse(api_key=user.api_key, email=user.email, auth_provider=user.auth_provider, avatar_url=user.avatar_url)


@router.post("/connect", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def connect_user(request: Request, response: Response, payload: AuthConnect, db: AsyncSession = Depends(get_db)):
    """
    Connect with email or API key.
    - If identifier contains '@': treat as email, auto-register if new, return API key
    - If identifier starts with 'hs_': treat as API key, validate and return user
    """
    identifier = payload.identifier.strip()
    
    if "@" in identifier:
        # Email flow
        result = await db.execute(select(User).where(User.email == identifier))
        user = result.scalars().first()
        
        if not user:
            # Auto-register new user
            api_key = f"hs_{uuid.uuid4().hex}"
            user = User(
                id=str(uuid.uuid4()),
                email=identifier,
                api_key=api_key,
                tier="free"
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        response.set_cookie(key="hookshield_session", value=user.api_key, httponly=True, max_age=86400 * 7, samesite="lax")
        return AuthResponse(api_key=user.api_key, email=user.email, auth_provider=user.auth_provider, avatar_url=user.avatar_url)
    
    elif identifier.startswith("hs_"):
        # API key flow
        result = await db.execute(select(User).where(User.api_key == identifier))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid API key")
        response.set_cookie(key="hookshield_session", value=user.api_key, httponly=True, max_age=86400 * 7, samesite="lax")
        return AuthResponse(api_key=user.api_key, email=user.email, auth_provider=user.auth_provider, avatar_url=user.avatar_url)
    
    else:
        raise HTTPException(status_code=400, detail="Invalid identifier: provide email or API key (starting with hs_)")


from backend.app.routers.endpoints import get_current_user

@router.get("/me", response_model=AuthResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return AuthResponse(api_key=current_user.api_key, email=current_user.email, auth_provider=current_user.auth_provider, avatar_url=current_user.avatar_url)


import uuid

@router.post("/rotate-key", response_model=AuthResponse)
@limiter.limit("5/minute")
async def rotate_api_key(request: Request, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Generate new api_key
    new_api_key = str(uuid.uuid4())
    current_user.api_key = new_api_key
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return AuthResponse(api_key=new_api_key, email=current_user.email)


def send_reset_email(to_email: str, token: str):
    reset_link = f"http://localhost:3000/?token={token}"
    print(f"[MAIL LOG] Password reset link for {to_email}: {reset_link}")
    
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print("[SMTP WARNING] SMTP_USER or SMTP_PASSWORD is not configured in .env. Falling back to console log.")
        return False
        
    msg = MIMEText(
        f"Hello,\n\n"
        f"You requested to reset your password on HookShield.\n"
        f"Please click the link below to set a new password:\n\n"
        f"{reset_link}\n\n"
        f"This link will expire in 1 hour.\n\n"
        f"If you did not request this, please ignore this email."
    )
    msg['Subject'] = "Reset your HookShield Password"
    msg['From'] = settings.SMTP_FROM
    msg['To'] = to_email

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        print(f"[SMTP SUCCESS] Real email sent to {to_email}")
        return True
    except Exception as e:
        print(f"[SMTP ERROR] Failed to send email via SMTP to {to_email}: {e}")
        return False

@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def forgot_password(request: Request, payload: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalars().first()
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(user)
        await db.commit()
        
        # Dispatch email in background so API response remains fast
        background_tasks.add_task(send_reset_email, user.email, token)
    
    # Always return a generic message to prevent user enumeration
    return {"message": "If an account with that email exists, a password reset link has been sent."}

@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def reset_password(request: Request, payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.reset_token == payload.token))
    user = result.scalars().first()
    
    # SQLite naive datetimes returned by sqlalchemy might lack tzinfo, handle it properly
    now = datetime.now(timezone.utc)
    # Convert reset_token_expires to aware datetime if it is naive
    expires = user.reset_token_expires if user else None
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if not user or not expires or expires < now:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
        
    user.password_hash = get_password_hash(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    
    # Optionally rotate API key for security
    user.api_key = f"hs_{uuid.uuid4().hex}"
    
    db.add(user)
    await db.commit()
    return {"message": "Password has been successfully reset."}
